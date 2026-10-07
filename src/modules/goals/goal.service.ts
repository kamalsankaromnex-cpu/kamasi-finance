import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { GoalLifecycle, GoalStatus } from "@/finance/lifecycle/goal-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";
import { FinancialForecastingService, GoalFundingResult } from "@/finance/forecasting/forecasting.service";

export interface CreateGoalInput {
  householdId: string;
  userId: string;
  name: string;
  targetAmount: Prisma.Decimal;
  currentAmount?: Prisma.Decimal;
  targetDate: Date;
  description?: string | null;
  priority?: string | null;
  category?: string | null;
  accountId?: string | null;
  notes?: string | null;
  monthlyContribution?: Prisma.Decimal | null;
}

export class GoalDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Goal lifecycle transitions and financial actions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      goalId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.goalLifecycleHistory.create({
      data: {
        goalId: params.goalId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        reason: params.reason || null,
        performedBy: params.performedBy || null,
      },
    });

    const auditActionMap: Record<string, AuditActionType> = {
      CREATE: "CREATE",
      UPDATE: "UPDATE",
      PAUSE: "PAUSE",
      RESUME: "RESUME",
      CONTRIBUTE: "CONTRIBUTION",
      WITHDRAW: "WITHDRAWAL",
      COMPLETE: "COMPLETE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "GOAL",
      entityId: params.goalId,
      action: mappedAction,
      fromState: params.fromStatus,
      toState: params.toStatus,
      actorUserId: params.performedBy || "SYSTEM",
      reason: params.reason || null,
      metadata: params.metadata || null,
    });

    return history;
  }

  /**
   * Create a new Goal in ACTIVE status.
   */
  static async createGoal(tx: Prisma.TransactionClient, input: CreateGoalInput) {
    if (input.targetAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Goal target amount must be positive");
    }

    const initialAmount = input.currentAmount || new Prisma.Decimal(0);
    if (initialAmount.isNegative()) {
      throw new Error("INVALID_AMOUNT: Current amount cannot be negative");
    }

    const isCompleted = initialAmount.gte(input.targetAmount);
    const initialStatus: GoalStatus = isCompleted ? "COMPLETED" : "ACTIVE";

    const goal = await tx.goal.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        targetAmount: input.targetAmount,
        currentAmount: initialAmount,
        targetDate: input.targetDate,
        description: input.description || null,
        priority: input.priority || "MEDIUM",
        category: input.category || null,
        accountId: input.accountId || null,
        notes: input.notes || null,
        monthlyContribution: input.monthlyContribution || new Prisma.Decimal(0),
        status: initialStatus,
      },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: goal.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: initialStatus,
      action: "CREATE",
      performedBy: input.userId,
    });

    return goal;
  }

  /**
   * Update an existing active Goal.
   */
  static async updateGoal(
    tx: Prisma.TransactionClient,
    params: {
      goalId: string;
      householdId: string;
      userId: string;
      data: Partial<CreateGoalInput>;
    }
  ) {
    const existing = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!existing) throw new Error("GOAL_NOT_FOUND");

    if (!GoalLifecycle.canEdit(existing.status as GoalStatus)) {
      throw new Error(`INVALID_TRANSITION: Cannot edit goal in ${existing.status} status`);
    }

    if (params.data.targetAmount !== undefined && params.data.targetAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Target amount must be positive");
    }

    const updateData: Prisma.GoalUpdateInput = {};
    if (params.data.name !== undefined) updateData.name = params.data.name;
    if (params.data.targetAmount !== undefined) updateData.targetAmount = params.data.targetAmount;
    if (params.data.targetDate !== undefined) updateData.targetDate = params.data.targetDate;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.priority !== undefined && params.data.priority !== null) updateData.priority = params.data.priority;
    if (params.data.category !== undefined) updateData.category = params.data.category;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;
    if (params.data.monthlyContribution !== undefined) updateData.monthlyContribution = params.data.monthlyContribution;
    if (params.data.accountId !== undefined) {
      updateData.account = params.data.accountId ? { connect: { id: params.data.accountId } } : { disconnect: true };
    }

    let updated = await tx.goal.update({
      where: { id: existing.id },
      data: updateData,
    });

    // Auto-complete if target updated below or equal to currentAmount
    if (updated.status === "ACTIVE" && updated.currentAmount.gte(updated.targetAmount)) {
      updated = await tx.goal.update({
        where: { id: existing.id },
        data: { status: "COMPLETED" },
      });
      await this.recordLifecycleHistory(tx, {
        goalId: updated.id,
        householdId: params.householdId,
        fromStatus: "ACTIVE",
        toStatus: "COMPLETED",
        action: "COMPLETE",
        reason: "Target amount reached via target update",
        performedBy: params.userId,
      });
    } else {
      await this.recordLifecycleHistory(tx, {
        goalId: updated.id,
        householdId: params.householdId,
        fromStatus: existing.status,
        toStatus: updated.status,
        action: "UPDATE",
        performedBy: params.userId,
      });
    }

    return updated;
  }

  /**
   * Pause an ACTIVE goal.
   */
  static async pauseGoal(
    tx: Prisma.TransactionClient,
    params: { goalId: string; householdId: string; userId: string }
  ) {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    GoalLifecycle.assertCanTransition(goal.status as GoalStatus, "PAUSED", "pause");

    const paused = await tx.goal.update({
      where: { id: goal.id },
      data: { status: "PAUSED" },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: paused.id,
      householdId: params.householdId,
      fromStatus: goal.status,
      toStatus: "PAUSED",
      action: "PAUSE",
      performedBy: params.userId,
    });

    return paused;
  }

  /**
   * Resume a PAUSED goal back to ACTIVE.
   */
  static async resumeGoal(
    tx: Prisma.TransactionClient,
    params: { goalId: string; householdId: string; userId: string }
  ) {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    GoalLifecycle.assertCanTransition(goal.status as GoalStatus, "ACTIVE", "resume");

    const resumed = await tx.goal.update({
      where: { id: goal.id },
      data: { status: "ACTIVE" },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: resumed.id,
      householdId: params.householdId,
      fromStatus: goal.status,
      toStatus: "ACTIVE",
      action: "RESUME",
      performedBy: params.userId,
    });

    return resumed;
  }

  /**
   * Deposit/Contribute savings to an ACTIVE goal.
   */
  static async depositToGoal(
    tx: Prisma.TransactionClient,
    params: {
      goalId: string;
      householdId: string;
      userId: string;
      accountId?: string | null;
      amount: Prisma.Decimal;
      idempotencyKey?: string | null;
    }
  ) {
    if (params.idempotencyKey) {
      const existingTx = await tx.transaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existingTx) {
        if (existingTx.householdId !== params.householdId) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_CROSS_HOUSEHOLD");
        }
        const goal = await tx.goal.findUniqueOrThrow({ where: { id: params.goalId } });
        return { goal, transaction: existingTx };
      }
    }

    if (params.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Contribution amount must be positive");
    }

    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    GoalLifecycle.assertCanTransition(goal.status as GoalStatus, "ACTIVE", "contribute");
    if (!GoalLifecycle.canContribute(goal.status as GoalStatus)) {
      throw new Error(`GOAL_NOT_ACTIVE: Cannot contribute to goal in ${goal.status} status`);
    }

    let transaction = null;
    if (params.accountId) {
      const account = await tx.account.findFirst({
        where: { id: params.accountId, householdId: params.householdId, isArchived: false },
      });
      if (!account) throw new Error("ACCOUNT_UNAVAILABLE: Account not found in household");

      const journal = await FinancialCommand.postGoalContribution(tx, {
        householdId: params.householdId,
        accountId: params.accountId,
        goalName: goal.name,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
      });

      transaction = await tx.transaction.create({
        data: {
          householdId: params.householdId,
          accountId: params.accountId,
          userId: params.userId,
          idempotencyKey: params.idempotencyKey || null,
          amount: params.amount,
          type: "EXPENSE",
          description: `Goal Savings Allocation: ${goal.name}`,
          tags: "savings-goal,allocation",
          date: new Date(),
          journalId: journal.id,
        },
      });
    }

    // Increment currentAmount
    const newAmount = goal.currentAmount.add(params.amount);
    const isReached = newAmount.gte(goal.targetAmount);
    const newStatus: GoalStatus = isReached ? "COMPLETED" : "ACTIVE";

    const updatedGoal = await tx.goal.update({
      where: { id: goal.id },
      data: {
        currentAmount: newAmount,
        status: newStatus,
      },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: updatedGoal.id,
      householdId: params.householdId,
      fromStatus: goal.status,
      toStatus: newStatus,
      action: "CONTRIBUTE",
      reason: `Contributed ${params.amount}${isReached ? ' (Target Reached)' : ''}`,
      performedBy: params.userId,
    });

    return { goal: updatedGoal, transaction };
  }

  /**
   * Withdraw savings from an ACTIVE goal using ATOMIC conditional check.
   */
  static async withdrawFromGoal(
    tx: Prisma.TransactionClient,
    params: {
      goalId: string;
      householdId: string;
      userId: string;
      accountId?: string | null;
      amount: Prisma.Decimal;
      idempotencyKey?: string | null;
    }
  ) {
    if (params.idempotencyKey) {
      const existingTx = await tx.transaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existingTx) {
        if (existingTx.householdId !== params.householdId) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_CROSS_HOUSEHOLD");
        }
        const goal = await tx.goal.findUniqueOrThrow({ where: { id: params.goalId } });
        return { goal, transaction: existingTx };
      }
    }

    if (params.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Withdrawal amount must be positive");
    }

    // 1. Atomic conditional update to decrement goal balance safely against race conditions
    const updateResult = await tx.goal.updateMany({
      where: {
        id: params.goalId,
        householdId: params.householdId,
        status: "ACTIVE",
        currentAmount: { gte: params.amount },
      },
      data: { currentAmount: { decrement: params.amount } },
    });

    if (updateResult.count === 0) {
      const existing = await tx.goal.findFirst({ where: { id: params.goalId, householdId: params.householdId } });
      if (!existing) throw new Error("GOAL_NOT_FOUND");
      if (existing.status !== "ACTIVE") throw new Error(`GOAL_NOT_ACTIVE: Cannot withdraw from goal in ${existing.status} status`);
      throw new Error(`WITHDRAWAL_EXCEEDS_BALANCE: Requested ${params.amount}, available ${existing.currentAmount}`);
    }

    const goal = await tx.goal.findUniqueOrThrow({ where: { id: params.goalId } });

    let transaction = null;
    if (params.accountId) {
      const account = await tx.account.findFirst({
        where: { id: params.accountId, householdId: params.householdId, isArchived: false },
      });
      if (!account) throw new Error("ACCOUNT_UNAVAILABLE: Account not found in household");

      const journal = await FinancialCommand.postGoalWithdrawal(tx, {
        householdId: params.householdId,
        accountId: params.accountId,
        goalName: goal.name,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
      });

      transaction = await tx.transaction.create({
        data: {
          householdId: params.householdId,
          accountId: params.accountId,
          userId: params.userId,
          idempotencyKey: params.idempotencyKey || null,
          amount: params.amount,
          type: "INCOME",
          description: `Goal Savings Withdrawal: ${goal.name}`,
          tags: "savings-goal,withdrawal",
          date: new Date(),
          journalId: journal.id,
        },
      });
    }

    await this.recordLifecycleHistory(tx, {
      goalId: goal.id,
      householdId: params.householdId,
      fromStatus: "ACTIVE",
      toStatus: "ACTIVE",
      action: "WITHDRAW",
      reason: `Withdrew ${params.amount}`,
      performedBy: params.userId,
    });

    return { goal, transaction };
  }

  /**
   * Mark a goal COMPLETED.
   * Allowed ONLY when currentAmount >= targetAmount.
   */
  static async completeGoal(
    tx: Prisma.TransactionClient,
    params: { goalId: string; householdId: string; userId: string }
  ) {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    GoalLifecycle.assertCanTransition(goal.status as GoalStatus, "COMPLETED", "complete");

    if (goal.currentAmount.lt(goal.targetAmount)) {
      throw new Error(`GOAL_TARGET_NOT_REACHED: Cannot complete goal. Current amount (${goal.currentAmount}) has not reached target (${goal.targetAmount})`);
    }

    const completed = await tx.goal.update({
      where: { id: goal.id },
      data: { status: "COMPLETED" },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: completed.id,
      householdId: params.householdId,
      fromStatus: goal.status,
      toStatus: "COMPLETED",
      action: "COMPLETE",
      performedBy: params.userId,
    });

    return completed;
  }

  /**
   * Soft archive a goal record.
   */
  static async archiveGoal(
    tx: Prisma.TransactionClient,
    params: { goalId: string; householdId: string; userId: string }
  ) {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    GoalLifecycle.assertCanTransition(goal.status as GoalStatus, "ARCHIVED", "archive");

    const archived = await tx.goal.update({
      where: { id: goal.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: archived.id,
      householdId: params.householdId,
      fromStatus: goal.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId,
    });

    return archived;
  }

  /**
   * Restore an ARCHIVED goal back to its previous status.
   */
  static async restoreGoal(
    tx: Prisma.TransactionClient,
    params: { goalId: string; householdId: string; userId: string }
  ) {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");
    if (goal.status !== "ARCHIVED") throw new Error("GOAL_NOT_ARCHIVED");

    const lastHistory = await tx.goalLifecycleHistory.findFirst({
      where: { goalId: goal.id, toStatus: "ARCHIVED" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus = (lastHistory?.fromStatus && lastHistory.fromStatus !== "NONE" ? lastHistory.fromStatus : "ACTIVE") as GoalStatus;

    const restored = await tx.goal.update({
      where: { id: goal.id },
      data: {
        status: previousStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      goalId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: previousStatus,
      action: "RESTORE",
      performedBy: params.userId,
    });

    return restored;
  }

  /**
   * Goal Funding v1: Retrieve deterministic funding planning evaluation.
   * Allows planning overrides (what-if scenarios) without modifying the database.
   * Completely read-only with respect to the ledger and accounting core.
   */
  static async getGoalFunding(
    tx: Prisma.TransactionClient,
    params: {
      goalId: string;
      householdId: string;
      overrides?: {
        currentAvailable?: number;
        monthlyContribution?: number;
        targetDate?: string | Date;
        startDate?: string | Date;
      };
    }
  ): Promise<GoalFundingResult & { goal: any }> {
    const goal = await tx.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
      include: { account: true, scope: true },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    const targetAmount = Number(goal.targetAmount);
    const currentAvailable =
      params.overrides?.currentAvailable !== undefined
        ? Number(params.overrides.currentAvailable)
        : Number(goal.currentAmount);

    const monthlyContribution =
      params.overrides?.monthlyContribution !== undefined
        ? Number(params.overrides.monthlyContribution)
        : Number(goal.monthlyContribution || 0);

    const targetDate = params.overrides?.targetDate || goal.targetDate;
    const startDate = params.overrides?.startDate || new Date();

    const fundingPlan = FinancialForecastingService.calculateGoalFundingPlan({
      targetAmount,
      currentAvailable,
      monthlyContribution,
      targetDate,
      startDate,
    });

    return {
      ...fundingPlan,
      goal,
    };
  }
}
