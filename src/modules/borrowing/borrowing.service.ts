import { prisma } from "@/lib/prisma";
import { Prisma, PrismaClient } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { AuditService } from "@/finance/audit/audit.service";
import { BorrowingLifecycle, BorrowingStatus } from "@/finance/lifecycle/borrowing-lifecycle";
import { validateClassificationCombination } from "@/lib/services/classification-service";

export interface CreateBorrowingInput {
  householdId: string;
  name: string;
  description?: string | null;
  lenderId?: string | null;
  lenderName?: string | null;
  lenderType?: string | null;
  borrowingType?: string;
  financingType?: string;
  repaymentMethod?: string;
  purpose?: string | null;
  principalAmount: number | string | Prisma.Decimal;
  interestRate?: number | string | Prisma.Decimal;
  tenureMonths?: number | null;
  startDate?: Date | string | null;
  maturityDate?: Date | string | null;
  firstPaymentDate?: Date | string | null;
  scopeId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  costCenterId?: string | null;
  assetId?: string | null;
  liabilityAccountId?: string | null;
  receivingAccountId?: string | null;
  userId?: string | null;
}

export interface DisburseBorrowingInput {
  householdId: string;
  borrowingId: string;
  receivingAccountId: string;
  disbursementDate?: Date | string;
  referenceNo?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
}

export interface RepayBorrowingInput {
  householdId: string;
  borrowingId: string;
  payingAccountId: string;
  principalAmount: number | string | Prisma.Decimal;
  interestAmount?: number | string | Prisma.Decimal;
  paymentDate?: Date | string;
  referenceNo?: string | null;
  notes?: string | null;
  installmentId?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
}

export interface AccrueInterestInput {
  householdId: string;
  borrowingId: string;
  interestAmount: number | string | Prisma.Decimal;
  expenseAccountId?: string | null;
  effectiveDate?: Date | string;
  notes?: string | null;
  idempotencyKey?: string | null;
  userId?: string | null;
}

export interface GenerateScheduleInput {
  householdId: string;
  borrowingId: string;
  frequency?: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "BULLET";
  startDate?: Date | string;
  tenureMonths?: number;
  principalAmount?: number | string | Prisma.Decimal;
  interestRate?: number | string | Prisma.Decimal;
  userId?: string | null;
}

export interface ReverseBorrowingEventInput {
  householdId: string;
  borrowingId: string;
  eventId: string;
  reason?: string | null;
  userId?: string | null;
}

export class BorrowingService {
  /**
   * Helper: Provision or verify liability account for a borrowing
   */
  private static async getOrCreateLiabilityAccount(
    tx: Prisma.TransactionClient,
    householdId: string,
    borrowingName: string,
    existingAccountId?: string | null
  ): Promise<string> {
    if (existingAccountId) {
      const acc = await tx.account.findFirst({
        where: { id: existingAccountId, householdId },
      });
      if (acc) return acc.id;
    }

    // Auto-create a LOAN account for this borrowing
    const newAcc = await tx.account.create({
      data: {
        householdId,
        name: `${borrowingName} (Loan)`,
        type: "LOAN",
        balance: new Prisma.Decimal(0),
        currency: "INR",
        isShared: true,
      },
    });
    return newAcc.id;
  }

  /**
   * 1. Create Draft Borrowing
   * Emits ZERO ledger balance or journal mutations.
   */
  static async createDraft(
    db: Prisma.TransactionClient | PrismaClient,
    input: CreateBorrowingInput
  ) {
    const principal = new Prisma.Decimal(input.principalAmount || 0);
    if (principal.lte(0)) {
      throw new Error("VALIDATION_ERROR: Principal amount must be greater than zero.");
    }

    const interestRate = new Prisma.Decimal(input.interestRate || 0);
    if (interestRate.lt(0)) {
      throw new Error("VALIDATION_ERROR: Interest rate cannot be negative.");
    }

    // Validate Universal Financial Classification
    const classValidation = await validateClassificationCombination({
      householdId: input.householdId,
      scopeId: input.scopeId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      costCenterId: input.costCenterId,
      isNewRecord: true,
    });
    if (!classValidation.valid) {
      throw new Error(`CLASSIFICATION_INVALID: ${classValidation.error}`);
    }

    // Optional Asset linkage validation
    if (input.assetId) {
      const asset = await db.asset.findFirst({
        where: { id: input.assetId, householdId: input.householdId },
      });
      if (!asset) {
        throw new Error("ASSET_NOT_FOUND: Linked asset does not exist in household.");
      }
    }

    // Resolve or create Lender
    let lenderId = input.lenderId || null;
    if (!lenderId && input.lenderName && input.lenderName.trim()) {
      const lender = await db.lender.upsert({
        where: {
          householdId_name: {
            householdId: input.householdId,
            name: input.lenderName.trim(),
          },
        },
        update: {},
        create: {
          householdId: input.householdId,
          name: input.lenderName.trim(),
          type: input.lenderType || "BANK",
        },
      });
      lenderId = lender.id;
    }

    const borrowing = await db.borrowing.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        description: input.description,
        lenderId,
        scopeId: input.scopeId || null,
        categoryId: input.categoryId || null,
        subcategoryId: input.subcategoryId || null,
        costCenterId: input.costCenterId || null,
        assetId: input.assetId || null,
        liabilityAccountId: input.liabilityAccountId || null,
        receivingAccountId: input.receivingAccountId || null,
        borrowingType: input.borrowingType || "TERM_LOAN",
        financingType: input.financingType || "SECURED",
        repaymentMethod: input.repaymentMethod || "AMORTIZED_EMI",
        purpose: input.purpose || null,
        principalAmount: principal,
        interestRate,
        tenureMonths: input.tenureMonths || 12,
        outstandingPrincipal: new Prisma.Decimal(0),
        totalPrincipalPaid: new Prisma.Decimal(0),
        totalInterestPaid: new Prisma.Decimal(0),
        startDate: input.startDate ? new Date(input.startDate) : null,
        maturityDate: input.maturityDate ? new Date(input.maturityDate) : null,
        firstPaymentDate: input.firstPaymentDate ? new Date(input.firstPaymentDate) : null,
        status: "DRAFT",
        lifecycleHistory: {
          create: {
            householdId: input.householdId,
            fromStatus: "NONE",
            toStatus: "DRAFT",
            action: "create",
            performedBy: input.userId || "SYSTEM",
            reason: "Draft borrowing created",
          },
        },
      },
      include: {
        lender: true,
        scope: true,
        category: true,
        subcategory: true,
        costCenter: true,
        asset: true,
      },
    });

    await AuditService.record(db, {
      householdId: input.householdId,
      entityType: "BORROWING",
      entityId: borrowing.id,
      action: "CREATE",
      fromState: "NONE",
      toState: "DRAFT",
      actorUserId: input.userId || "SYSTEM",
      reason: `Created draft borrowing ${borrowing.name}`,
    });

    return borrowing;
  }

  /**
   * 2. Disburse Borrowing
   * Moves funds: Debit Receiving Bank Account, Credit Liability Account.
   * Income is 0. Ledger is source of truth.
   * Transitions DRAFT -> ACTIVE.
   */
  static async disburseBorrowing(
    db: PrismaClient,
    input: DisburseBorrowingInput
  ) {
    if (!input.receivingAccountId) {
      throw new Error("VALIDATION_ERROR: Receiving bank account is required for loan disbursement.");
    }

    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: input.borrowingId, householdId: input.householdId },
        include: { receivingAccount: true, liabilityAccount: true },
      });

      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND: Borrowing record does not exist.");
      }

      BorrowingLifecycle.assertCanTransition(
        borrowing.status as BorrowingStatus,
        "ACTIVE",
        "disburse"
      );

      // Verify receiving bank account belongs to household
      const receivingAccount = await tx.account.findFirst({
        where: { id: input.receivingAccountId, householdId: input.householdId, isArchived: false },
      });
      if (!receivingAccount) {
        throw new Error("ACCOUNT_UNAVAILABLE: Receiving account not found or is archived.");
      }

      // Ensure liability account exists
      const liabilityAccountId = await this.getOrCreateLiabilityAccount(
        tx,
        input.householdId,
        borrowing.name,
        borrowing.liabilityAccountId
      );

      // Post Double-Entry Journal via FinancialCommand:
      // Debit: Receiving Account (Asset up)
      // Credit: Liability Account (Liability up)
      const journal = await FinancialCommand.postLiabilityBorrow(tx, {
        householdId: input.householdId,
        liabilityName: borrowing.name,
        principalAmount: borrowing.principalAmount,
        receivingAccountId: receivingAccount.id,
        liabilityAccountId,
        idempotencyKey: input.idempotencyKey || `disburse_${borrowing.id}`,
      });

      const effectiveDate = input.disbursementDate ? new Date(input.disbursementDate) : new Date();

      // Record double-entry BorrowingFinancialEvent
      const event = await tx.borrowingFinancialEvent.create({
        data: {
          householdId: input.householdId,
          borrowingId: borrowing.id,
          eventType: "DISBURSEMENT",
          principalAmount: borrowing.principalAmount,
          interestAmount: new Prisma.Decimal(0),
          totalAmount: borrowing.principalAmount,
          journalId: journal.id,
          effectiveDate,
          reason: input.notes || "Initial loan disbursement",
          idempotencyKey: input.idempotencyKey || null,
          createdByUserId: input.userId || null,
        },
      });

      // Update Borrowing: Projection matches principal, status ACTIVE
      const updated = await tx.borrowing.update({
        where: { id: borrowing.id },
        data: {
          status: "ACTIVE",
          outstandingPrincipal: borrowing.principalAmount,
          liabilityAccountId,
          receivingAccountId: receivingAccount.id,
          disbursementJournalId: journal.id,
          startDate: effectiveDate,
        },
      });

      // Record lifecycle history
      await tx.borrowingLifecycleHistory.create({
        data: {
          householdId: input.householdId,
          borrowingId: borrowing.id,
          fromStatus: borrowing.status,
          toStatus: "ACTIVE",
          action: "disburse",
          reason: input.notes || "Disbursed funds into bank account",
          performedBy: input.userId || "SYSTEM",
        },
      });

      // Automatically generate repayment schedule if tenure is present
      if (borrowing.tenureMonths && borrowing.tenureMonths > 0) {
        await this.generateScheduleInternal(tx, {
          householdId: input.householdId,
          borrowingId: borrowing.id,
          frequency: "MONTHLY",
          startDate: effectiveDate,
          tenureMonths: borrowing.tenureMonths,
          principalAmount: borrowing.principalAmount,
          interestRate: borrowing.interestRate,
        });
      }

      await AuditService.record(tx, {
        householdId: input.householdId,
        entityType: "BORROWING",
        entityId: borrowing.id,
        action: "DISBURSE",
        fromState: borrowing.status,
        toState: "ACTIVE",
        actorUserId: input.userId || "SYSTEM",
        reason: `Disbursed loan ${borrowing.name} of ${borrowing.principalAmount.toString()}`,
        metadata: { journalId: journal.id, eventId: event.id },
      });

      return updated;
    });
  }

  /**
   * 3. Repay Borrowing (Principal / EMI)
   * Decreases liability and bank account; records interest expense if interest > 0.
   * Principal repayment is NOT an expense.
   */
  static async repayBorrowing(
    db: PrismaClient,
    input: RepayBorrowingInput
  ) {
    if (!input.payingAccountId) {
      throw new Error("VALIDATION_ERROR: Paying account is required for repayment.");
    }

    const principal = new Prisma.Decimal(input.principalAmount || 0);
    const interest = new Prisma.Decimal(input.interestAmount || 0);

    if (principal.lt(0) || interest.lt(0)) {
      throw new Error("VALIDATION_ERROR: Repayment amounts cannot be negative.");
    }
    if (principal.isZero() && interest.isZero()) {
      throw new Error("VALIDATION_ERROR: Either principal or interest amount must be greater than zero.");
    }

    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: input.borrowingId, householdId: input.householdId },
      });

      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND: Borrowing record does not exist.");
      }

      if (!BorrowingLifecycle.canRepay(borrowing.status as BorrowingStatus)) {
        throw new Error(`INVALID_STATE: Cannot repay borrowing in '${borrowing.status}' status.`);
      }

      // Over-repayment boundary guard
      if (principal.gt(borrowing.outstandingPrincipal)) {
        throw new Error(
          `OVER_REPAYMENT_ERROR: Principal repayment of ${principal.toString()} exceeds outstanding balance of ${borrowing.outstandingPrincipal.toString()}.`
        );
      }

      // Verify paying account
      const payingAccount = await tx.account.findFirst({
        where: { id: input.payingAccountId, householdId: input.householdId, isArchived: false },
      });
      if (!payingAccount) {
        throw new Error("ACCOUNT_UNAVAILABLE: Paying account not found or is archived.");
      }

      const liabilityAccountId = await this.getOrCreateLiabilityAccount(
        tx,
        input.householdId,
        borrowing.name,
        borrowing.liabilityAccountId
      );

      // Post double-entry journal via FinancialCommand
      let journal;
      const isEMI = interest.gt(0);
      if (isEMI) {
        journal = await FinancialCommand.postLiabilityEMI(tx, {
          householdId: input.householdId,
          liabilityName: borrowing.name,
          principalAmount: principal,
          interestAmount: interest,
          payingAccountId: payingAccount.id,
          liabilityAccountId,
          idempotencyKey: input.idempotencyKey || null,
        });
      } else {
        journal = await FinancialCommand.postLiabilityRepayment(tx, {
          householdId: input.householdId,
          liabilityName: borrowing.name,
          principalAmount: principal,
          payingAccountId: payingAccount.id,
          liabilityAccountId,
          idempotencyKey: input.idempotencyKey || null,
        });
      }

      const effectiveDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

      // Record double-entry BorrowingFinancialEvent
      const event = await tx.borrowingFinancialEvent.create({
        data: {
          householdId: input.householdId,
          borrowingId: borrowing.id,
          eventType: isEMI ? "EMI_PAYMENT" : "REPAYMENT",
          principalAmount: principal,
          interestAmount: interest,
          totalAmount: principal.add(interest),
          journalId: journal.id,
          effectiveDate,
          reason: input.notes || (isEMI ? "Monthly EMI Repayment" : "Principal Repayment"),
          idempotencyKey: input.idempotencyKey || null,
          createdByUserId: input.userId || null,
        },
      });

      // Update projected balances
      const newOutstanding = borrowing.outstandingPrincipal.sub(principal);
      const newTotalPrincipalPaid = borrowing.totalPrincipalPaid.add(principal);
      const newTotalInterestPaid = borrowing.totalInterestPaid.add(interest);

      // Determine next status
      let nextStatus: BorrowingStatus = "PARTIALLY_SETTLED";
      if (newOutstanding.isZero()) {
        nextStatus = "SETTLED";
      }

      BorrowingLifecycle.assertCanTransition(
        borrowing.status as BorrowingStatus,
        nextStatus,
        "repay"
      );

      const updated = await tx.borrowing.update({
        where: { id: borrowing.id },
        data: {
          status: nextStatus,
          outstandingPrincipal: newOutstanding,
          totalPrincipalPaid: newTotalPrincipalPaid,
          totalInterestPaid: newTotalInterestPaid,
        },
      });

      // Reconcile against installment schedule if one exists
      if (input.installmentId) {
        const inst = await tx.repaymentInstallment.findFirst({
          where: { id: input.installmentId, borrowingId: borrowing.id },
        });
        if (inst) {
          const newPaidP = inst.paidPrincipal.add(principal);
          const newPaidI = inst.paidInterest.add(interest);
          const newPaidTot = newPaidP.add(newPaidI);
          const remaining = inst.totalAmount.sub(newPaidTot);
          const instStatus = remaining.lte(0) ? "PAID" : "PARTIALLY_PAID";

          await tx.repaymentInstallment.update({
            where: { id: inst.id },
            data: {
              paidPrincipal: newPaidP,
              paidInterest: newPaidI,
              paidAmount: newPaidTot,
              remainingAmount: remaining.gte(0) ? remaining : new Prisma.Decimal(0),
              status: instStatus,
              paidAt: effectiveDate,
            },
          });
        }
      } else {
        // Auto-match against next unpaid installment
        const nextInstallment = await tx.repaymentInstallment.findFirst({
          where: {
            borrowingId: borrowing.id,
            status: { in: ["UPCOMING", "DUE", "OVERDUE", "PARTIALLY_PAID"] },
          },
          orderBy: { installmentNumber: "asc" },
        });

        if (nextInstallment) {
          const newPaidP = nextInstallment.paidPrincipal.add(principal);
          const newPaidI = nextInstallment.paidInterest.add(interest);
          const newPaidTot = newPaidP.add(newPaidI);
          const remaining = nextInstallment.totalAmount.sub(newPaidTot);
          const instStatus = remaining.lte(0) ? "PAID" : "PARTIALLY_PAID";

          await tx.repaymentInstallment.update({
            where: { id: nextInstallment.id },
            data: {
              paidPrincipal: newPaidP,
              paidInterest: newPaidI,
              paidAmount: newPaidTot,
              remainingAmount: remaining.gte(0) ? remaining : new Prisma.Decimal(0),
              status: instStatus,
              paidAt: effectiveDate,
            },
          });
        }
      }

      // Record lifecycle history if status changed
      if (borrowing.status !== nextStatus) {
        await tx.borrowingLifecycleHistory.create({
          data: {
            householdId: input.householdId,
            borrowingId: borrowing.id,
            fromStatus: borrowing.status,
            toStatus: nextStatus,
            action: "repay",
            reason: newOutstanding.isZero() ? "Loan fully repaid and settled" : "Partial repayment recorded",
            performedBy: input.userId || "SYSTEM",
          },
        });
      }

      await AuditService.record(tx, {
        householdId: input.householdId,
        entityType: "BORROWING",
        entityId: borrowing.id,
        action: "REPAYMENT",
        fromState: borrowing.status,
        toState: nextStatus,
        actorUserId: input.userId || "SYSTEM",
        reason: `Repaid principal ${principal.toString()}, interest ${interest.toString()} on ${borrowing.name}`,
        metadata: { journalId: journal.id, eventId: event.id, newOutstanding: newOutstanding.toString() },
      });

      return updated;
    });
  }

  /**
   * 4. Accrue Interest (Non-cash interest capitalization / expense accrual)
   * Debit Interest Expense, Credit Liability Account.
   */
  static async accrueInterest(
    db: PrismaClient,
    input: AccrueInterestInput
  ) {
    const interest = new Prisma.Decimal(input.interestAmount || 0);
    if (interest.lte(0)) {
      throw new Error("VALIDATION_ERROR: Accrued interest amount must be greater than zero.");
    }

    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: input.borrowingId, householdId: input.householdId },
      });

      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND: Borrowing record does not exist.");
      }

      if (!BorrowingLifecycle.canAccrueInterest(borrowing.status as BorrowingStatus)) {
        throw new Error(`INVALID_STATE: Cannot accrue interest on borrowing in '${borrowing.status}' status.`);
      }

      const liabilityAccountId = await this.getOrCreateLiabilityAccount(
        tx,
        input.householdId,
        borrowing.name,
        borrowing.liabilityAccountId
      );

      const journal = await FinancialCommand.postLiabilityInterestAccrual(tx, {
        householdId: input.householdId,
        liabilityName: borrowing.name,
        interestAmount: interest,
        liabilityAccountId,
        expenseAccountId: input.expenseAccountId || null,
        idempotencyKey: input.idempotencyKey || null,
      });

      const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();

      const event = await tx.borrowingFinancialEvent.create({
        data: {
          householdId: input.householdId,
          borrowingId: borrowing.id,
          eventType: "INTEREST_ACCRUED",
          principalAmount: new Prisma.Decimal(0),
          interestAmount: interest,
          totalAmount: interest,
          journalId: journal.id,
          effectiveDate,
          reason: input.notes || "Interest accrual",
          idempotencyKey: input.idempotencyKey || null,
          createdByUserId: input.userId || null,
        },
      });

      await AuditService.record(tx, {
        householdId: input.householdId,
        entityType: "BORROWING",
        entityId: borrowing.id,
        action: "INTEREST_ACCRUED",
        fromState: borrowing.status,
        toState: borrowing.status,
        actorUserId: input.userId || "SYSTEM",
        reason: `Accrued interest of ${interest.toString()} on ${borrowing.name}`,
        metadata: { journalId: journal.id, eventId: event.id },
      });

      return event;
    });
  }

  /**
   * 5. Generate / Regenerate Schedule
   * Deterministic reducing-balance EMI schedule.
   * SAFEGUARD: Cannot overwrite schedule if any payments have been recorded!
   */
  static async generateSchedule(
    db: PrismaClient,
    input: GenerateScheduleInput
  ) {
    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: input.borrowingId, householdId: input.householdId },
      });

      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND: Borrowing record does not exist.");
      }

      // Check if existing installments have payments
      const existingPaidInstallments = await tx.repaymentInstallment.findFirst({
        where: {
          borrowingId: borrowing.id,
          status: { in: ["PAID", "PARTIALLY_PAID"] },
        },
      });

      if (existingPaidInstallments) {
        throw new Error(
          "SCHEDULE_LOCKED_AFTER_PAYMENTS: Cannot regenerate full schedule after payments have been recorded. Schedule can only be revised for remaining installments."
        );
      }

      // Delete old un-paid installments & schedule
      await tx.repaymentInstallment.deleteMany({
        where: { borrowingId: borrowing.id },
      });
      await tx.repaymentSchedule.deleteMany({
        where: { borrowingId: borrowing.id },
      });

      return await this.generateScheduleInternal(tx, {
        householdId: input.householdId,
        borrowingId: borrowing.id,
        frequency: input.frequency || "MONTHLY",
        startDate: input.startDate ? new Date(input.startDate) : borrowing.startDate || new Date(),
        tenureMonths: input.tenureMonths || borrowing.tenureMonths || 12,
        principalAmount: input.principalAmount || borrowing.principalAmount,
        interestRate: input.interestRate || borrowing.interestRate,
      });
    });
  }

  /**
   * Internal deterministic schedule calculation
   */
  private static async generateScheduleInternal(
    tx: Prisma.TransactionClient,
    params: {
      householdId: string;
      borrowingId: string;
      frequency: string;
      startDate: Date;
      tenureMonths: number;
      principalAmount: number | string | Prisma.Decimal;
      interestRate: number | string | Prisma.Decimal;
    }
  ) {
    const P = new Prisma.Decimal(params.principalAmount).toNumber();
    const annualRate = new Prisma.Decimal(params.interestRate).toNumber();
    const n = params.tenureMonths || 12;

    if (P <= 0 || n <= 0) return null;

    const r = annualRate / 12 / 100;
    let emi: number;
    if (r > 0) {
      emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    } else {
      emi = P / n;
    }

    const startDate = new Date(params.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + n);

    let currentBalance = P;
    let totalInterest = 0;
    const installmentsData = [];

    for (let i = 1; i <= n; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const interestForMonth = r > 0 ? currentBalance * r : 0;
      let principalForMonth = emi - interestForMonth;

      // Final month adjustment for exact balance payoff
      if (i === n || principalForMonth > currentBalance) {
        principalForMonth = currentBalance;
        emi = principalForMonth + interestForMonth;
      }

      currentBalance -= principalForMonth;
      totalInterest += interestForMonth;

      installmentsData.push({
        householdId: params.householdId,
        borrowingId: params.borrowingId,
        installmentNumber: i,
        dueDate,
        principalAmount: new Prisma.Decimal(principalForMonth.toFixed(2)),
        interestAmount: new Prisma.Decimal(interestForMonth.toFixed(2)),
        totalAmount: new Prisma.Decimal(emi.toFixed(2)),
        paidPrincipal: new Prisma.Decimal(0),
        paidInterest: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(emi.toFixed(2)),
        status: "UPCOMING",
      });
    }

    const schedule = await tx.repaymentSchedule.create({
      data: {
        householdId: params.householdId,
        borrowingId: params.borrowingId,
        frequency: params.frequency,
        startDate,
        endDate,
        totalInstallments: n,
        totalPrincipal: new Prisma.Decimal(P.toFixed(2)),
        totalInterest: new Prisma.Decimal(totalInterest.toFixed(2)),
        totalAmount: new Prisma.Decimal((P + totalInterest).toFixed(2)),
        status: "ACTIVE",
      },
    });

    await tx.repaymentInstallment.createMany({
      data: installmentsData.map((d) => ({
        householdId: d.householdId,
        borrowingId: d.borrowingId,
        scheduleId: schedule.id,
        installmentNumber: d.installmentNumber,
        dueDate: d.dueDate,
        principalAmount: d.principalAmount,
        interestAmount: d.interestAmount,
        totalAmount: d.totalAmount,
        paidPrincipal: d.paidPrincipal,
        paidInterest: d.paidInterest,
        paidAmount: d.paidAmount,
        remainingAmount: d.remainingAmount,
        status: d.status,
      })),
    });

    return await tx.repaymentSchedule.findUnique({
      where: { id: schedule.id },
      include: { installments: true },
    });
  }

  /**
   * 6. Reverse Event (Disbursement or Repayment)
   * Enforces strict lifecycle safeguards:
   * - Cannot reverse disbursement if repayments exist!
   * - Executes compensating journal via LedgerService.reverseJournal.
   */
  static async reverseEvent(
    db: PrismaClient,
    input: ReverseBorrowingEventInput
  ) {
    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: input.borrowingId, householdId: input.householdId },
      });
      if (!borrowing) {
        throw new Error("BORROWING_NOT_FOUND: Borrowing record does not exist.");
      }

      const event = await tx.borrowingFinancialEvent.findFirst({
        where: { id: input.eventId, borrowingId: borrowing.id, householdId: input.householdId },
      });
      if (!event) {
        throw new Error("EVENT_NOT_FOUND: Financial event does not exist for this borrowing.");
      }

      if (event.isReversed) {
        throw new Error("EVENT_ALREADY_REVERSED: This financial event has already been reversed.");
      }

      if (!event.journalId) {
        throw new Error("JOURNAL_NOT_FOUND: Event has no linked journal to reverse.");
      }

      // SAFEGUARD 1: Disbursement Reversal Rules
      if (event.eventType === "DISBURSEMENT") {
        if (borrowing.totalPrincipalPaid.gt(0)) {
          throw new Error(
            "DISBURSEMENT_REVERSAL_BLOCKED: Cannot reverse disbursement because active repayment events exist. Reverse downstream repayment events first."
          );
        }

        // Post compensating reversal journal
        await LedgerService.reverseJournal(tx, event.journalId, input.householdId);

        // Mark original event reversed
        await tx.borrowingFinancialEvent.update({
          where: { id: event.id },
          data: { isReversed: true },
        });

        // Record reversal event
        const reversalEvent = await tx.borrowingFinancialEvent.create({
          data: {
            householdId: input.householdId,
            borrowingId: borrowing.id,
            eventType: "REVERSAL",
            reversalOfEventId: event.id,
            principalAmount: event.principalAmount.negated(),
            interestAmount: new Prisma.Decimal(0),
            totalAmount: event.totalAmount.negated(),
            effectiveDate: new Date(),
            reason: input.reason || "Disbursement reversal",
            createdByUserId: input.userId || null,
          },
        });

        // Transition Borrowing: ACTIVE -> CANCELLED, reset outstanding to 0
        BorrowingLifecycle.assertCanTransition(
          borrowing.status as BorrowingStatus,
          "CANCELLED",
          "reverse_disbursement"
        );

        const updated = await tx.borrowing.update({
          where: { id: borrowing.id },
          data: {
            status: "CANCELLED",
            outstandingPrincipal: new Prisma.Decimal(0),
          },
        });

        await tx.borrowingLifecycleHistory.create({
          data: {
            householdId: input.householdId,
            borrowingId: borrowing.id,
            fromStatus: borrowing.status,
            toStatus: "CANCELLED",
            action: "reverse_disbursement",
            reason: input.reason || "Disbursement reversed and borrowing cancelled",
            performedBy: input.userId || "SYSTEM",
          },
        });

        await AuditService.record(tx, {
          householdId: input.householdId,
          entityType: "BORROWING",
          entityId: borrowing.id,
          action: "REVERSE",
          fromState: borrowing.status,
          toState: "CANCELLED",
          actorUserId: input.userId || "SYSTEM",
          reason: `Reversed disbursement for ${borrowing.name}`,
          metadata: { originalEventId: event.id, reversalEventId: reversalEvent.id },
        });

        return updated;
      }

      // SAFEGUARD 2: Repayment Reversal Rules
      if (event.eventType === "REPAYMENT" || event.eventType === "EMI_PAYMENT") {
        // Post compensating reversal journal
        await LedgerService.reverseJournal(tx, event.journalId, input.householdId);

        // Mark original event reversed
        await tx.borrowingFinancialEvent.update({
          where: { id: event.id },
          data: { isReversed: true },
        });

        // Record reversal event
        const reversalEvent = await tx.borrowingFinancialEvent.create({
          data: {
            householdId: input.householdId,
            borrowingId: borrowing.id,
            eventType: "REVERSAL",
            reversalOfEventId: event.id,
            principalAmount: event.principalAmount.negated(),
            interestAmount: event.interestAmount.negated(),
            totalAmount: event.totalAmount.negated(),
            effectiveDate: new Date(),
            reason: input.reason || "Repayment reversal",
            createdByUserId: input.userId || null,
          },
        });

        // Restore balances
        const restoredOutstanding = borrowing.outstandingPrincipal.add(event.principalAmount);
        const restoredPrincipalPaid = borrowing.totalPrincipalPaid.sub(event.principalAmount);
        const restoredInterestPaid = borrowing.totalInterestPaid.sub(event.interestAmount);

        let nextStatus: BorrowingStatus = "PARTIALLY_SETTLED";
        if (restoredPrincipalPaid.isZero()) {
          nextStatus = "ACTIVE";
        }

        BorrowingLifecycle.assertCanTransition(
          borrowing.status as BorrowingStatus,
          nextStatus,
          "reverse_repayment"
        );

        const updated = await tx.borrowing.update({
          where: { id: borrowing.id },
          data: {
            status: nextStatus,
            outstandingPrincipal: restoredOutstanding,
            totalPrincipalPaid: restoredPrincipalPaid,
            totalInterestPaid: restoredInterestPaid,
          },
        });

        // Restore installment status if applicable
        const paidInstallment = await tx.repaymentInstallment.findFirst({
          where: {
            borrowingId: borrowing.id,
            status: { in: ["PAID", "PARTIALLY_PAID"] },
          },
          orderBy: { installmentNumber: "desc" },
        });

        if (paidInstallment) {
          const newPaidP = paidInstallment.paidPrincipal.sub(event.principalAmount);
          const newPaidI = paidInstallment.paidInterest.sub(event.interestAmount);
          const newPaidTot = newPaidP.add(newPaidI);
          const remaining = paidInstallment.totalAmount.sub(newPaidTot);

          await tx.repaymentInstallment.update({
            where: { id: paidInstallment.id },
            data: {
              paidPrincipal: newPaidP.gte(0) ? newPaidP : new Prisma.Decimal(0),
              paidInterest: newPaidI.gte(0) ? newPaidI : new Prisma.Decimal(0),
              paidAmount: newPaidTot.gte(0) ? newPaidTot : new Prisma.Decimal(0),
              remainingAmount: remaining,
              status: newPaidTot.isZero() ? "UPCOMING" : "PARTIALLY_PAID",
              paidAt: newPaidTot.isZero() ? null : paidInstallment.paidAt,
            },
          });
        }

        await tx.borrowingLifecycleHistory.create({
          data: {
            householdId: input.householdId,
            borrowingId: borrowing.id,
            fromStatus: borrowing.status,
            toStatus: nextStatus,
            action: "reverse_repayment",
            reason: input.reason || "Repayment reversed and balance restored",
            performedBy: input.userId || "SYSTEM",
          },
        });

        await AuditService.record(tx, {
          householdId: input.householdId,
          entityType: "BORROWING",
          entityId: borrowing.id,
          action: "REVERSE",
          fromState: borrowing.status,
          toState: nextStatus,
          actorUserId: input.userId || "SYSTEM",
          reason: `Reversed repayment on ${borrowing.name}`,
          metadata: { originalEventId: event.id, reversalEventId: reversalEvent.id },
        });

        return updated;
      }

      throw new Error(`UNSUPPORTED_EVENT_REVERSAL: Cannot reverse event of type '${event.eventType}'.`);
    });
  }

  /**
   * 7. Verify Borrowing Ledger Balance Invariant
   * Asserts that cached projection matches double-entry ledger entries.
   */
  static async verifyBorrowingLedgerBalance(
    db: Prisma.TransactionClient | PrismaClient,
    borrowingId: string,
    householdId: string
  ): Promise<{ valid: boolean; projection: number; ledgerBalance: number; diff: number }> {
    const borrowing = await db.borrowing.findFirst({
      where: { id: borrowingId, householdId },
    });
    if (!borrowing) throw new Error("BORROWING_NOT_FOUND");

    if (!borrowing.liabilityAccountId) {
      return {
        valid: borrowing.outstandingPrincipal.isZero(),
        projection: borrowing.outstandingPrincipal.toNumber(),
        ledgerBalance: 0,
        diff: borrowing.outstandingPrincipal.toNumber(),
      };
    }

    const journalEntries = await db.journalEntry.findMany({
      where: {
        accountId: borrowing.liabilityAccountId,
        journal: { status: "POSTED", householdId },
      },
    });

    // Liability balance is Credit - Debit
    const totalCredits = journalEntries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
    const totalDebits = journalEntries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
    const ledgerBalance = totalCredits.sub(totalDebits);

    const diff = borrowing.outstandingPrincipal.sub(ledgerBalance).abs().toNumber();
    const valid = diff < 0.01;

    return {
      valid,
      projection: borrowing.outstandingPrincipal.toNumber(),
      ledgerBalance: ledgerBalance.toNumber(),
      diff,
    };
  }

  /**
   * 8. Archive Borrowing
   */
  static async archiveBorrowing(
    db: PrismaClient,
    params: { householdId: string; borrowingId: string; userId?: string | null }
  ) {
    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: params.borrowingId, householdId: params.householdId },
      });
      if (!borrowing) throw new Error("BORROWING_NOT_FOUND");

      BorrowingLifecycle.assertCanTransition(
        borrowing.status as BorrowingStatus,
        "ARCHIVED",
        "archive"
      );

      const updated = await tx.borrowing.update({
        where: { id: borrowing.id },
        data: {
          status: "ARCHIVED",
          archivedAt: new Date(),
          archivedByUserId: params.userId || null,
        },
      });

      await tx.borrowingLifecycleHistory.create({
        data: {
          householdId: params.householdId,
          borrowingId: borrowing.id,
          fromStatus: borrowing.status,
          toStatus: "ARCHIVED",
          action: "archive",
          performedBy: params.userId || "SYSTEM",
        },
      });

      await AuditService.record(tx, {
        householdId: params.householdId,
        entityType: "BORROWING",
        entityId: borrowing.id,
        action: "ARCHIVE",
        fromState: borrowing.status,
        toState: "ARCHIVED",
        actorUserId: params.userId || "SYSTEM",
        reason: `Archived borrowing ${borrowing.name}`,
      });

      return updated;
    });
  }

  /**
   * 9. Restore Borrowing
   */
  static async restoreBorrowing(
    db: PrismaClient,
    params: { householdId: string; borrowingId: string; userId?: string | null }
  ) {
    return await db.$transaction(async (tx) => {
      const borrowing = await tx.borrowing.findFirst({
        where: { id: params.borrowingId, householdId: params.householdId },
      });
      if (!borrowing) throw new Error("BORROWING_NOT_FOUND");

      // Find previous status from lifecycle history
      const lastHistory = await tx.borrowingLifecycleHistory.findFirst({
        where: { borrowingId: borrowing.id, toStatus: "ARCHIVED" },
        orderBy: { createdAt: "desc" },
      });

      const targetStatus: BorrowingStatus = (lastHistory?.fromStatus as BorrowingStatus) || "ACTIVE";

      BorrowingLifecycle.assertCanTransition(
        borrowing.status as BorrowingStatus,
        targetStatus,
        "restore"
      );

      const updated = await tx.borrowing.update({
        where: { id: borrowing.id },
        data: {
          status: targetStatus,
          archivedAt: null,
          archivedByUserId: null,
        },
      });

      await tx.borrowingLifecycleHistory.create({
        data: {
          householdId: params.householdId,
          borrowingId: borrowing.id,
          fromStatus: "ARCHIVED",
          toStatus: targetStatus,
          action: "restore",
          performedBy: params.userId || "SYSTEM",
        },
      });

      await AuditService.record(tx, {
        householdId: params.householdId,
        entityType: "BORROWING",
        entityId: borrowing.id,
        action: "RESTORE",
        fromState: "ARCHIVED",
        toState: targetStatus,
        actorUserId: params.userId || "SYSTEM",
        reason: `Restored borrowing ${borrowing.name}`,
      });

      return updated;
    });
  }

  /**
   * Read-only simulation capability: Calculates borrowing scenario metrics.
   * Certified reducing-balance EMI, total repayment, and total interest.
   * Zero ledger mutations, zero database updates.
   */
  static calculateScenario(params: {
    principal: number;
    tenureMonths: number;
    annualInterestRate?: number | null;
    repaymentMethod?: string;
    rateSource?: "CONFIGURED" | "USER_ASSUMED" | "BORROWING_PRODUCT_ASSUMPTION" | "UNKNOWN";
    assumptionVersion?: number;
  }) {
    const rate = params.annualInterestRate !== undefined && params.annualInterestRate !== null
      ? params.annualInterestRate
      : null;

    const source = rate !== null
      ? (params.rateSource || "CONFIGURED")
      : "UNKNOWN";

    if (rate === null || rate <= 0) {
      return {
        annualInterestRate: null,
        monthlyRate: null,
        tenureMonths: params.tenureMonths,
        emi: null,
        totalRepayment: null,
        totalInterest: null,
        source: "UNKNOWN" as const,
        assumptionVersion: params.assumptionVersion || 1,
        requiresRateAssumption: true,
      };
    }

    const monthlyRate = (rate / 100) / 12;
    const n = Math.max(1, params.tenureMonths);
    const p = Math.max(0, params.principal);

    let emi: number;
    if (monthlyRate > 0) {
      emi = Math.round((p * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1));
    } else {
      emi = Math.round(p / n);
    }

    const totalRepayment = emi * n;
    const totalInterest = Math.max(0, totalRepayment - p);

    return {
      annualInterestRate: rate,
      monthlyRate,
      tenureMonths: n,
      emi,
      totalRepayment,
      totalInterest,
      source,
      assumptionVersion: params.assumptionVersion || 1,
      requiresRateAssumption: false,
    };
  }

  /**
   * Read-only Borrowing Debt Affordability Calculation:
   * Assesses proposed EMI against verified income, verified expenses, and existing EMIs.
   * If verified income is unknown, returns affordability: "UNKNOWN".
   * Certified Borrowing domain calculation.
   */
  static calculateAffordability(params: {
    householdId: string;
    proposedEmi: number;
    existingEmis: number;
    verifiedIncome: number | null;
    verifiedExpenses: number | null;
    maxDebtServiceRatio?: number;
  }) {
    const reasonCodes: string[] = [];

    // Rule: If verified income is unavailable, affordability cannot be assessed
    if (params.verifiedIncome === null || params.verifiedIncome <= 0) {
      return {
        affordable: false,
        affordabilityStatus: "UNKNOWN" as const,
        maxAffordableEmi: null,
        existingDebtService: params.existingEmis,
        proposedDebtService: params.proposedEmi,
        debtServiceRatio: null,
        reasonCodes: ["BORROWING_AFFORDABILITY_DATA_REQUIRED", "VERIFIED_INCOME_REQUIRED"],
      };
    }

    const maxRatio = params.maxDebtServiceRatio || 0.35;
    const maxTotalDebtPayment = Math.round(params.verifiedIncome * maxRatio);
    const maxAffordableEmi = Math.max(0, maxTotalDebtPayment - params.existingEmis);

    const totalProposedDebt = params.existingEmis + params.proposedEmi;
    const debtServiceRatio = Number((totalProposedDebt / params.verifiedIncome).toFixed(4));

    const isAffordable = params.proposedEmi <= maxAffordableEmi;

    if (!isAffordable) {
      reasonCodes.push("BORROWING_UNAFFORDABLE");
      reasonCodes.push("EMI_EXCEEDS_AFFORDABILITY_LIMIT");
    } else {
      reasonCodes.push("AFFORDABLE_DEBT_CAPACITY");
    }

    return {
      affordable: isAffordable,
      affordabilityStatus: isAffordable ? ("AFFORDABLE" as const) : ("UNAFFORDABLE" as const),
      maxAffordableEmi,
      existingDebtService: params.existingEmis,
      proposedDebtService: params.proposedEmi,
      debtServiceRatio,
      reasonCodes,
    };
  }
}
