import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { TransactionLifecycle, TransactionStatus } from "@/finance/lifecycle/transaction-lifecycle";

export interface TransactionInput {
  householdId: string;
  userId: string;
  accountId: string;
  amount: Prisma.Decimal;
  categoryId?: string | null;
  description: string;
  type?: "EXPENSE" | "INCOME" | "TRANSFER";
  date?: Date;
  tags?: string;
  notes?: string;
  idempotencyKey?: string | null;
  transferAccountId?: string | null;
}

export class TransactionDomainService {
  /**
   * Helper to record audit history for lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
    }
  ) {
    return await tx.transactionLifecycleHistory.create({
      data: {
        transactionId: params.transactionId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        reason: params.reason || null,
        performedBy: params.performedBy || null,
      },
    });
  }

  /**
   * Create an unposted DRAFT transaction.
   * Does NOT post a financial journal or alter Account.balance.
   */
  static async createDraft(tx: Prisma.TransactionClient, input: TransactionInput) {
    const transaction = await tx.transaction.create({
      data: {
        householdId: input.householdId,
        userId: input.userId,
        accountId: input.accountId,
        transferAccountId: input.transferAccountId || null,
        categoryId: input.categoryId || null,
        amount: input.amount,
        type: input.type || "EXPENSE",
        description: input.description,
        date: input.date || new Date(),
        tags: input.tags || null,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
        status: "DRAFT",
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: transaction.id,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE_DRAFT",
      performedBy: input.userId,
    });

    return transaction;
  }

  /**
   * Update a DRAFT transaction.
   * Permitted ONLY when transaction status === "DRAFT".
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      householdId: string;
      userId: string;
      data: Partial<TransactionInput>;
    }
  ) {
    const existing = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!existing) throw new Error("TRANSACTION_NOT_FOUND");

    // Enforce DRAFT immutability rule
    TransactionLifecycle.assertCanTransition(existing.status as TransactionStatus, "DRAFT", "edit");
    if (!TransactionLifecycle.canEdit(existing.status as TransactionStatus)) {
      throw new Error(`CANNOT_EDIT_POSTED_TRANSACTION: Transaction in ${existing.status} status is immutable. Use reversal + replacement.`);
    }

    const updateData: Prisma.TransactionUpdateInput = {};
    if (params.data.amount !== undefined) updateData.amount = params.data.amount;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.date !== undefined) updateData.date = params.data.date;
    if (params.data.categoryId !== undefined) updateData.category = params.data.categoryId ? { connect: { id: params.data.categoryId } } : { disconnect: true };
    if (params.data.accountId !== undefined) updateData.account = { connect: { id: params.data.accountId } };
    if (params.data.transferAccountId !== undefined) updateData.transferAccount = params.data.transferAccountId ? { connect: { id: params.data.transferAccountId } } : { disconnect: true };
    if (params.data.tags !== undefined) updateData.tags = params.data.tags;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;

    const updated = await tx.transaction.update({
      where: { id: existing.id },
      data: updateData,
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: updated.id,
      fromStatus: "DRAFT",
      toStatus: "DRAFT",
      action: "UPDATE_DRAFT",
      performedBy: params.userId,
    });

    return updated;
  }

  /**
   * Post a DRAFT transaction to the double-entry ledger via FinancialCommand.
   */
  static async postDraft(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; householdId: string; userId: string }
  ) {
    const transaction = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

    TransactionLifecycle.assertCanTransition(transaction.status as TransactionStatus, "POSTED", "post");

    let journal;
    if (transaction.type === "INCOME") {
      journal = await FinancialCommand.postIncome(tx, {
        householdId: transaction.householdId,
        accountId: transaction.accountId,
        amount: transaction.amount,
        description: transaction.description,
        categoryId: transaction.categoryId,
        date: transaction.date,
        idempotencyKey: transaction.idempotencyKey,
      });
    } else if (transaction.type === "TRANSFER") {
      if (!transaction.transferAccountId) throw new Error("DESTINATION_ACCOUNT_REQUIRED");
      journal = await FinancialCommand.postTransfer(tx, {
        householdId: transaction.householdId,
        sourceAccountId: transaction.accountId,
        destinationAccountId: transaction.transferAccountId,
        amount: transaction.amount,
        description: transaction.description,
        date: transaction.date,
        idempotencyKey: transaction.idempotencyKey,
      });
    } else {
      journal = await FinancialCommand.postExpense(tx, {
        householdId: transaction.householdId,
        accountId: transaction.accountId,
        amount: transaction.amount,
        description: transaction.description,
        categoryId: transaction.categoryId,
        date: transaction.date,
        idempotencyKey: transaction.idempotencyKey,
      });
    }

    const posted = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        journalId: journal.id,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: posted.id,
      fromStatus: transaction.status,
      toStatus: "POSTED",
      action: "POST",
      performedBy: params.userId,
    });

    return posted;
  }

  /**
   * Process EXPENSE transaction directly (creates & posts immediately).
   */
  static async createExpense(tx: Prisma.TransactionClient, input: TransactionInput) {
    const draft = await this.createDraft(tx, { ...input, type: "EXPENSE" });
    return await this.postDraft(tx, { transactionId: draft.id, householdId: input.householdId, userId: input.userId });
  }

  /**
   * Process INCOME transaction directly (creates & posts immediately).
   */
  static async createIncome(tx: Prisma.TransactionClient, input: TransactionInput) {
    const draft = await this.createDraft(tx, { ...input, type: "INCOME" });
    return await this.postDraft(tx, { transactionId: draft.id, householdId: input.householdId, userId: input.userId });
  }

  /**
   * Process TRANSFER transaction directly (creates & posts immediately).
   */
  static async createTransfer(tx: Prisma.TransactionClient, input: TransactionInput) {
    const draft = await this.createDraft(tx, { ...input, type: "TRANSFER" });
    return await this.postDraft(tx, { transactionId: draft.id, householdId: input.householdId, userId: input.userId });
  }

  /**
   * Reconcile a POSTED transaction.
   * Updates business status to RECONCILED without altering Account.balance or posting a second journal.
   */
  static async reconcileTransaction(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; householdId: string; userId: string }
  ) {
    const transaction = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

    TransactionLifecycle.assertCanTransition(transaction.status as TransactionStatus, "RECONCILED", "reconcile");

    const reconciled = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "RECONCILED",
        reconciledAt: new Date(),
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: reconciled.id,
      fromStatus: transaction.status,
      toStatus: "RECONCILED",
      action: "RECONCILE",
      performedBy: params.userId,
    });

    return reconciled;
  }

  /**
   * Reverse a POSTED or RECONCILED transaction.
   * Posts compensating reversal journal, sets status="REVERSED", and optionally posts a replacement transaction.
   */
  static async reverseTransaction(
    tx: Prisma.TransactionClient,
    params: {
      transactionId: string;
      householdId: string;
      userId: string;
      reason?: string;
      replacementData?: TransactionInput;
    }
  ) {
    const transaction = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
    if (transaction.isVoided || transaction.status === "REVERSED") {
      throw new Error("TRANSACTION_ALREADY_VOIDED");
    }

    TransactionLifecycle.assertCanTransition(transaction.status as TransactionStatus, "REVERSED", "reverse");

    if (!transaction.journalId) {
      throw new Error("CANNOT_REVERSE_UNPOSTED_TRANSACTION");
    }

    // 1. Post compensating reversal journal via LedgerService (swaps debits/credits, original journal untouched)
    await LedgerService.reverseJournal(tx, transaction.journalId, params.householdId);

    // 2. Mark original transaction as REVERSED
    let replacementTxnId: string | null = null;
    let replacementTxn = null;

    // 3. Create replacement transaction with its own independent journal if requested
    if (params.replacementData) {
      const newDraft = await this.createDraft(tx, params.replacementData);
      replacementTxn = await this.postDraft(tx, {
        transactionId: newDraft.id,
        householdId: params.householdId,
        userId: params.userId,
      });
      replacementTxnId = replacementTxn.id;
    }

    const reversed = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "REVERSED",
        isVoided: true,
        reversedAt: new Date(),
        voidedAt: new Date(),
        voidedByUserId: params.userId,
        replacementTransactionId: replacementTxnId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: reversed.id,
      fromStatus: transaction.status,
      toStatus: "REVERSED",
      action: "REVERSE",
      reason: params.reason || "Reversal executed",
      performedBy: params.userId,
    });

    return { reversed, replacement: replacementTxn };
  }

  /**
   * Soft archive a transaction without deleting Journal, JournalEntry, or audit history.
   */
  static async archiveTransaction(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; householdId: string; userId: string }
  ) {
    const transaction = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

    TransactionLifecycle.assertCanTransition(transaction.status as TransactionStatus, "ARCHIVED", "archive");

    const archived = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: archived.id,
      fromStatus: transaction.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId,
    });

    return archived;
  }

  /**
   * Restore an ARCHIVED transaction back to its previous business status.
   */
  static async restoreTransaction(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; householdId: string; userId: string }
  ) {
    const transaction = await tx.transaction.findFirst({
      where: { id: params.transactionId, householdId: params.householdId },
    });
    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
    if (transaction.status !== "ARCHIVED") throw new Error("TRANSACTION_NOT_ARCHIVED");

    // Determine previous status from history
    const lastHistory = await tx.transactionLifecycleHistory.findFirst({
      where: { transactionId: transaction.id, toStatus: "ARCHIVED" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus = (lastHistory?.fromStatus && lastHistory.fromStatus !== "NONE" ? lastHistory.fromStatus : "POSTED") as TransactionStatus;

    const restored = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: previousStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: restored.id,
      fromStatus: "ARCHIVED",
      toStatus: previousStatus,
      action: "RESTORE",
      performedBy: params.userId,
    });

    return restored;
  }

  /**
   * Compatibility alias for voidTransaction delegating to reverseTransaction.
   */
  static async voidTransaction(
    tx: Prisma.TransactionClient,
    params: { transactionId: string; householdId: string; voidedByUserId: string }
  ) {
    const res = await this.reverseTransaction(tx, {
      transactionId: params.transactionId,
      householdId: params.householdId,
      userId: params.voidedByUserId,
    });
    return res.reversed;
  }
}
