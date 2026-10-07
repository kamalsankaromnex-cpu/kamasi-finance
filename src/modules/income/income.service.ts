import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { IncomeLifecycle, IncomeStatus } from "@/finance/lifecycle/income-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export interface CreateIncomeSourceInput {
  householdId: string;
  name: string;
  category: "SALARY" | "BUSINESS" | "AGRICULTURE" | "SERICULTURE" | "LIVESTOCK" | "RENTAL" | "FREELANCE" | "INTEREST" | "DIVIDEND" | "OTHER" | string;
  categoryId?: string | null;
  description?: string | null;
  defaultAccountId?: string | null;
  expectedAmount?: Prisma.Decimal | null;
  currency?: string;
  behavior?: string;
  frequency?: string;
  expectedDay?: number;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
}

export interface CreateExpectedIncomeInput {
  householdId: string;
  incomeSourceId: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  expectedAmount: Prisma.Decimal;
  grossAmount?: Prisma.Decimal;
  deductionsAmount?: Prisma.Decimal;
  taxWithheld?: Prisma.Decimal;
  netAmount?: Prisma.Decimal;
  notes?: string;
  userId?: string;
}

export class IncomeDomainService {
  /**
   * Record audit history entry and central AuditEvent for Income lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      incomeOccurrenceId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.incomeLifecycleHistory.create({
      data: {
        incomeOccurrenceId: params.incomeOccurrenceId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        reason: params.reason || null,
        performedBy: params.performedBy || null,
      },
    });

    const auditActionMap: Record<string, AuditActionType> = {
      CREATE: "CREATE",
      CREATE_EXPECTED: "CREATE",
      CREATE_SOURCE: "CREATE",
      CONFIRM: "CONFIRM",
      CREDIT: "CREDIT",
      RECONCILE: "RECONCILE",
      CANCEL: "CANCEL",
      REVERSE: "REVERSE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "INCOME",
      entityId: params.incomeOccurrenceId,
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
   * Create an Income Source entity representing a recurring or one-time stream.
   */
  static async createSource(tx: Prisma.TransactionClient, input: CreateIncomeSourceInput) {
    const source = await tx.incomeSource.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        category: input.category,
        categoryId: input.categoryId || null,
        description: input.description || null,
        defaultAccountId: input.defaultAccountId || null,
        expectedAmount: input.expectedAmount || null,
        currency: input.currency || "INR",
        behavior: input.behavior || "RECURRING",
        frequency: input.frequency || "MONTHLY",
        expectedDay: input.expectedDay ?? 1,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      },
    });

    await AuditService.record(tx, {
      householdId: input.householdId,
      entityType: "INCOME_SOURCE",
      entityId: source.id,
      action: "CREATE",
      fromState: "NONE",
      toState: "ACTIVE",
      actorUserId: input.userId || "SYSTEM",
      reason: `Created Income Source: ${input.name} (${input.category})`,
    });

    return source;
  }

  /**
   * Create EXPECTED income record.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async createExpected(tx: Prisma.TransactionClient, input: CreateExpectedIncomeInput) {
    const incomeSource = await tx.incomeSource.findFirst({
      where: { id: input.incomeSourceId, householdId: input.householdId },
    });
    if (!incomeSource) throw new Error("INCOME_SOURCE_NOT_FOUND");

    const gross = input.grossAmount || input.expectedAmount;
    const deductions = input.deductionsAmount || new Prisma.Decimal(0);
    const tax = input.taxWithheld || new Prisma.Decimal(0);
    const net = input.netAmount || gross.sub(deductions).sub(tax);

    const occurrence = await tx.incomeOccurrence.create({
      data: {
        householdId: input.householdId,
        incomeSourceId: input.incomeSourceId,
        name: input.name,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        dueDate: input.dueDate,
        expectedAmount: input.expectedAmount,
        receivedAmount: new Prisma.Decimal(0),
        outstandingAmount: input.expectedAmount,
        grossAmount: gross,
        deductionsAmount: deductions,
        taxWithheld: tax,
        netAmount: net,
        status: "EXPECTED",
        notes: input.notes || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: occurrence.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "EXPECTED",
      action: "CREATE_EXPECTED",
      performedBy: input.userId || null,
    });

    return occurrence;
  }

  /**
   * Transition income status: EXPECTED -> CONFIRMED.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async confirm(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "CONFIRMED", "confirm");

    const confirmed = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: confirmed.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "CONFIRMED",
      action: "CONFIRM",
      performedBy: params.userId || null,
    });

    return confirmed;
  }

  /**
   * Transition income status: CONFIRMED -> CREDITED.
   * Single FinancialCommand execution:
   * - FinancialCommand.postIncome()
   * - Journal created
   * - Account.balance increases ONCE
   * - Income.journalId populated
   */
  static async credit(
    tx: Prisma.TransactionClient,
    params: {
      incomeOccurrenceId: string;
      householdId: string;
      accountId: string;
      amount?: Prisma.Decimal;
      grossAmount?: Prisma.Decimal;
      deductionsAmount?: Prisma.Decimal;
      taxWithheld?: Prisma.Decimal;
      userId?: string;
      idempotencyKey?: string;
    }
  ) {
    // 1. Idempotency check
    if (params.idempotencyKey) {
      const existing = await tx.incomeOccurrence.findFirst({
        where: {
          id: params.incomeOccurrenceId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existing && existing.status === "CREDITED") {
        return existing;
      }
    }

    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");
    if (occurrence.journalId || occurrence.status === "CREDITED") {
      throw new Error("INCOME_ALREADY_CREDITED");
    }

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "CREDITED", "credit");

    const gross = params.grossAmount || occurrence.grossAmount || occurrence.expectedAmount;
    const deductions = params.deductionsAmount || occurrence.deductionsAmount || new Prisma.Decimal(0);
    const tax = params.taxWithheld || occurrence.taxWithheld || new Prisma.Decimal(0);
    const creditAmount = params.amount || occurrence.netAmount || gross.sub(deductions).sub(tax);

    // Single-path Financial Command execution
    const journal = await FinancialCommand.postIncome(tx, {
      householdId: params.householdId,
      accountId: params.accountId,
      amount: creditAmount,
      grossAmount: gross,
      deductionsAmount: deductions,
      taxWithheld: tax,
      description: `Income Credit: ${occurrence.name}`,
      idempotencyKey: params.idempotencyKey || null,
    });

    const credited = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "CREDITED",
        creditedAt: new Date(),
        receivedAmount: creditAmount,
        grossAmount: gross,
        deductionsAmount: deductions,
        taxWithheld: tax,
        netAmount: creditAmount,
        outstandingAmount: occurrence.expectedAmount.sub(creditAmount).gte(0)
          ? occurrence.expectedAmount.sub(creditAmount)
          : new Prisma.Decimal(0),
        journalId: journal.id,
        idempotencyKey: params.idempotencyKey || occurrence.idempotencyKey,
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: credited.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "CREDITED",
      action: "CREDIT",
      performedBy: params.userId || null,
    });

    return credited;
  }

  /**
   * Transition income status: CREDITED -> RECONCILED.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async reconcile(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "RECONCILED", "reconcile");

    const reconciled = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "RECONCILED",
        reconciledAt: new Date(),
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: reconciled.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "RECONCILED",
      action: "RECONCILE",
      performedBy: params.userId || null,
    });

    return reconciled;
  }

  /**
   * Cancel uncredited expected or confirmed income (0 ledger activity).
   */
  static async cancel(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; reason?: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "CANCELLED", "cancel");

    const cancelled = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledReason: params.reason || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: cancelled.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "CANCELLED",
      action: "CANCEL",
      reason: params.reason || null,
      performedBy: params.userId || null,
    });

    return cancelled;
  }

  /**
   * Reverse a CREDITED income occurrence by posting a compensating reversal journal.
   */
  static async reverse(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; reason?: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");
    if (!occurrence.journalId) throw new Error("INCOME_NOT_POSTED");

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "REVERSED", "reverse");

    // Execute compensating reversal journal
    await FinancialCommand.postReversal(tx, occurrence.journalId, params.householdId);

    const reversed = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "REVERSED",
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: reversed.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "REVERSED",
      action: "REVERSE",
      reason: params.reason || null,
      performedBy: params.userId || null,
    });

    return reversed;
  }

  /**
   * Soft archive an income occurrence without deleting historical journals or entries.
   */
  static async archive(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");

    IncomeLifecycle.assertCanTransition(occurrence.status as IncomeStatus, "ARCHIVED", "archive");

    const archived = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: archived.id,
      householdId: params.householdId,
      fromStatus: occurrence.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId || null,
    });

    return archived;
  }

  /**
   * Restore an ARCHIVED income occurrence back to its previous status.
   */
  static async restore(
    tx: Prisma.TransactionClient,
    params: { incomeOccurrenceId: string; householdId: string; userId?: string }
  ) {
    const occurrence = await tx.incomeOccurrence.findFirst({
      where: { id: params.incomeOccurrenceId, householdId: params.householdId },
    });
    if (!occurrence) throw new Error("INCOME_OCCURRENCE_NOT_FOUND");
    if (occurrence.status !== "ARCHIVED") throw new Error("INCOME_NOT_ARCHIVED");

    const lastHistory = await tx.incomeLifecycleHistory.findFirst({
      where: { incomeOccurrenceId: occurrence.id, toStatus: "ARCHIVED" },
      orderBy: { createdAt: "desc" },
    });

    const previousStatus = (lastHistory?.fromStatus && lastHistory.fromStatus !== "NONE" ? lastHistory.fromStatus : "CREDITED") as IncomeStatus;

    const restored = await tx.incomeOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: previousStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      incomeOccurrenceId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: previousStatus,
      action: "RESTORE",
      performedBy: params.userId || null,
    });

    return restored;
  }
}
