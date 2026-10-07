import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { TransferLifecycle, TransferStatus } from "@/finance/lifecycle/transfer-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export interface CreateTransferDraftInput {
  householdId: string;
  userId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Prisma.Decimal;
  description: string;
  date?: Date;
  tags?: string;
  notes?: string;
  idempotencyKey?: string | null;
}

export class TransferDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Transfer lifecycle transitions.
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
      POST: "TRANSFER_POSTED",
      REVERSE: "REVERSE",
      RECONCILE: "RECONCILE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "TRANSFER",
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
   * Create an unposted DRAFT transfer.
   * Account.balance remains UNCHANGED for both accounts (0 ledger activity).
   */
  static async createDraft(tx: Prisma.TransactionClient, input: CreateTransferDraftInput) {
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new Error("INVALID_TRANSFER_ACCOUNTS: Source and destination accounts must be different");
    }

    if (input.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Transfer amount must be positive");
    }

    // Verify both accounts belong to household
    const sourceAcc = await tx.account.findFirst({
      where: { id: input.sourceAccountId, householdId: input.householdId, isArchived: false },
    });
    if (!sourceAcc) throw new Error("ACCOUNT_UNAVAILABLE: Source account not found in household");

    const destAcc = await tx.account.findFirst({
      where: { id: input.destinationAccountId, householdId: input.householdId, isArchived: false },
    });
    if (!destAcc) throw new Error("ACCOUNT_UNAVAILABLE: Destination account not found in household");

    const transfer = await tx.transaction.create({
      data: {
        householdId: input.householdId,
        userId: input.userId,
        accountId: input.sourceAccountId,
        transferAccountId: input.destinationAccountId,
        amount: input.amount,
        type: "TRANSFER",
        description: input.description,
        date: input.date || new Date(),
        tags: input.tags || null,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
        status: "DRAFT",
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: transfer.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE_DRAFT",
      performedBy: input.userId,
    });

    return transfer;
  }

  /**
   * Update a DRAFT transfer.
   * Permitted ONLY when status === "DRAFT".
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      transferId: string;
      householdId: string;
      userId: string;
      data: Partial<CreateTransferDraftInput>;
    }
  ) {
    const existing = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!existing) throw new Error("TRANSFER_NOT_FOUND");

    TransferLifecycle.assertCanTransition(existing.status as TransferStatus, "DRAFT", "edit");
    if (!TransferLifecycle.canEdit(existing.status as TransferStatus)) {
      throw new Error(`CANNOT_EDIT_POSTED_TRANSFER: Transfer in ${existing.status} status is immutable. Use reversal.`);
    }

    const sourceAccountId = params.data.sourceAccountId || existing.accountId;
    const destinationAccountId = params.data.destinationAccountId || existing.transferAccountId;

    if (sourceAccountId === destinationAccountId) {
      throw new Error("INVALID_TRANSFER_ACCOUNTS: Source and destination accounts must be different");
    }

    if (params.data.amount !== undefined && params.data.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Transfer amount must be positive");
    }

    const updateData: Prisma.TransactionUpdateInput = {};
    if (params.data.amount !== undefined) updateData.amount = params.data.amount;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.date !== undefined) updateData.date = params.data.date;
    if (params.data.sourceAccountId !== undefined) updateData.account = { connect: { id: params.data.sourceAccountId } };
    if (params.data.destinationAccountId !== undefined) updateData.transferAccount = { connect: { id: params.data.destinationAccountId } };
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
   * Post a DRAFT transfer to double-entry ledger via FinancialCommand.
   * Decreases Source Account balance once, Increases Destination Account balance once.
   * Creates exactly 1 Journal and 2 JournalEntries.
   */
  static async postDraft(
    tx: Prisma.TransactionClient,
    params: { transferId: string; householdId: string; userId: string }
  ) {
    const transfer = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");

    TransferLifecycle.assertCanTransition(transfer.status as TransferStatus, "POSTED", "post");

    if (!transfer.transferAccountId) {
      throw new Error("INVALID_TRANSFER_ACCOUNTS: Destination account is missing");
    }

    if (transfer.accountId === transfer.transferAccountId) {
      throw new Error("INVALID_TRANSFER_ACCOUNTS: Source and destination accounts must be different");
    }

    if (transfer.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Transfer amount must be positive");
    }

    const journal = await FinancialCommand.postTransfer(tx, {
      householdId: transfer.householdId,
      sourceAccountId: transfer.accountId,
      destinationAccountId: transfer.transferAccountId,
      amount: transfer.amount,
      description: transfer.description,
      date: transfer.date,
      idempotencyKey: transfer.idempotencyKey,
    });

    const posted = await tx.transaction.update({
      where: { id: transfer.id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        journalId: journal.id,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: posted.id,
      householdId: params.householdId,
      fromStatus: transfer.status,
      toStatus: "POSTED",
      action: "POST",
      performedBy: params.userId,
    });

    return posted;
  }

  /**
   * Reconcile a transfer.
   * Updates status to RECONCILED without altering Account.balance or posting new journals.
   */
  static async reconcileTransfer(
    tx: Prisma.TransactionClient,
    params: { transferId: string; householdId: string; userId: string }
  ) {
    const transfer = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");

    TransferLifecycle.assertCanTransition(transfer.status as TransferStatus, "RECONCILED", "reconcile");

    const reconciled = await tx.transaction.update({
      where: { id: transfer.id },
      data: {
        status: "RECONCILED",
        reconciledAt: new Date(),
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: reconciled.id,
      householdId: params.householdId,
      fromStatus: transfer.status,
      toStatus: "RECONCILED",
      action: "RECONCILE",
      performedBy: params.userId,
    });

    return reconciled;
  }

  /**
   * Reverse a transfer via compensating reversal journal.
   * - Original Journal remains intact (marked VOIDED via reversal linkage).
   * - Restores Source Account balance, reduces Destination Account balance.
   * - Updates status to REVERSED.
   */
  static async reverseTransfer(
    tx: Prisma.TransactionClient,
    params: { transferId: string; householdId: string; userId: string }
  ) {
    const transfer = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");

    TransferLifecycle.assertCanTransition(transfer.status as TransferStatus, "REVERSED", "reverse");

    if (!transfer.journalId) {
      throw new Error("CANNOT_REVERSE_UNPOSTED_TRANSFER: Transfer does not have an attached journal");
    }

    const reversalJournal = await FinancialCommand.postReversal(tx, transfer.journalId, params.householdId);

    const reversed = await tx.transaction.update({
      where: { id: transfer.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        isVoided: true,
        voidedAt: new Date(),
        voidedByUserId: params.userId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: reversed.id,
      householdId: params.householdId,
      fromStatus: transfer.status,
      toStatus: "REVERSED",
      action: "REVERSE",
      reason: `Reversal journal ${reversalJournal.id} created`,
      performedBy: params.userId,
    });

    return reversed;
  }

  /**
   * Soft archive a transfer record.
   * Preserves historical journals, entries, and audit history.
   */
  static async archiveTransfer(
    tx: Prisma.TransactionClient,
    params: { transferId: string; householdId: string; userId: string }
  ) {
    const transfer = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");

    TransferLifecycle.assertCanTransition(transfer.status as TransferStatus, "ARCHIVED", "archive");

    const archived = await tx.transaction.update({
      where: { id: transfer.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId,
      },
    });

    await this.recordLifecycleHistory(tx, {
      transactionId: archived.id,
      householdId: params.householdId,
      fromStatus: transfer.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId,
    });

    return archived;
  }

  /**
   * Restore an ARCHIVED transfer back to its previous status.
   */
  static async restoreTransfer(
    tx: Prisma.TransactionClient,
    params: { transferId: string; householdId: string; userId: string }
  ) {
    const transfer = await tx.transaction.findFirst({
      where: { id: params.transferId, householdId: params.householdId, type: "TRANSFER" },
    });
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
    if (transfer.status !== "ARCHIVED") throw new Error("TRANSFER_NOT_ARCHIVED");

    const lastHistory = await tx.transactionLifecycleHistory.findFirst({
      where: { transactionId: transfer.id, toStatus: "ARCHIVED" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus = (lastHistory?.fromStatus && lastHistory.fromStatus !== "NONE" ? lastHistory.fromStatus : "POSTED") as TransferStatus;

    const restored = await tx.transaction.update({
      where: { id: transfer.id },
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
