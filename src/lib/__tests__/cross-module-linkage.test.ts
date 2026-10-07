import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";
import { AssetDomainService } from "@/modules/assets/asset.service";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { CrossModuleIntegrityService } from "@/finance/monitoring/cross-module-integrity.service";
import { assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

describe("Kamasi Finance — Cross-Module Linkage & Dependency Integrity Suite", () => {
  let householdAId: string;
  let userAId: string;
  let bankAccountAId: string;
  let invAccountAId: string;

  let householdBId: string;
  let userBId: string;
  let bankAccountBId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.investmentLifecycleHistory.deleteMany();
    await prisma.investmentFinancialEvent.deleteMany();
    await prisma.investmentLot.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.repaymentInstallment.deleteMany();
    await prisma.repaymentSchedule.deleteMany();
    await prisma.borrowingFinancialEvent.deleteMany();
    await prisma.borrowingLifecycleHistory.deleteMany();
    await prisma.borrowing.deleteMany();
    await prisma.lender.deleteMany();
    await prisma.assetFinancialEvent.deleteMany();
    await prisma.assetLifecycleHistory.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.goalLifecycleHistory.deleteMany();
    await prisma.goalFundingPlan.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Setup Household A
    const userA = await prisma.user.create({
      data: { email: `linkage-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A Owner", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A Linkage", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const bankA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "State Bank of India Checking", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    bankAccountAId = bankA.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: bankAccountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(5000000), // ₹50 Lakhs
      });
    });

    const invA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Ledger Investment Holding Acc", type: "INVESTMENT", balance: new Prisma.Decimal(0) },
    });
    invAccountAId = invA.id;

    // Setup Household B (Strict Tenant Isolation)
    const userB = await prisma.user.create({
      data: { email: `linkage-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B Tenant", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B Isolated", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const bankB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "Axis Bank Checking B", type: "BANK", balance: new Prisma.Decimal(100000) },
    });
    bankAccountBId = bankB.id;
  });

  // =========================================================================
  // 1. ACCOUNT & BANKING LINKAGE INTEGRITY
  // =========================================================================
  describe("1. Account & Banking Linkage Integrity", () => {
    it("fails cleanly when required payment/funding account does not exist or is invalid", async () => {
      const nonExistentAccountId = "acc_non_existent_12345";

      // 1.1 Expense without account
      await expect(
        prisma.$transaction((tx) =>
          FinancialCommand.postExpense(tx, {
            householdId: householdAId,
            accountId: nonExistentAccountId,
            amount: new Prisma.Decimal(500),
            date: new Date(),
            description: "Test Expense No Acc",
          })
        )
      ).rejects.toThrow();

      // 1.2 Investment BUY without account
      const invDraft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Test Stock",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: invAccountAId,
        })
      );

      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.buyInvestment(tx, {
            investmentId: invDraft.id,
            householdId: householdAId,
            userId: userAId,
            quantity: new Prisma.Decimal(10),
            pricePerUnit: new Prisma.Decimal(100),
            payingAccountId: nonExistentAccountId,
          })
        )
      ).rejects.toThrow("ACCOUNT_UNAVAILABLE");
    });

    it("strictly blocks cross-household account usage across all domains", async () => {
      const loan = await BorrowingService.createDraft(prisma, {
        householdId: householdAId,
        userId: userAId,
        name: "Home Loan A",
        borrowingType: "TERM_LOAN",
        principalAmount: 2500000,
        interestRate: 8.5,
        tenureMonths: 240,
        lenderName: "HDFC Home Finance",
      });

      // Attempt disbursement into Household B's account
      await expect(
        BorrowingService.disburseBorrowing(prisma, {
          borrowingId: loan.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountBId, // Household B's account!
        })
      ).rejects.toThrow("ACCOUNT_UNAVAILABLE");
    });
  });

  // =========================================================================
  // 2. BORROWING & DOWNSTREAM REPAYMENT INVARIANTS
  // =========================================================================
  describe("2. Borrowing & Downstream Repayment Invariants", () => {
    it("preserves invariant: disbursement reversal is BLOCKED once downstream repayments exist", async () => {
      const loan = await BorrowingService.createDraft(prisma, {
        householdId: householdAId,
        userId: userAId,
        name: "Auto Loan",
        borrowingType: "VEHICLE_LOAN",
        principalAmount: 500000,
        interestRate: 9.0,
        tenureMonths: 36,
        lenderName: "ICICI Bank",
      });

      // Disburse
      await BorrowingService.disburseBorrowing(prisma, {
        borrowingId: loan.id,
        householdId: householdAId,
        userId: userAId,
        receivingAccountId: bankAccountAId,
      });

      // Record 1 repayment
      await BorrowingService.repayBorrowing(prisma, {
        borrowingId: loan.id,
        householdId: householdAId,
        userId: userAId,
        principalAmount: 15000,
        interestAmount: 3750,
        payingAccountId: bankAccountAId,
      });

      const disburseEvent = await prisma.borrowingFinancialEvent.findFirst({
        where: { borrowingId: loan.id, eventType: "DISBURSEMENT" },
      });

      // Attempt to reverse initial disbursement while repayment exists -> MUST FAIL
      await expect(
        BorrowingService.reverseEvent(prisma, {
          householdId: householdAId,
          borrowingId: loan.id,
          eventId: disburseEvent!.id,
          reason: "Attempt reverse with active repayment",
          userId: userAId,
        })
      ).rejects.toThrow("DISBURSEMENT_REVERSAL_BLOCKED");
    });
  });

  // =========================================================================
  // 3. INVESTMENT & OVERSOLD PREVENTION
  // =========================================================================
  describe("3. Investment Oversell & Unit Integrity", () => {
    it("strictly prevents selling more units than available holdings", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Tata Consultancy Services",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: invAccountAId,
        })
      );

      // Buy 50 units
      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(3500),
          payingAccountId: bankAccountAId,
        })
      );

      // Attempt to sell 60 units -> MUST FAIL
      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.sellInvestment(tx, {
            investmentId: draft.id,
            householdId: householdAId,
            userId: userAId,
            quantity: new Prisma.Decimal(60),
            pricePerUnit: new Prisma.Decimal(3600),
            receivingAccountId: bankAccountAId,
          })
        )
      ).rejects.toThrow("INVALID_QUANTITY");
    });
  });

  // =========================================================================
  // 4. REPORTING EQUALITY & LEDGER INVARIANT
  // =========================================================================
  describe("4. Reporting & Ledger Equality Verification", () => {
    it("proves Account.balance equals ledger-derived balance for all accounts", async () => {
      // Perform multi-module transactions
      // 1. Expense
      await prisma.$transaction((tx) =>
        FinancialCommand.postExpense(tx, {
          householdId: householdAId,
          accountId: bankAccountAId,
          amount: new Prisma.Decimal(25000),
          date: new Date(),
          description: "Office Supplies",
        })
      );

      // 2. Investment Buy
      const inv = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "HDFC Mutual Fund",
          category: "MUTUAL_FUNDS",
          type: "MUTUAL_FUND",
          investmentAccountId: invAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: inv.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(500),
          payingAccountId: bankAccountAId,
        })
      );

      // 3. Validate Ledger Equality invariant
      const validation = await FinancialReportingService.validateLedgerEquality(prisma, householdAId);
      expect(validation.valid).toBe(true);
      expect(validation.accounts.every((a) => a.diff < 0.01)).toBe(true);
    });
  });

  // =========================================================================
  // 5. ORPHAN SCANNER & CROSS-MODULE INTEGRITY SERVICE
  // =========================================================================
  describe("5. Automated Cross-Module Integrity & Orphan Scanner", () => {
    it("scans clean across all relations and detects zero orphan or cross-tenant records", async () => {
      const scan = await CrossModuleIntegrityService.scanIntegrity(prisma);
      expect(scan.isHealthy).toBe(true);
      expect(scan.totalViolations).toBe(0);
      expect(scan.violations.length).toBe(0);
    });
  });
});
