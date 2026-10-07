import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { LiabilityLifecycle, LiabilityStatus } from "@/finance/lifecycle/liability-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export interface CreateDraftLiabilityInput {
  householdId: string;
  userId?: string | null;
  name: string;
  category?: string;
  type?: string;
  description?: string | null;
  principalAmount: Prisma.Decimal;
  interestRate?: Prisma.Decimal;
  startDate?: Date | null;
  dueDate?: Date | null;
  lender?: string | null;
  liabilityAccountId?: string | null;
  notes?: string | null;
}

export class LiabilityDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Liability lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      liabilityId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.liabilityLifecycleHistory.create({
      data: {
        liabilityId: params.liabilityId,
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
      BORROW: "BORROW",
      REPAY: "REPAYMENT",
      ACCURE_INTEREST: "INTEREST_ACCRUED",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "LIABILITY",
      entityId: params.liabilityId,
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
   * Create an unposted DRAFT Liability.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async createDraft(tx: Prisma.TransactionClient, input: CreateDraftLiabilityInput) {
    if (input.principalAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Liability principal amount must be positive");
    }

    const liability = await tx.liability.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        category: input.category || "OTHER",
        type: input.type || "OTHER",
        status: "DRAFT",
        description: input.description || null,
        principalAmount: input.principalAmount,
        outstandingAmount: input.principalAmount,
        interestRate: input.interestRate || new Prisma.Decimal(0),
        startDate: input.startDate || null,
        dueDate: input.dueDate || null,
        lender: input.lender || null,
        liabilityAccountId: input.liabilityAccountId || null,
        notes: input.notes || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      liabilityId: liability.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE",
      performedBy: input.userId || null,
    });

    return liability;
  }

  /**
   * Update DRAFT, ACTIVE, or PARTIALLY_SETTLED liability metadata.
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      liabilityId: string;
      householdId: string;
      userId?: string | null;
      data: Partial<CreateDraftLiabilityInput>;
    }
  ) {
    const existing = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!existing) throw new Error("LIABILITY_NOT_FOUND");

    if (!LiabilityLifecycle.canEdit(existing.status as LiabilityStatus)) {
      throw new Error(`CANNOT_EDIT_LIABILITY: Liability in ${existing.status} status cannot be edited.`);
    }

    const updateData: Prisma.LiabilityUpdateInput = {};
    if (params.data.name !== undefined) updateData.name = params.data.name;
    if (params.data.category !== undefined) updateData.category = params.data.category;
    if (params.data.type !== undefined) updateData.type = params.data.type;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;
    if (params.data.lender !== undefined) updateData.lender = params.data.lender;
    if (params.data.interestRate !== undefined) updateData.interestRate = params.data.interestRate;
    if (params.data.dueDate !== undefined) updateData.dueDate = params.data.dueDate;

    const updated = await tx.liability.update({
      where: { id: existing.id },
      data: updateData,
    });

    await this.recordLifecycleHistory(tx, {
      liabilityId: updated.id,
      householdId: params.householdId,
      fromStatus: existing.status,
      toStatus: updated.status,
      action: "UPDATE",
      performedBy: params.userId || null,
    });

    return updated;
  }

  /**
   * Borrow Liability: Transition DRAFT -> ACTIVE.
   * Posts double-entry journal via FinancialCommand.postLiabilityBorrow.
   * Debits Receiving Bank Account / Credits Liability Account.
   */
  static async borrowLiability(
    tx: Prisma.TransactionClient,
    params: {
      liabilityId: string;
      householdId: string;
      userId?: string | null;
      principalAmount?: Prisma.Decimal;
      receivingAccountId?: string | null;
      liabilityAccountId?: string | null;
      effectiveDate?: Date;
      idempotencyKey?: string | null;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingEvent = await tx.liabilityFinancialEvent.findFirst({
        where: {
          liabilityId: params.liabilityId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const liability = await tx.liability.findUniqueOrThrow({ where: { id: params.liabilityId } });
        return { liability, financialEvent: existingEvent };
      }
    }

    const liability = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    LiabilityLifecycle.assertCanTransition(liability.status as LiabilityStatus, "ACTIVE", "borrow");

    const borrowAmt = params.principalAmount || liability.principalAmount;
    if (borrowAmt.lte(0)) {
      throw new Error("INVALID_AMOUNT: Liability borrowing amount must be positive");
    }

    const liabAccId = params.liabilityAccountId || liability.liabilityAccountId;

    // 2. Post Financial Command
    const journal = await FinancialCommand.postLiabilityBorrow(tx, {
      householdId: params.householdId,
      liabilityName: liability.name,
      principalAmount: borrowAmt,
      receivingAccountId: params.receivingAccountId || null,
      liabilityAccountId: liabAccId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 3. Create LiabilityFinancialEvent Record
    const financialEvent = await tx.liabilityFinancialEvent.create({
      data: {
        liabilityId: liability.id,
        householdId: params.householdId,
        eventType: "BORROW",
        principalAmount: borrowAmt,
        interestAmount: new Prisma.Decimal(0),
        totalAmount: borrowAmt,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: `Borrowed ${liability.name}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 4. Update Liability to ACTIVE
    const updatedLiability = await tx.liability.update({
      where: { id: liability.id },
      data: {
        status: "ACTIVE",
        principalAmount: borrowAmt,
        outstandingAmount: borrowAmt,
        startDate: params.effectiveDate || new Date(),
        liabilityAccountId: liabAccId || null,
        borrowJournalId: journal.id,
      },
    });

    // 5. Audit Logging
    await this.recordLifecycleHistory(tx, {
      liabilityId: updatedLiability.id,
      householdId: params.householdId,
      fromStatus: liability.status,
      toStatus: "ACTIVE",
      action: "BORROW",
      reason: `Borrowed ${borrowAmt}`,
      performedBy: params.userId || null,
    });

    return { liability: updatedLiability, financialEvent, journal };
  }

  /**
   * Repay Liability: Transition ACTIVE/PARTIALLY_SETTLED -> PARTIALLY_SETTLED or SETTLED.
   * Enforces principal validation boundary: requestedPrincipal <= outstandingAmount.
   * Auto-settles to SETTLED when outstandingAmount becomes 0.
   */
  static async repayLiability(
    tx: Prisma.TransactionClient,
    params: {
      liabilityId: string;
      householdId: string;
      userId?: string | null;
      principalAmount: Prisma.Decimal;
      interestAmount?: Prisma.Decimal;
      payingAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingEvent = await tx.liabilityFinancialEvent.findFirst({
        where: {
          liabilityId: params.liabilityId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const liability = await tx.liability.findUniqueOrThrow({ where: { id: params.liabilityId } });
        return { liability, financialEvent: existingEvent };
      }
    }

    const liability = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    if (!LiabilityLifecycle.canRepay(liability.status as LiabilityStatus)) {
      throw new Error(`CANNOT_REPAY_LIABILITY: Liability in status ${liability.status} cannot accept repayments.`);
    }

    const prinAmt = params.principalAmount;
    const intAmt = params.interestAmount || new Prisma.Decimal(0);

    if (prinAmt.lt(0) || intAmt.lt(0)) {
      throw new Error("INVALID_AMOUNT: Repayment principal and interest amounts cannot be negative.");
    }
    if (prinAmt.isZero() && intAmt.isZero()) {
      throw new Error("INVALID_AMOUNT: Repayment total amount must be positive.");
    }

    // Validation boundary check
    if (prinAmt.gt(liability.outstandingAmount)) {
      throw new Error(
        `INVALID_REPAYMENT_AMOUNT: Principal repayment (${prinAmt}) exceeds current outstanding amount (${liability.outstandingAmount}).`
      );
    }

    const totalAmt = prinAmt.add(intAmt);

    // 2. Post Financial Command
    let journal;
    if (intAmt.gt(0)) {
      journal = await FinancialCommand.postLiabilityEMI(tx, {
        householdId: params.householdId,
        liabilityName: liability.name,
        principalAmount: prinAmt,
        interestAmount: intAmt,
        payingAccountId: params.payingAccountId || null,
        liabilityAccountId: liability.liabilityAccountId,
        idempotencyKey: params.idempotencyKey || null,
      });
    } else {
      journal = await FinancialCommand.postLiabilityRepayment(tx, {
        householdId: params.householdId,
        liabilityName: liability.name,
        principalAmount: prinAmt,
        payingAccountId: params.payingAccountId || null,
        liabilityAccountId: liability.liabilityAccountId,
        idempotencyKey: params.idempotencyKey || null,
      });
    }

    // 3. Compute new outstanding amount and auto-settlement status
    const newOutstanding = liability.outstandingAmount.sub(prinAmt);
    const newStatus: LiabilityStatus = newOutstanding.isZero() ? "SETTLED" : "PARTIALLY_SETTLED";

    LiabilityLifecycle.assertCanTransition(liability.status as LiabilityStatus, newStatus, "repay");

    // 4. Create LiabilityFinancialEvent
    const financialEvent = await tx.liabilityFinancialEvent.create({
      data: {
        liabilityId: liability.id,
        householdId: params.householdId,
        eventType: "REPAYMENT",
        principalAmount: prinAmt,
        interestAmount: intAmt,
        totalAmount: totalAmt,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Repayment for ${liability.name}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 5. Update Liability
    const updatedLiability = await tx.liability.update({
      where: { id: liability.id },
      data: {
        outstandingAmount: newOutstanding,
        status: newStatus,
      },
    });

    // 6. Audit Logging
    await this.recordLifecycleHistory(tx, {
      liabilityId: updatedLiability.id,
      householdId: params.householdId,
      fromStatus: liability.status,
      toStatus: newStatus,
      action: "REPAY",
      reason: params.reason || `Repaid principal ${prinAmt}, interest ${intAmt}. Remaining: ${newOutstanding}`,
      performedBy: params.userId || null,
    });

    return { liability: updatedLiability, financialEvent, journal };
  }

  /**
   * Accrue Interest on Liability: Debit Interest Expense / Credit Interest Payable/Liability Account.
   * Does NOT reduce cash balance or principal balance directly.
   */
  static async accrueInterest(
    tx: Prisma.TransactionClient,
    params: {
      liabilityId: string;
      householdId: string;
      userId?: string | null;
      interestAmount: Prisma.Decimal;
      expenseAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    if (params.idempotencyKey) {
      const existingEvent = await tx.liabilityFinancialEvent.findFirst({
        where: {
          liabilityId: params.liabilityId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const liability = await tx.liability.findUniqueOrThrow({ where: { id: params.liabilityId } });
        return { liability, financialEvent: existingEvent };
      }
    }

    const liability = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    if (!LiabilityLifecycle.canAccrueInterest(liability.status as LiabilityStatus)) {
      throw new Error(`CANNOT_ACCRUE_INTEREST: Liability in status ${liability.status} cannot accrue interest.`);
    }

    if (params.interestAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Accrued interest amount must be positive.");
    }

    // 1. Post Financial Command
    const journal = await FinancialCommand.postLiabilityInterestAccrual(tx, {
      householdId: params.householdId,
      liabilityName: liability.name,
      interestAmount: params.interestAmount,
      liabilityAccountId: liability.liabilityAccountId,
      expenseAccountId: params.expenseAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 2. Create LiabilityFinancialEvent
    const financialEvent = await tx.liabilityFinancialEvent.create({
      data: {
        liabilityId: liability.id,
        householdId: params.householdId,
        eventType: "INTEREST_ACCRUED",
        principalAmount: new Prisma.Decimal(0),
        interestAmount: params.interestAmount,
        totalAmount: params.interestAmount,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Interest accrued for ${liability.name}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Audit Logging (status remains unchanged)
    await this.recordLifecycleHistory(tx, {
      liabilityId: liability.id,
      householdId: params.householdId,
      fromStatus: liability.status,
      toStatus: liability.status,
      action: "ACCURE_INTEREST",
      reason: params.reason || `Accrued interest ${params.interestAmount}`,
      performedBy: params.userId || null,
    });

    return { liability, financialEvent, journal };
  }

  /**
   * Archive Liability: ACTIVE / PARTIALLY_SETTLED / SETTLED -> ARCHIVED.
   */
  static async archiveLiability(
    tx: Prisma.TransactionClient,
    params: { liabilityId: string; householdId: string; userId?: string | null }
  ) {
    const liability = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    LiabilityLifecycle.assertCanTransition(liability.status as LiabilityStatus, "ARCHIVED", "archive");

    const archived = await tx.liability.update({
      where: { id: liability.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      liabilityId: archived.id,
      householdId: params.householdId,
      fromStatus: liability.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId || null,
    });

    return archived;
  }

  /**
   * Restore Liability: ARCHIVED -> Previous Valid Status.
   */
  static async restoreLiability(
    tx: Prisma.TransactionClient,
    params: { liabilityId: string; householdId: string; userId?: string | null }
  ) {
    const liability = await tx.liability.findFirst({
      where: { id: params.liabilityId, householdId: params.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    LiabilityLifecycle.assertCanTransition(liability.status as LiabilityStatus, "ACTIVE", "restore");

    let restoredStatus: LiabilityStatus = "ACTIVE";
    if (liability.outstandingAmount.isZero()) {
      restoredStatus = "SETTLED";
    } else if (liability.outstandingAmount.lt(liability.principalAmount)) {
      restoredStatus = "PARTIALLY_SETTLED";
    }

    const restored = await tx.liability.update({
      where: { id: liability.id },
      data: {
        status: restoredStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      liabilityId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: restoredStatus,
      action: "RESTORE",
      performedBy: params.userId || null,
    });

    return restored;
  }
}
