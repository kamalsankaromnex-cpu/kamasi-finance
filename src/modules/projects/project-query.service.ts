import { Prisma, PrismaClient } from "@prisma/client";
import { ProjectFinancialSnapshot } from "./types";
import { ProjectHealthService } from "./project-health.service";

export class ProjectQueryService {
  /**
   * Aggregate a complete, read-only ProjectFinancialSnapshot DTO.
   * Strictly read-only: creates 0 journals and 0 mutations.
   */
  static async getProjectSnapshot(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    projectId: string
  ): Promise<ProjectFinancialSnapshot> {
    const project = await db.project.findFirst({
      where: { id: projectId, householdId },
      include: {
        financialPlans: { orderBy: { version: "desc" } },
        costItems: { include: { category: true } },
        payments: { include: { allocations: true } },
        fundingSources: true,
        tasks: { orderBy: { createdAt: "asc" } },
        milestones: { orderBy: { order: "asc" } },
        primaryGoal: true,
      },
    });

    if (!project) {
      throw new Error("Project not found in this household");
    }

    // 1. Plan & Cost Estimation
    const activePlan = project.financialPlans.find((p) => p.planningStatus === "ACTIVE") || project.financialPlans[0];
    const estimatedCost = activePlan ? Number(activePlan.estimatedTotalCost) : 0;

    // 2. Cost Items & Budget
    const budgetedAmount = project.costItems.reduce((sum, c) => sum + Number(c.plannedAmount), 0);

    // 3. Payment Commitments & Actual Paid
    let committedAmount = 0;
    let actualPaidAmount = 0;
    let overduePaymentsCount = 0;
    let dueSoonPaymentsCount = 0;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const paymentItems = project.payments.map((p) => {
      const planned = Number(p.plannedAmount);
      const committed = Number(p.committedAmount);
      const paid = Number(p.paidAmount);
      const remaining = Math.max(0, (committed > 0 ? committed : planned) - paid);

      committedAmount += committed;
      actualPaidAmount += paid;

      if (p.dueDate && p.status !== "PAID" && p.status !== "CANCELLED") {
        const due = new Date(p.dueDate);
        if (due < now) {
          overduePaymentsCount++;
        } else if (due <= in30Days) {
          dueSoonPaymentsCount++;
        }
      }

      return {
        id: p.id,
        name: p.name,
        dueDate: p.dueDate ? p.dueDate.toISOString().split("T")[0] : null,
        plannedAmount: Math.round(planned),
        committedAmount: Math.round(committed),
        paidAmount: Math.round(paid),
        remainingAmount: Math.round(remaining),
        status: p.status,
        allocationsCount: p.allocations.length,
      };
    });

    const remainingPlannedCost = Math.max(0, estimatedCost - actualPaidAmount);

    // 4. Funding Sources Breakdown
    let plannedFunding = 0;
    let securedFunding = 0;
    let totalReceived = 0;

    const fundingSources = project.fundingSources.map((f) => {
      const planned = Number(f.plannedAmount);
      const committed = Number(f.committedAmount);
      const received = Number(f.receivedAmount);

      plannedFunding += planned;
      // Secured is either committed or actually received
      securedFunding += Math.max(committed, received);
      totalReceived += received;

      return {
        id: f.id,
        sourceType: f.sourceType,
        name: f.name,
        plannedAmount: Math.round(planned),
        committedAmount: Math.round(committed),
        receivedAmount: Math.round(received),
        status: f.status,
        linkedBorrowingId: f.linkedBorrowingId,
        linkedAccountId: f.linkedAccountId,
        linkedInvestmentId: f.linkedInvestmentId,
        linkedAssetId: f.linkedAssetId,
        linkedGoalId: f.linkedGoalId,
      };
    });

    // Funding Gap = Future planned requirements - secured funding
    const fundingGap = Math.max(0, estimatedCost - securedFunding);

    // 5. Tasks & Progress
    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((t) => t.status === "COMPLETED").length;
    const blockedTasksCount = project.tasks.filter((t) => t.status === "BLOCKED").length;

    const executionProgressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const financialProgressPercent = estimatedCost > 0 ? Math.round((actualPaidAmount / estimatedCost) * 100) : 0;
    const fundingProgressPercent = estimatedCost > 0 ? Math.round((securedFunding / estimatedCost) * 100) : 0;

    // 6. Milestones
    const totalMilestones = project.milestones.length;
    const achievedMilestones = project.milestones.filter((m) => m.status === "ACHIEVED").length;

    // 7. Deterministic Health Evaluation
    const health = ProjectHealthService.evaluateHealth({
      estimatedCost,
      budgetedAmount,
      committedAmount,
      actualPaidAmount,
      securedFunding,
      plannedFunding,
      fundingGap,
      overduePaymentsCount,
      dueSoonPaymentsCount,
      blockedTasksCount,
      isProjectCompleted: project.status === "COMPLETED",
    });

    // 8. Linked Borrowings summary if any funding source is linked
    const linkedBorrowingIds = project.fundingSources
      .map((f) => f.linkedBorrowingId)
      .filter(Boolean) as string[];

    const borrowings = linkedBorrowingIds.length > 0
      ? await db.borrowing.findMany({
          where: { id: { in: linkedBorrowingIds }, householdId },
          select: { id: true, name: true, principalAmount: true, outstandingPrincipal: true, status: true },
        })
      : [];

    return {
      project: {
        id: project.id,
        householdId: project.householdId,
        name: project.name,
        description: project.description,
        projectType: project.projectType,
        status: project.status,
        priority: project.priority,
        startDate: project.startDate ? project.startDate.toISOString().split("T")[0] : null,
        targetDate: project.targetDate ? project.targetDate.toISOString().split("T")[0] : null,
        completedAt: project.completedAt ? project.completedAt.toISOString().split("T")[0] : null,
        version: project.version,
      },
      health,
      metrics: {
        estimatedCost: Math.round(estimatedCost),
        budgetedAmount: Math.round(budgetedAmount),
        committedAmount: Math.round(committedAmount),
        actualPaidAmount: Math.round(actualPaidAmount),
        remainingPlannedCost: Math.round(remainingPlannedCost),
        securedFunding: Math.round(securedFunding),
        plannedFunding: Math.round(plannedFunding),
        fundingGap: Math.round(fundingGap),
        executionProgressPercent,
        financialProgressPercent,
        fundingProgressPercent,
      },
      plan: {
        currentVersion: activePlan ? activePlan.version : 1,
        estimatedTotalCost: Math.round(estimatedCost),
        versionsCount: project.financialPlans.length,
      },
      funding: {
        totalPlanned: Math.round(plannedFunding),
        totalCommitted: Math.round(securedFunding),
        totalReceived: Math.round(totalReceived),
        sources: fundingSources,
      },
      payments: {
        totalPlanned: Math.round(paymentItems.reduce((s, p) => s + p.plannedAmount, 0)),
        totalCommitted: Math.round(committedAmount),
        totalPaid: Math.round(actualPaidAmount),
        totalRemaining: Math.round(paymentItems.reduce((s, p) => s + p.remainingAmount, 0)),
        items: paymentItems,
      },
      costItems: project.costItems.map((c) => ({
        id: c.id,
        name: c.name,
        plannedAmount: Math.round(Number(c.plannedAmount)),
        categoryName: c.category?.name,
        status: c.status,
        priority: c.priority,
      })),
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        items: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ? t.dueDate.toISOString().split("T")[0] : null,
        })),
      },
      milestones: {
        total: totalMilestones,
        achieved: achievedMilestones,
        items: project.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          targetDate: m.targetDate ? m.targetDate.toISOString().split("T")[0] : null,
          status: m.status,
          achievedAt: m.achievedAt ? m.achievedAt.toISOString().split("T")[0] : null,
        })),
      },
      linkedEntities: {
        goal: project.primaryGoal
          ? {
              id: project.primaryGoal.id,
              name: project.primaryGoal.name,
              targetAmount: Math.round(Number(project.primaryGoal.targetAmount)),
              currentAmount: Math.round(Number(project.primaryGoal.currentAmount)),
            }
          : null,
        borrowings: borrowings.map((b) => ({
          id: b.id,
          name: b.name,
          principal: Math.round(Number(b.principalAmount)),
          outstanding: Math.round(Number(b.outstandingPrincipal)),
          status: b.status,
        })),
      },
    };
  }

  /**
   * Check for multi-project funding claim conflicts or over-allocations.
   * Example: Account A has ₹5L available balance, but Project 1 claims ₹3L and Project 2 claims ₹4L.
   */
  static async checkFundingConflicts(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ): Promise<Array<{ accountId: string; accountName: string; availableBalance: number; totalClaimed: number; overAllocatedAmount: number }>> {
    const fundingClaims = await db.projectFundingSource.findMany({
      where: {
        householdId,
        linkedAccountId: { not: null },
        status: { in: ["PLANNED", "COMMITTED", "ALLOCATED"] },
      },
      include: { project: true },
    });

    const accountClaimsMap: Record<string, number> = {};
    for (const claim of fundingClaims) {
      if (claim.linkedAccountId) {
        accountClaimsMap[claim.linkedAccountId] = (accountClaimsMap[claim.linkedAccountId] || 0) + Number(claim.plannedAmount);
      }
    }

    const conflicts: Array<{ accountId: string; accountName: string; availableBalance: number; totalClaimed: number; overAllocatedAmount: number }> = [];

    for (const [accId, totalClaimed] of Object.entries(accountClaimsMap)) {
      const acc = await db.account.findFirst({
        where: { id: accId, householdId },
      });
      if (acc) {
        const bal = Number(acc.balance);
        if (totalClaimed > bal) {
          conflicts.push({
            accountId: acc.id,
            accountName: acc.name,
            availableBalance: Math.round(bal),
            totalClaimed: Math.round(totalClaimed),
            overAllocatedAmount: Math.round(totalClaimed - bal),
          });
        }
      }
    }

    return conflicts;
  }
}
