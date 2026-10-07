import { Prisma, PrismaClient } from "@prisma/client";
import { AuditService } from "@/finance/audit/audit.service";
import {
  CreateFinancialPlanVersionInput,
  CreateCostItemInput,
  CreateFundingSourceInput,
} from "./types";

export class ProjectPlanningService {
  /**
   * Create a new versioned financial plan for a project.
   * Preserves historical estimation decisions without overwriting.
   */
  static async createPlanVersion(
    tx: Prisma.TransactionClient,
    input: CreateFinancialPlanVersionInput
  ) {
    if (input.estimatedTotalCost < 0) {
      throw new Error("Estimated total cost must be non-negative");
    }

    const project = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
      include: { financialPlans: { orderBy: { version: "desc" } } },
    });
    if (!project) {
      throw new Error("Project not found in this household");
    }

    const currentVersion = project.financialPlans[0]?.version || 0;
    const nextVersion = currentVersion + 1;

    // Mark existing plans as SUPERSEDED
    await tx.projectFinancialPlan.updateMany({
      where: { projectId: input.projectId, planningStatus: "ACTIVE" },
      data: { planningStatus: "SUPERSEDED" },
    });

    const newPlan = await tx.projectFinancialPlan.create({
      data: {
        projectId: input.projectId,
        householdId: input.householdId,
        version: nextVersion,
        estimatedTotalCost: new Prisma.Decimal(input.estimatedTotalCost),
        planningStatus: "ACTIVE",
        notes: input.notes || null,
        reason: input.reason || null,
        createdByUserId: input.userId || null,
      },
    });

    // Update project version pointer
    await tx.project.update({
      where: { id: input.projectId },
      data: { version: nextVersion },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT_PLAN",
      entityId: newPlan.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      metadata: {
        projectId: input.projectId,
        version: nextVersion,
        estimatedTotalCost: input.estimatedTotalCost,
        reason: input.reason || null,
      },
    });

    return newPlan;
  }

  /**
   * Add a planned Cost Item breakdown component to the Project.
   */
  static async addCostItem(
    tx: Prisma.TransactionClient,
    input: CreateCostItemInput
  ) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Cost item name is required");
    }
    if (input.plannedAmount < 0) {
      throw new Error("Planned amount must be non-negative");
    }

    const project = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
    });
    if (!project) {
      throw new Error("Project not found in this household");
    }

    if (input.categoryId) {
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, householdId: input.householdId },
      });
      if (!category) {
        throw new Error("Category not found in this household");
      }
    }

    const item = await tx.projectCostItem.create({
      data: {
        projectId: input.projectId,
        householdId: input.householdId,
        name: input.name.trim(),
        description: input.description || null,
        plannedAmount: new Prisma.Decimal(input.plannedAmount),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        categoryId: input.categoryId || null,
        priority: input.priority || "MEDIUM",
        status: "PLANNED",
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT_COST",
      entityId: item.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      metadata: {
        projectId: input.projectId,
        name: item.name,
        plannedAmount: input.plannedAmount,
      },
    });

    return item;
  }

  /**
   * Add a Funding Source channel to the Project.
   * Strictly separates PLANNED funding from COMMITTED / RECEIVED cash.
   */
  static async addFundingSource(
    tx: Prisma.TransactionClient,
    input: CreateFundingSourceInput
  ) {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Funding source name is required");
    }
    if (input.plannedAmount < 0) {
      throw new Error("Planned funding amount must be non-negative");
    }

    const project = await tx.project.findFirst({
      where: { id: input.projectId, householdId: input.householdId },
    });
    if (!project) {
      throw new Error("Project not found in this household");
    }

    // Server-side ownership verification for any linked entities
    if (input.linkedAccountId) {
      const acc = await tx.account.findFirst({
        where: { id: input.linkedAccountId, householdId: input.householdId },
      });
      if (!acc) throw new Error("Linked account not found in this household");
    }

    if (input.linkedBorrowingId) {
      const b = await tx.borrowing.findFirst({
        where: { id: input.linkedBorrowingId, householdId: input.householdId },
      });
      if (!b) throw new Error("Linked borrowing not found in this household");
    }

    if (input.linkedInvestmentId) {
      const inv = await tx.investment.findFirst({
        where: { id: input.linkedInvestmentId, householdId: input.householdId },
      });
      if (!inv) throw new Error("Linked investment not found in this household");
    }

    if (input.linkedAssetId) {
      const ast = await tx.asset.findFirst({
        where: { id: input.linkedAssetId, householdId: input.householdId },
      });
      if (!ast) throw new Error("Linked asset not found in this household");
    }

    if (input.linkedGoalId) {
      const g = await tx.goal.findFirst({
        where: { id: input.linkedGoalId, householdId: input.householdId },
      });
      if (!g) throw new Error("Linked goal not found in this household");
    }

    const funding = await tx.projectFundingSource.create({
      data: {
        projectId: input.projectId,
        householdId: input.householdId,
        sourceType: input.sourceType,
        name: input.name.trim(),
        plannedAmount: new Prisma.Decimal(input.plannedAmount),
        committedAmount: new Prisma.Decimal(input.committedAmount || 0),
        receivedAmount: new Prisma.Decimal(input.receivedAmount || 0),
        status: (input.receivedAmount && input.receivedAmount > 0) ? "RECEIVED" : (input.committedAmount && input.committedAmount > 0) ? "COMMITTED" : "PLANNED",
        notes: input.notes || null,
        linkedAccountId: input.linkedAccountId || null,
        linkedBorrowingId: input.linkedBorrowingId || null,
        linkedInvestmentId: input.linkedInvestmentId || null,
        linkedAssetId: input.linkedAssetId || null,
        linkedGoalId: input.linkedGoalId || null,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "PROJECT_FUNDING",
      entityId: funding.id,
      action: "CREATE",
      actorUserId: input.userId || null,
      metadata: {
        projectId: input.projectId,
        sourceType: funding.sourceType,
        name: funding.name,
        plannedAmount: input.plannedAmount,
      },
    });

    return funding;
  }
}
