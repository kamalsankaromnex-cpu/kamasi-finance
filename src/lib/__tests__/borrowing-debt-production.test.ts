import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";
import { BorrowingLifecycle } from "@/finance/lifecycle/borrowing-lifecycle";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { FinancialForecastingService } from "@/finance/forecasting/forecasting.service";
import { migrateLiabilitiesToBorrowing } from "@/lib/migrations/migrate-liabilities-to-borrowing";
import { assertCanMutate } from "@/lib/rbac";

describe("Kamasi Finance — Borrowing & Debt Production Certification Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;
  let scopeId: string;
  let categoryId: string;
  let costCenterId: string;
  let assetId: string;

  beforeEach(async () => {
    // Clean tables in reverse dependency order
    await prisma.repaymentInstallment.deleteMany();
    await prisma.repaymentSchedule.deleteMany();
    await prisma.borrowingFinancialEvent.deleteMany();
    await prisma.borrowingLifecycleHistory.deleteMany();
    await prisma.borrowing.deleteMany();
    await prisma.liabilityFinancialEvent.deleteMany();
    await prisma.liabilityLifecycleHistory.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.lender.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.assetFinancialEvent.deleteMany();
    await prisma.assetLifecycleHistory.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.costCenter.deleteMany();
    await prisma.scopeCategory.deleteMany();
    await prisma.categorySubcategory.deleteMany();
    await prisma.category.deleteMany();
    await prisma.financialScope.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Create user and household
    const user = await prisma.user.create({
      data: {
        email: `borrowing-test-${Date.now()}@kamasi.internal`,
        passwordHash: "securehash",
        name: "Dev Patel",
        isOnboarded: true,
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Patel Family Enterprise",
        currency: "INR",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    householdId = household.id;

    // Create primary bank account with initial funds
    const bank = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(1000000), // 10 Lakhs starting balance
        currency: "INR",
        isShared: true,
      },
    });
    bankAccountId = bank.id;

    // Seed Scope (Agriculture)
    const scope = await prisma.financialScope.create({
      data: {
        householdId,
        name: "Agriculture",
        icon: "sprout",
        color: "#84cc16",
        isSystem: true,
        isActive: true,
      },
    });
    scopeId = scope.id;

    // Seed Category
    const category = await prisma.category.create({
      data: {
        householdId,
        name: "Farm Expansion",
        type: "EXPENSE",
        isDefault: true,
        isActive: true,
      },
    });
    categoryId = category.id;

    // Link Scope & Category
    await prisma.scopeCategory.create({
      data: { scopeId, categoryId },
    });

    // Seed Cost Center / Facility
    const costCenter = await prisma.costCenter.create({
      data: {
        householdId,
        scopeId,
        name: "Goat Shed Facility #1",
        isSystem: false,
        isActive: true,
      },
    });
    costCenterId = costCenter.id;

    // Seed Asset (Goat Livestock Farm Land)
    const asset = await prisma.asset.create({
      data: {
        householdId,
        name: "Farm Plot A-12",
        category: "LAND",
        initialValue: new Prisma.Decimal(2500000),
        currentValue: new Prisma.Decimal(2500000),
        status: "ACTIVE",
      },
    });
    assetId = asset.id;
  });

  // 1. DRAFT CREATION & VALIDATION
  it("1. Creates draft borrowing with classification and asserts zero ledger mutations", async () => {
    const journalCountBefore = await prisma.journal.count({ where: { householdId } });

    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Agri Farm Tractor Loan",
      purpose: "Purchase of John Deere 5050D",
      principalAmount: 600000,
      interestRate: 8.5,
      tenureMonths: 24,
      borrowingType: "VEHICLE_LOAN",
      financingType: "SECURED",
      lenderName: "State Bank of India",
      scopeId,
      categoryId,
      costCenterId,
      assetId,
      userId,
    });

    expect(borrowing.id).toBeDefined();
    expect(borrowing.status).toBe("DRAFT");
    expect(Number(borrowing.principalAmount)).toBe(600000);
    expect(Number(borrowing.outstandingPrincipal)).toBe(0); // 0 until disbursed
    expect(borrowing.lender?.name).toBe("State Bank of India");

    // Invariant: Draft creation produces 0 journals and 0 account balance changes
    const journalCountAfter = await prisma.journal.count({ where: { householdId } });
    expect(journalCountAfter).toBe(journalCountBefore);

    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(bank?.balance)).toBe(1000000);
  });

  // 2. DISBURSEMENT DOUBLE-ENTRY
  it("2. Disburses loan: Debits bank account, credits liability, income remains zero, status ACTIVE", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Goat Farm Working Capital",
      principalAmount: 300000,
      interestRate: 10.0,
      tenureMonths: 12,
      borrowingType: "TERM_LOAN",
      lenderName: "Canara Bank",
      userId,
    });

    const disbursed = await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      notes: "Funds received via RTGS",
      userId,
    });

    expect(disbursed.status).toBe("ACTIVE");
    expect(Number(disbursed.outstandingPrincipal)).toBe(300000);
    expect(disbursed.disbursementJournalId).toBeDefined();

    // Verify Receiving Bank balance increased by 300,000 (1,000,000 -> 1,300,000)
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(bank?.balance)).toBe(1300000);

    // Verify Liability Account balance is 300,000
    const liabilityAcc = await prisma.account.findUnique({
      where: { id: disbursed.liabilityAccountId! },
    });
    expect(Number(liabilityAcc?.balance)).toBe(300000);

    // Invariant: Borrowing is NOT Income! Check Income Statement
    const incReport = await FinancialReportingService.getIncomeStatementReport(prisma, householdId);
    expect(Number(incReport.totalGrossIncome)).toBe(0);

    // Invariant: Repayment schedule generated with 12 installments
    const schedule = await prisma.repaymentSchedule.findFirst({
      where: { borrowingId: borrowing.id },
      include: { installments: true },
    });
    expect(schedule).toBeDefined();
    expect(schedule?.totalInstallments).toBe(12);
    expect(schedule?.installments.length).toBe(12);
  });

  // 3. PRINCIPAL REPAYMENT
  it("3. Repays principal: Debits liability, credits bank, expense remains zero, status PARTIALLY_SETTLED", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Agri Fence Loan",
      principalAmount: 100000,
      interestRate: 9.0,
      tenureMonths: 10,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Repay 40,000 Principal
    const repaid = await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 40000,
      interestAmount: 0,
      userId,
    });

    expect(repaid.status).toBe("PARTIALLY_SETTLED");
    expect(Number(repaid.outstandingPrincipal)).toBe(60000);
    expect(Number(repaid.totalPrincipalPaid)).toBe(40000);

    // Bank balance was 1,100,000 after disbursement; now 1,060,000
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(bank?.balance)).toBe(1060000);

    // Invariant: Principal repayment is NOT an ordinary Expense! Check Expense report
    const expReport = await FinancialReportingService.getIncomeStatementReport(prisma, householdId);
    expect(Number(expReport.totalExpenses)).toBe(0);
  });

  // 4. COMBINED EMI PAYMENT (PRINCIPAL + INTEREST)
  it("4. Posts EMI payment: Principal reduces liability, Interest posts as expense", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Cold Storage Loan",
      principalAmount: 200000,
      interestRate: 12.0,
      tenureMonths: 12,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Pay EMI: 15,000 Principal + 2,000 Interest (Total 17,000 deducted from bank)
    const paid = await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 15000,
      interestAmount: 2000,
      userId,
    });

    expect(Number(paid.outstandingPrincipal)).toBe(185000);
    expect(Number(paid.totalPrincipalPaid)).toBe(15000);
    expect(Number(paid.totalInterestPaid)).toBe(2000);

    // Verify Bank balance reduced by 17,000 (1,200,000 - 17,000 = 1,183,000)
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(bank?.balance)).toBe(1183000);

    // Verify Borrowing Financial Event was recorded as EMI_PAYMENT
    const emiEvent = await prisma.borrowingFinancialEvent.findFirst({
      where: { borrowingId: borrowing.id, eventType: "EMI_PAYMENT" },
    });
    expect(emiEvent).toBeDefined();
    expect(Number(emiEvent?.totalAmount)).toBe(17000);
    expect(Number(emiEvent?.principalAmount)).toBe(15000);
    expect(Number(emiEvent?.interestAmount)).toBe(2000);
  });

  // 5. OVER-REPAYMENT GUARD
  it("5. Rejects over-repayment exceeding outstanding principal", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Small Equipment Loan",
      principalAmount: 50000,
      interestRate: 0,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Attempt to repay 60,000 on a 50,000 loan
    await expect(
      BorrowingService.repayBorrowing(prisma, {
        householdId,
        borrowingId: borrowing.id,
        payingAccountId: bankAccountId,
        principalAmount: 60000,
        userId,
      })
    ).rejects.toThrow("OVER_REPAYMENT_ERROR");
  });

  // 6. FULL SETTLEMENT AUTOMATION
  it("6. Auto-settles loan to SETTLED when outstanding principal reaches zero", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Micro Fertilizer Loan",
      principalAmount: 25000,
      interestRate: 5.0,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Full Payoff
    const settled = await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 25000,
      interestAmount: 500,
      userId,
    });

    expect(settled.status).toBe("SETTLED");
    expect(Number(settled.outstandingPrincipal)).toBe(0);
    expect(Number(settled.totalPrincipalPaid)).toBe(25000);
  });

  // 7. SAFEGUARD 3: DISBURSEMENT REVERSAL BLOCKED IF REPAYMENTS EXIST
  it("7. Blocks disbursement reversal if subsequent repayments exist, and permits clean reversal if 0 repayments", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Pump Set Loan",
      principalAmount: 80000,
      interestRate: 8.0,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Make a partial repayment
    await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 10000,
      userId,
    });

    // Find disbursement event
    const disburseEvent = await prisma.borrowingFinancialEvent.findFirst({
      where: { borrowingId: borrowing.id, eventType: "DISBURSEMENT" },
    });

    // SAFEGUARD: Attempt to reverse disbursement MUST throw DISBURSEMENT_REVERSAL_BLOCKED
    await expect(
      BorrowingService.reverseEvent(prisma, {
        householdId,
        borrowingId: borrowing.id,
        eventId: disburseEvent!.id,
        reason: "Test reversal",
        userId,
      })
    ).rejects.toThrow("DISBURSEMENT_REVERSAL_BLOCKED");

    // Now test a clean disbursement reversal with 0 repayments:
    const cleanBorrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Unused Clean Loan",
      principalAmount: 50000,
      userId,
    });
    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: cleanBorrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    const cleanDisburseEvent = await prisma.borrowingFinancialEvent.findFirst({
      where: { borrowingId: cleanBorrowing.id, eventType: "DISBURSEMENT" },
    });

    const cancelled = await BorrowingService.reverseEvent(prisma, {
      householdId,
      borrowingId: cleanBorrowing.id,
      eventId: cleanDisburseEvent!.id,
      reason: "Loan agreement voided by bank",
      userId,
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(Number(cancelled.outstandingPrincipal)).toBe(0);

    // Verify compensating journal was created and original journal voided/reversed
    const originalJournal = await prisma.journal.findUnique({
      where: { id: cleanDisburseEvent!.journalId! },
      include: { reversals: true },
    });
    expect(originalJournal?.reversals.length).toBe(1);
  });

  // 8. REPAYMENT REVERSAL RESTORES PRINCIPAL
  it("8. Reverses repayment: creates compensating journal and restores outstanding principal", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Solar Inverter Loan",
      principalAmount: 120000,
      interestRate: 6.0,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Repay 30,000
    await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 30000,
      userId,
    });

    const repayEvent = await prisma.borrowingFinancialEvent.findFirst({
      where: { borrowingId: borrowing.id, eventType: "REPAYMENT" },
    });

    // Reverse repayment
    const restored = await BorrowingService.reverseEvent(prisma, {
      householdId,
      borrowingId: borrowing.id,
      eventId: repayEvent!.id,
      reason: "Cheque bounced",
      userId,
    });

    // Outstanding restored from 90,000 back to 120,000
    expect(Number(restored.outstandingPrincipal)).toBe(120000);
    expect(Number(restored.totalPrincipalPaid)).toBe(0);
    expect(restored.status).toBe("ACTIVE");
  });

  // 9. SAFEGUARD 4: DETERMINISTIC SCHEDULE GENERATION
  it("9. Schedule generation is locked after payments are recorded", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Milking Machine Loan",
      principalAmount: 60000,
      interestRate: 10.0,
      tenureMonths: 6,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Repay first installment
    await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 10000,
      userId,
    });

    // Attempting to blindly regenerate full schedule MUST fail
    await expect(
      BorrowingService.generateSchedule(prisma, {
        householdId,
        borrowingId: borrowing.id,
        tenureMonths: 12, // Trying to stretch tenure after payments started
        userId,
      })
    ).rejects.toThrow("SCHEDULE_LOCKED_AFTER_PAYMENTS");
  });

  // 10. SAFEGUARD 2: LEDGER BALANCE INVARIANT VERIFICATION
  it("10. Ledger Equality Invariant: Borrowing.outstandingPrincipal matches double-entry ledger entries with 0 drift", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Borewell Drilling Loan",
      principalAmount: 150000,
      interestRate: 7.5,
      tenureMonths: 15,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    await BorrowingService.repayBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      payingAccountId: bankAccountId,
      principalAmount: 25000,
      userId,
    });

    // Verify invariant: Liability Account Balance === Credits - Debits === outstandingPrincipal (125,000)
    const verification = await BorrowingService.verifyBorrowingLedgerBalance(
      prisma,
      borrowing.id,
      householdId
    );

    expect(verification.valid).toBe(true);
    expect(verification.projection).toBe(125000);
    expect(verification.ledgerBalance).toBe(125000);
    expect(verification.diff).toBe(0);
  });

  // 11. SAFEGUARD 1: DRAFT EXCLUSION & SINGLE AUTHORITATIVE SOURCE IN REPORTING
  it("11. Draft loans are strictly excluded from liability reporting, and zero double-counting occurs", async () => {
    // 1. Create a draft borrowing (500,000)
    await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Unapproved Proposed Expansion",
      principalAmount: 500000,
      userId,
    });

    // 2. Create an active borrowing (100,000)
    const activeBorrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Active Small Loan",
      principalAmount: 100000,
      userId,
    });
    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: activeBorrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Report should strictly show 100,000 outstanding, NOT 600,000!
    const liabilityReport = await FinancialReportingService.getLiabilityReport(prisma, householdId);
    expect(Number(liabilityReport.totalOutstanding)).toBe(100000);
    expect(Number(liabilityReport.totalPrincipal)).toBe(100000);

    const netWorthReport = await FinancialReportingService.getNetWorthReport(prisma, householdId);
    expect(Number(netWorthReport.liabilityBreakdown.loans)).toBe(100000);
  });

  // 12. SAFEGUARD 5: IDEMPOTENT LEGACY MIGRATION & RECONCILIATION
  it("12. Idempotent legacy migration: reconciles balances and prevents duplicates via unique linkage", async () => {
    // Create 2 legacy liabilities
    const legacy1 = await prisma.liability.create({
      data: {
        householdId,
        name: "Legacy Bank Loan 1",
        category: "LOAN",
        type: "PERSONAL_LOAN",
        principalAmount: new Prisma.Decimal(200000),
        outstandingAmount: new Prisma.Decimal(150000),
        interestRate: new Prisma.Decimal(10.0),
        status: "ACTIVE",
        lender: "Union Bank",
      },
    });

    const legacy2 = await prisma.liability.create({
      data: {
        householdId,
        name: "Legacy Vehicle Loan 2",
        category: "LOAN",
        type: "CAR_LOAN",
        principalAmount: new Prisma.Decimal(400000),
        outstandingAmount: new Prisma.Decimal(300000),
        interestRate: new Prisma.Decimal(9.5),
        status: "PARTIALLY_SETTLED",
        lender: "Kotak Mahindra Bank",
      },
    });

    // Run migration
    const migration1 = await migrateLiabilitiesToBorrowing(householdId);
    expect(migration1.totalLiabilitiesFound).toBe(2);
    expect(migration1.migratedCount).toBe(2);
    expect(migration1.skippedCount).toBe(0);
    expect(migration1.totalPriorOutstanding).toBe(450000);
    expect(migration1.totalNewOutstanding).toBe(450000);
    expect(migration1.reconciliationValid).toBe(true);

    // Verify legacy records retain authentic statuses
    const updatedLeg1 = await prisma.liability.findUnique({ where: { id: legacy1.id } });
    expect(updatedLeg1?.status).toBe("ACTIVE");

    // Invariant: Zero double counting in reporting after migration!
    const rep = await FinancialReportingService.getLiabilityReport(prisma, householdId);
    expect(Number(rep.totalOutstanding)).toBe(450000); // exactly 450,000, not 900,000!

    // Run migration a second time (Idempotency test)
    const migration2 = await migrateLiabilitiesToBorrowing(householdId);
    expect(migration2.migratedCount).toBe(0);
    expect(migration2.skippedCount).toBe(2); // Skipped because already linked
    expect(migration2.reconciliationValid).toBe(true);
  });

  // 13. RBAC MUTATION RESTRICTION
  it("13. Enforces strict RBAC: VIEWER cannot mutate borrowings", () => {
    const forbidden = assertCanMutate("VIEWER");
    expect(forbidden).not.toBeNull();
    expect(forbidden?.status).toBe(403);

    const allowedOwner = assertCanMutate("OWNER");
    expect(allowedOwner).toBeNull();

    const allowedMember = assertCanMutate("MEMBER");
    expect(allowedMember).toBeNull();
  });

  // 14. NON-CASH INTEREST ACCRUAL
  it("14. Accrues interest: Debits interest expense, credits liability, leaves bank cash unaffected", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Compounding Agri Loan",
      principalAmount: 100000,
      interestRate: 12.0,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    const bankBefore = await prisma.account.findUnique({ where: { id: bankAccountId } });

    // Accrue 1,000 monthly interest
    const event = await BorrowingService.accrueInterest(prisma, {
      householdId,
      borrowingId: borrowing.id,
      interestAmount: 1000,
      notes: "Month 1 Accrued Interest",
      userId,
    });

    expect(event.eventType).toBe("INTEREST_ACCRUED");
    expect(Number(event.interestAmount)).toBe(1000);

    // Verify Bank balance remained unchanged
    const bankAfter = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(bankAfter?.balance)).toBe(Number(bankBefore?.balance));
  });

  // 15. CLASSIFICATION VALIDATION
  it("15. Rejects creation with invalid or inactive financial scope", async () => {
    const inactiveScope = await prisma.financialScope.create({
      data: {
        householdId,
        name: "Decommissioned Scope",
        isActive: false,
      },
    });

    await expect(
      BorrowingService.createDraft(prisma, {
        householdId,
        name: "Invalid Scope Loan",
        principalAmount: 50000,
        scopeId: inactiveScope.id,
        userId,
      })
    ).rejects.toThrow("CLASSIFICATION_INVALID");
  });

  // 16. SOFT ARCHIVE & RESTORE
  it("16. Transitions between ARCHIVED and previous lifecycle status with audit trail", async () => {
    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId,
      name: "Short Term Note",
      principalAmount: 50000,
      userId,
    });

    await BorrowingService.disburseBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      receivingAccountId: bankAccountId,
      userId,
    });

    // Archive
    const archived = await BorrowingService.archiveBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      userId,
    });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).not.toBeNull();

    // Restore
    const restored = await BorrowingService.restoreBorrowing(prisma, {
      householdId,
      borrowingId: borrowing.id,
      userId,
    });
    expect(restored.status).toBe("ACTIVE");
    expect(restored.archivedAt).toBeNull();
  });

  // 17. HOUSEHOLD ISOLATION (IDOR DEFENSE)
  it("17. Defends against IDOR: Rejects disbursement on another household's borrowing", async () => {
    // Create Household B
    const userB = await prisma.user.create({
      data: { email: `tenant-b-${Date.now()}@example.com`, passwordHash: "hash", name: "User B" },
    });
    const hhB = await prisma.household.create({
      data: { name: "Household B", members: { create: { userId: userB.id, role: "OWNER" } } },
    });
    const bankB = await prisma.account.create({
      data: { householdId: hhB.id, name: "Bank B", type: "BANK", balance: new Prisma.Decimal(50000) },
    });

    const borrowingB = await BorrowingService.createDraft(prisma, {
      householdId: hhB.id,
      name: "Household B Secret Debt",
      principalAmount: 50000,
      userId: userB.id,
    });

    // Household A actor attempts to disburse Household B loan
    await expect(
      BorrowingService.disburseBorrowing(prisma, {
        householdId, // Household A context
        borrowingId: borrowingB.id,
        receivingAccountId: bankAccountId,
        userId,
      })
    ).rejects.toThrow("BORROWING_NOT_FOUND");
  });
});
