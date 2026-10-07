import { Prisma, PrismaClient } from "@prisma/client";
import { AuditService } from "@/finance/audit/audit.service";
import {
  CreateProjectInput,
  UpdateProjectInput,
  TransitionProjectStatusInput,
  ProjectStatus,
} from "./types";

export class ProjectDomainService {
  /**
   * Allowed lifecycle state machine transitions.
   */
  private static readonly ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
    DRAFT: ["PLANNED", "ACTIVE", "CANCELLED", "ARCHIVED"],
    PLANNED: ["ACTIVE", "ON_HOLD", "CANCELLED", "ARCHIVED"],
    ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"],
    ON_HOLD: ["ACTIVE", "CANCELLED", "ARCHIVED"],
    COMPLETED: ["ARCHIVED", "ACTIVE"],
    CANCELLED: ["ARCHIVED", "DRAFT"],
    ARCHIVED: ["DRAFT", "PLANNED", "ACTIVE"],
  };

  /**
   * Create a new Universal Project.
   * Planning operation: produces 0 journals and 0 account balance mutations.
   */
  static async createProject(
    tx: Prisma.TransactionClient,
    input: CreateProjectInput
  ) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Project name is required");
    }

    // Verify primaryGoal ownership if provided
    if (input.primaryGoalId) {
      const goal = await tx.goal.findFirst({
        where: { id: input.primaryGoalId, householdId: input.householdId },
      });
      if (!goal) {
        throw new Error("Linked primary goal not found or belongs to another household");
      }
    }

    const initialStatus: ProjectStatus = input.estimatedTotalCost && input.estimatedTotalCost > 0 ? "PLANNED" : "DRAFT";

    const project = await tx.project.create({
      data: {
        householdId: input.householdId,
        name: input.name.trim(),
        description: input.description || null,
        notes: input.notes || null,
        projectType: input.projectType || "PERSONAL",
        status: initialStatus,
        priority: input.priority || "MEDIUM",
        startDate: input.startDate ? new Date(input.startDate) : null,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        ownerMemberId: input.ownerMemberId || null,
        primaryGoalId: input.primaryGoalId || null,
      },
    });

    // Initial version 1 financial plan if estimated cost provided
    if (input.estimatedTotalCost && input.estimatedTotalCost > 0) {
      await tx.projectFinancialPlan.create({
        data: {
          projectId: project.id,
          householdId: input.householdId,
          version: 1,
          estimatedTotalCost: new Prisma.Decimal(input.estimatedTotalCost),
          planningStatus: "ACTIVE",
          notes: "Initial baseline estimation",
          createdByUserId: input.userId || null,
        },
      });
    }

    // Record Lifecycle history
    await tx.projectLifecycleHistory.create({
      data: {
        projectId: project.id,
        householdId: input.householdId,
        fromStatus: "NONE",
        toStatus: initialStatus,
        action: "CREATE",
        reason: "Project initialized",
        performedBy: input.userId || null,
      },
    });

    // Record tamper-evident audit event
    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT",
      entityId: project.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      toState: initialStatus,
      metadata: {
        name: project.name,
        projectType: project.projectType,
        estimatedTotalCost: input.estimatedTotalCost || 0,
      },
    });

    return project;
  }

  /**
   * Update Universal Project details.
   */
  static async updateProject(
    tx: Prisma.TransactionClient,
    input: UpdateProjectInput
  ) {
    const existing = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
    });
    if (!existing) {
      throw new Error("Project not found in this household");
    }

    if (existing.status === "ARCHIVED") {
      throw new Error("Cannot update an ARCHIVED project");
    }

    if (input.primaryGoalId) {
      const goal = await tx.goal.findFirst({
        where: { id: input.primaryGoalId, householdId: input.householdId },
      });
      if (!goal) {
        throw new Error("Linked primary goal not found or belongs to another household");
      }
    }

    const updated = await tx.project.update({
      where: { id: input.projectId },
      data: {
        name: input.name !== undefined ? input.name.trim() : undefined,
        description: input.description !== undefined ? input.description : undefined,
        notes: input.notes !== undefined ? input.notes : undefined,
        projectType: input.projectType !== undefined ? input.projectType : undefined,
        priority: input.priority !== undefined ? input.priority : undefined,
        startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
        targetDate: input.targetDate !== undefined ? (input.targetDate ? new Date(input.targetDate) : null) : undefined,
        ownerMemberId: input.ownerMemberId !== undefined ? input.ownerMemberId : undefined,
        primaryGoalId: input.primaryGoalId !== undefined ? input.primaryGoalId : undefined,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT",
      entityId: updated.id,
      action: "UPDATE",
      actorUserId: input.userId || null,
      metadata: {
        name: updated.name,
        projectType: updated.projectType,
      },
    });

    return updated;
  }

  /**
   * Transition Project Lifecycle Status with explicit validation.
   */
  static async transitionStatus(
    tx: Prisma.TransactionClient,
    input: TransitionProjectStatusInput
  ) {
    const existing = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
    });
    if (!existing) {
      throw new Error("Project not found in this household");
    }

    const currentStatus = existing.status as ProjectStatus;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(input.toStatus)) {
      throw new Error(`Invalid lifecycle transition from ${currentStatus} to ${input.toStatus}`);
    }

    const completedAt = input.toStatus === "COMPLETED" ? new Date() : existing.completedAt;

    const updated = await tx.project.update({
      where: { id: input.projectId },
      data: {
        status: input.toStatus,
        completedAt,
      },
    });

    await tx.projectLifecycleHistory.create({
      data: {
        projectId: updated.id,
        householdId: input.householdId,
        fromStatus: currentStatus,
        toStatus: input.toStatus,
        action: input.toStatus,
        reason: input.reason || null,
        performedBy: input.userId || null,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT",
      entityId: updated.id,
      action: "UPDATE",
      actorUserId: input.userId || null,
      fromState: currentStatus,
      toState: input.toStatus,
      reason: input.reason || null,
    });

    return updated;
  }
}
