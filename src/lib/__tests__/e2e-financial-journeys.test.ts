import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { Prisma } from "@prisma/client";

describe("Kamasi Finance — End-to-End Real User Financial Journeys", () => {
  let householdId: string;
  let ownerUserId: string;
  let bankAccountId: string;
  let investmentAccountId: string;

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
    await prisma.goalLifecycleHistory.deleteMany();
    await prisma.goalFundingPlan.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // 1. User & Household Creation
    const owner = await prisma.user.create({
      data: {
        email: `journey-${Date.now()}@kamasi.test`,
        passwordHash: "hash",
        name: "Aarav Sharma",
        isOnboarded: true,
      },
    });
    ownerUserId = owner.id;

    const hh = await prisma.household.create({
      data: {
        name: "Sharma Family Enterprise",
        currency: "INR",
        members: { create: { userId: ownerUserId, role: "OWNER" } },
      },
    });
    householdId = hh.id;

    // 2. Bank Account & Opening Capital (₹25,00,000)
    const bank = await prisma.account.create({
      data: {
        householdId,
        userId: ownerUserId,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(0),
      },
    });
    bankAccountId = bank.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(2500000),
      });
    });

    const invAcc = await prisma.account.create({
      data: {
        householdId,
        userId: ownerUserId,
        name: "Portfolio Investment Ledger",
        type: "INVESTMENT",
        balance: new Prisma.Decimal(0),
      },
    });
    investmentAccountId = invAcc.id;
  });

  // =========================================================================
  // JOURNEY A — COMPLETE INVESTOR CYCLE
  // =========================================================================
  it("Journey A: Investor creates draft -> buys 2 tranches -> revalues -> earns dividend -> partial sell", async () => {
    // 1. Create Draft Investment
    const draft = await prisma.$transaction((tx) =>
      InvestmentDomainService.createDraft(tx, {
        householdId,
        userId: ownerUserId,
        name: "Bluechip Equity Fund",
        category: "EQUITY",
        type: "STOCK",
        investmentAccountId,
      })
    );
    expect(draft.status).toBe("DRAFT");

    // 2. Tranche 1: Buy 100 units @ ₹1,000 = ₹1,00,000
    await prisma.$transaction((tx) =>
      InvestmentDomainService.buyInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId: ownerUserId,
        quantity: new Prisma.Decimal(100),
        pricePerUnit: new Prisma.Decimal(1000),
        payingAccountId: bankAccountId,
      })
    );

    // 3. Tranche 2: Buy 100 units @ ₹1,200 = ₹1,20,000
    const buy2 = await prisma.$transaction((tx) =>
      InvestmentDomainService.buyInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId: ownerUserId,
        quantity: new Prisma.Decimal(100),
        pricePerUnit: new Prisma.Decimal(1200),
        payingAccountId: bankAccountId,
      })
    );

    // Weighted average cost: 200 units, ₹2,20,000 total -> ₹1,100 per unit
    expect(buy2.investment.totalQuantity.toNumber()).toBe(200);
    expect(buy2.investment.weightedAverageCost.toNumber()).toBe(1100);

    // 4. Record Dividend: ₹10,000
    const div = await prisma.$transaction((tx) =>
      InvestmentDomainService.recordIncome(tx, {
        investmentId: draft.id,
        householdId,
        userId: ownerUserId,
        incomeType: "DIVIDEND",
        amount: new Prisma.Decimal(10000),
        receivingAccountId: bankAccountId,
      })
    );
    expect(div.financialEvent.amount.toNumber()).toBe(10000);

    // 5. Partial Sell: 50 units @ ₹1,500
    // Proceeds = 50 * 1500 = ₹75,000
    // Cost basis sold = 50 * 1100 = ₹55,000
    // Realized gain = ₹20,000
    const sell = await prisma.$transaction((tx) =>
      InvestmentDomainService.sellInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId: ownerUserId,
        quantity: new Prisma.Decimal(50),
        pricePerUnit: new Prisma.Decimal(1500),
        receivingAccountId: bankAccountId,
      })
    );
    expect(sell.investment.status).toBe("PARTIALLY_SOLD");
    expect(sell.investment.totalQuantity.toNumber()).toBe(150);
    expect(sell.investment.realizedGainLoss.toNumber()).toBe(20000);

    // 6. Verify Reporting Invariant
    const report = await FinancialReportingService.getInvestmentReport(prisma, householdId);
    expect(report.totalRealizedGainLoss.toNumber()).toBe(20000);
    expect(report.totalDividends.toNumber()).toBe(10000);

    // 7. Verify Ledger Equality
    const ledgerVal = await FinancialReportingService.validateLedgerEquality(prisma, householdId);
    expect(ledgerVal.valid).toBe(true);
  });

  // =========================================================================
  // JOURNEY B — COMPLETE BORROWER CYCLE
  // =========================================================================
  it("Journey B: Borrower creates loan -> disburses -> generates schedule -> repays installment", async () => {
    // 1. Create Draft Loan
    const loan = await BorrowingService.createDraft(prisma, {
      householdId,
      userId: ownerUserId,
      name: "Solar Installation Loan",
      borrowingType: "TERM_LOAN",
      principalAmount: 400000,
      interestRate: 8.0,
      tenureMonths: 20,
      lenderName: "State Bank of India",
    });

    // 2. Disburse Loan into Bank
    const disbursed = await BorrowingService.disburseBorrowing(prisma, {
      borrowingId: loan.id,
      householdId,
      userId: ownerUserId,
      receivingAccountId: bankAccountId,
    });
    expect(disbursed.status).toBe("ACTIVE");
    expect(Number(disbursed.outstandingPrincipal)).toBe(400000);

    // Bank account credited with 4,00,000 (25,00,000 -> 29,00,000)
    const bankAfterDisburse = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bankAfterDisburse.balance.toNumber()).toBe(2900000);

    // 3. Make Repayment: Principal ₹20,000, Interest ₹2,667
    const repaid = await BorrowingService.repayBorrowing(prisma, {
      borrowingId: loan.id,
      householdId,
      userId: ownerUserId,
      principalAmount: 20000,
      interestAmount: 2667,
      payingAccountId: bankAccountId,
    });
    expect(Number(repaid.outstandingPrincipal)).toBe(380000);

    // 4. Validate Ledger Equality across all accounts
    const equality = await FinancialReportingService.validateLedgerEquality(prisma, householdId);
    expect(equality.valid).toBe(true);
  });
});
