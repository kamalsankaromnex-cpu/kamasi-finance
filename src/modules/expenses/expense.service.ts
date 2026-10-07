import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { ExpenseLifecycle, ExpenseStatus } from "@/finance/lifecycle/expense-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export interface ExpenseInput {
  householdId: string;
  userId: string;
  accountId: string;
  amount: Prisma.Decimal;
  categoryId?: string | null;
  description: string;
  date?: Date;
  tags?: string;
  notes?: string;
  idempotencyKey?: string | null;
}

export class ExpenseDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Expense lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.transactionLifecycleHistory.create({
      data: {
        transactionId: params.transactionId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        reason: params.reason || null,
        performedBy: params.performedBy || null,
      },
    });

    const auditActionMap: Record<string, AuditActionType> = {
      CREATE_DRAFT: "CREATE",
      UPDATE_DRAFT: "UPDATE",
      POST: "POST",
      REFUND: "REFUND",
      RECONCILE: "RECONCILE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "EXPENSE",
      entityId: params.transactionId,
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
   * Create an unposted DRAFT expense.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async createDraft(tx: Prisma.TransactionClient, input: ExpenseInput) {
    const expense = await tx.transaction.create({
      data: {
        householdId: input.householdId,
        userId: input.userId,
        accountId: input.accountId,
        categoryId: input.categoryId || null,
        amount: input.amount,
        type: "EXPENSE",
        description: input.description,
        date: input.date || new Date(),
        tags: input.tags || null,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
        status: "DRAFT",
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: expense.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE_DRAFT",
      performedBy: input.userId,
    });

    return expense;
  }

  /**
   * Update a DRAFT expense.
   * Permitted ONLY when status === "DRAFT".
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      expenseId: string;
      householdId: string;
      userId: string;
      data: Partial<ExpenseInput>;
    }
  ) {
    const existing = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!existing) throw new Error("EXPENSE_NOT_FOUND");

    ExpenseLifecycle.assertCanTransition(existing.status as ExpenseStatus, "DRAFT", "edit");
    if (!ExpenseLifecycle.canEdit(existing.status as ExpenseStatus)) {
      throw new Error(`CANNOT_EDIT_POSTED_EXPENSE: Expense in ${existing.status} status is immutable. Use reversal/refund.`);
    }

    const updateData: Prisma.TransactionUpdateInput = {};
    if (params.data.amount !== undefined) updateData.amount = params.data.amount;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.date !== undefined) updateData.date = params.data.date;
    if (params.data.categoryId !== undefined) updateData.category = params.data.categoryId ? { connect: { id: params.data.categoryId } } : { disconnect: true };
    if (params.data.accountId !== undefined) updateData.account = { connect: { id: params.data.accountId } };
    if (params.data.tags !== undefined) updateData.tags = params.data.tags;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;

    const updated = await tx.transaction.update({
      where: { id: existing.id },
      data: updateData,
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: updated.id,
      householdId: params.householdId,
      fromStatus: "DRAFT",
      toStatus: "DRAFT",
      action: "UPDATE_DRAFT",
      performedBy: params.userId,
    });

    return updated;
  }

  /**
   * Post a DRAFT expense to double-entry ledger via FinancialCommand.
   * Account.balance decreases ONCE! Original Journal created!
   */
  static async postDraft(
    tx: Prisma.TransactionClient,
    params: { expenseId: string; householdId: string; userId: string }
  ) {
    const expense = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!expense) throw new Error("EXPENSE_NOT_FOUND");

    ExpenseLifecycle.assertCanTransition(expense.status as ExpenseStatus, "POSTED", "post");

    const journal = await FinancialCommand.postExpense(tx, {
      householdId: expense.householdId,
      accountId: expense.accountId,
      amount: expense.amount,
      description: expense.description,
      categoryId: expense.categoryId,
      date: expense.date,
      idempotencyKey: expense.idempotencyKey,
    });

    const posted = await tx.transaction.update({
      where: { id: expense.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        journalId: journal.id,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: posted.id,
      householdId: params.householdId,
      fromStatus: expense.status,
      toStatus: "POSTED",
      action: "POST",
      performedBy: params.userId,
    });

    return posted;
  }

  /**
   * Process a refund on a POSTED or PARTIALLY_REFUNDED expense.
   * - Original Journal remains 100% UNTOUCHED.
   * - Separate Refund Transaction + New Refund Journal created.
   * - Authoritative sum of refunds validated: Total Refunds <= Original Expense.
   * - Status transitions to PARTIALLY_REFUNDED or REFUNDED.
   */
  static async refundExpense(
    tx: Prisma.TransactionClient,
    params: {
      expenseId: string;
      householdId: string;
      userId: string;
      amount: Prisma.Decimal;
      description?: string;
      idempotencyKey?: string;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingRefund = await tx.transaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existingRefund) {
        if (existingRefund.householdId !== params.householdId) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_CROSS_HOUSEHOLD");
        }
        return existingRefund;
      }
    }

    const expense = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!expense) throw new Error("EXPENSE_NOT_FOUND");

    ExpenseLifecycle.assertCanTransition(expense.status as ExpenseStatus, "PARTIALLY_REFUNDED", "refund");

    // 2. Compute authoritative sum of existing successful refunds
    const existingRefunds = await tx.transaction.findMany({
      where: { refundOfId: expense.id, isVoided: false },
    });
    const currentTotalRefunded = existingRefunds.reduce(
      (sum, r) => sum.add(r.amount),
      new Prisma.Decimal(0)
    );

    const maxAllowedRefund = expense.amount.sub(currentTotalRefunded);
    if (params.amount.gt(maxAllowedRefund)) {
      throw new Error(`REFUND_EXCEEDS_MAX:${maxAllowedRefund}`);
    }

    // 3. Post Financial Command for refund (Original Journal untouched, new Refund Journal posted)
    const refundJournal = await FinancialCommand.postRefund(tx, {
      householdId: params.householdId,
      accountId: expense.accountId,
      amount: params.amount,
      description: params.description?.trim() || `Refund for: ${expense.description}`,
      refundOfId: expense.id,
      idempotencyKey: params.idempotencyKey,
    });

    // 4. Create separate Refund Transaction record
    const refundTxn = await tx.transaction.create({
      data: {
        householdId: params.householdId,
        accountId: expense.accountId,
        categoryId: expense.categoryId,
        userId: params.userId,
        idempotencyKey: params.idempotencyKey || null,
        date: new Date(),
        amount: params.amount,
        type: "INCOME",
        refundOfId: expense.id,
        description: params.description?.trim() || `Refund for: ${expense.description}`,
        journalId: refundJournal.id,
      },
    });

    // 5. Update original expense status and cached refundedAmount projection
    const newTotalRefunded = currentTotalRefunded.add(params.amount);
    const newStatus: ExpenseStatus = newTotalRefunded.equals(expense.amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";

    await tx.transaction.update({
      where: { id: expense.id },
      data: {
        status: newStatus,
        refundedAmount: newTotalRefunded,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: expense.id,
      householdId: params.householdId,
      fromStatus: expense.status,
      toStatus: newStatus,
      action: "REFUND",
      reason: `Refund of ${params.amount} processed`,
      performedBy: params.userId,
    });

    return refundTxn;
  }

  /**
   * Reconcile an expense.
   * Updates status to RECONCILED without altering Account.balance or posting journals.
   */
  static async reconcileExpense(
    tx: Prisma.TransactionClient,
    params: { expenseId: string; householdId: string; userId: string }
  ) {
    const expense = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!expense) throw new Error("EXPENSE_NOT_FOUND");

    ExpenseLifecycle.assertCanTransition(expense.status as ExpenseStatus, "RECONCILED", "reconcile");

    const reconciled = await tx.transaction.update({
      where: { id: expense.id },
      data: {
        status: "RECONCILED",
        reconciledAt: new Date(),
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: reconciled.id,
      householdId: params.householdId,
      fromStatus: expense.status,
      toStatus: "RECONCILED",
      action: "RECONCILE",
      performedBy: params.userId,
    });

    return reconciled;
  }

  /**
   * Soft archive an expense record.
   * Preserves historical journals, entries, and audit history.
   */
  static async archiveExpense(
    tx: Prisma.TransactionClient,
    params: { expenseId: string; householdId: string; userId: string }
  ) {
    const expense = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!expense) throw new Error("EXPENSE_NOT_FOUND");

    ExpenseLifecycle.assertCanTransition(expense.status as ExpenseStatus, "ARCHIVED", "archive");

    const archived = await tx.transaction.update({
      where: { id: expense.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: archived.id,
      householdId: params.householdId,
      fromStatus: expense.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId,
    });

    return archived;
  }

  /**
   * Restore an ARCHIVED expense back to its previous status.
   */
  static async restoreExpense(
    tx: Prisma.TransactionClient,
    params: { expenseId: string; householdId: string; userId: string }
  ) {
    const expense = await tx.transaction.findFirst({
      where: { id: params.expenseId, householdId: params.householdId, type: "EXPENSE" },
    });
    if (!expense) throw new Error("EXPENSE_NOT_FOUND");
    if (expense.status !== "ARCHIVED") throw new Error("EXPENSE_NOT_ARCHIVED");

    const lastHistory = await tx.transactionLifecycleHistory.findFirst({
      where: { transactionId: expense.id, toStatus: "ARCHIVED" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus = (lastHistory?.fromStatus && lastHistory.fromStatus !== "NONE" ? lastHistory.fromStatus : "POSTED") as ExpenseStatus;

    const restored = await tx.transaction.update({
      where: { id: expense.id },
      data: {
        status: previousStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: previousStatus,
      action: "RESTORE",
      performedBy: params.userId,
    });

    return restored;
  }
}
