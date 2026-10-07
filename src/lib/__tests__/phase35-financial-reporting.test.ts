import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { FinancialCommand } from "@/finance/financial-command";
import { IncomeDomainService } from "@/modules/income/income.service";
import { ExpenseDomainService } from "@/modules/expenses/expense.service";
import { AssetDomainService } from "@/modules/assets/asset.service";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { GoalDomainService } from "@/modules/goals/goal.service";

describe("Phase 3.5 — Financial Reporting Layer & Ledger Invariant Suite", () => {
  let household1Id: string;
  let household2Id: string;
  let user1Id: string;
  let bankAccount1Id: string;
  let bankAccount2Id: string;

  beforeEach(async () => {
    // Clean database before each test
    await prisma.auditEvent.deleteMany({});
    await prisma.investmentLifecycleHistory.deleteMany({});
    await prisma.investmentFinancialEvent.deleteMany({});
    await prisma.investmentLot.deleteMany({});
    await prisma.investment.deleteMany({});

    await prisma.assetLifecycleHistory.deleteMany({});
    await prisma.assetFinancialEvent.deleteMany({});
    await prisma.assetValuation.deleteMany({});
    await prisma.asset.deleteMany({});

    await prisma.liabilityLifecycleHistory.deleteMany({});
    await prisma.liabilityFinancialEvent.deleteMany({});
    await prisma.liability.deleteMany({});

    await prisma.goalLifecycleHistory.deleteMany({});
    await prisma.goal.deleteMany({});

    await prisma.transactionLifecycleHistory.deleteMany({});
    await prisma.incomeLifecycleHistory.deleteMany({});
    await prisma.incomeOccurrence.deleteMany({});
    await prisma.incomeSource.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    // Setup Test Household 1
    const user1 = await prisma.user.create({
      data: {
        email: "reporting.user@kamasi.test",
        name: "Reporting User",
        passwordHash: "dummy_hash",
      },
    });
    user1Id = user1.id;

    const household1 = await prisma.household.create({
      data: {
        name: "Reporting Household 1",
        members: { create: { userId: user1Id, role: "OWNER" } },
      },
    });
    household1Id = household1.id;

    // Setup Test Household 2
    const household2 = await prisma.household.create({
      data: { name: "Reporting Household 2" },
    });
    household2Id = household2.id;

    // Setup HDFC Bank Account for Household 1 (Starting Balance: ₹100,000 via double-entry opening balance)
    const bankAccount1 = await prisma.account.create({
      data: {
        householdId: household1Id,
        userId: user1Id,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(0),
      },
    });
    bankAccount1Id = bankAccount1.id;

    // Setup Opening Balance Journal (₹500,000 opening liquidity)
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: household1Id,
        accountId: bankAccount1Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(500000),
      });
    });

    // Setup Household 2 Account
    const bankAccount2 = await prisma.account.create({
      data: {
        householdId: household2Id,
        name: "Beta Bank",
        type: "BANK",
        balance: new Prisma.Decimal(25000),
      },
    });
    bankAccount2Id = bankAccount2.id;
  });

  it("1. Net Worth Report: Calculates Assets - Liabilities = Net Worth accurately", async () => {
    await prisma.$transaction(async (tx) => {
      // 1. Physical Asset: Land worth ₹5,00,000
      const landDraft = await AssetDomainService.createDraft(tx, {
        householdId: household1Id,
        name: "Agricultural Land",
        category: "LAND",
        initialValue: new Prisma.Decimal(500000),
        userId: user1Id,
      });
      await AssetDomainService.acquireAsset(tx, {
        assetId: landDraft.id,
        householdId: household1Id,
        amount: new Prisma.Decimal(500000),
        userId: user1Id,
      });

      // 2. Investment: Stocks worth ₹2,00,000
      const inv = await InvestmentDomainService.createDraft(tx, {
        householdId: household1Id,
        name: "Nifty Index Fund",
        category: "MUTUAL_FUND",
      });
      await InvestmentDomainService.buyInvestment(tx, {
        investmentId: inv.id,
        householdId: household1Id,
        quantity: new Prisma.Decimal(1000),
        pricePerUnit: new Prisma.Decimal(200),
        payingAccountId: bankAccount1Id, // Pays ₹200,000 from Bank
      });

      // 3. Liability: Personal Loan of ₹100,000
      const liab = await LiabilityDomainService.createDraft(tx, {
        householdId: household1Id,
        name: "Personal Loan",
        category: "LOAN",
        principalAmount: new Prisma.Decimal(100000),
      });
      await LiabilityDomainService.borrowLiability(tx, {
        liabilityId: liab.id,
        householdId: household1Id,
        receivingAccountId: bankAccount1Id, // Receives ₹100,000 in Bank
        userId: user1Id,
      });
    });

    const netWorthReport = await FinancialReportingService.getNetWorthReport(prisma, household1Id);

    // Bank: ₹500k opening - ₹200k investment buy + ₹100k loan borrow = ₹400,000
    // Assets: Liquid Bank ₹400k + Investments ₹200k + Land ₹500k = ₹1,100,000
    // Liabilities: Loan ₹100,000
    // Net Worth = ₹1,100,000 - ₹100,000 = ₹1,000,000
    expect(netWorthReport.totalAssets.toNumber()).toBe(1100000);
    expect(netWorthReport.totalLiabilities.toNumber()).toBe(100000);
    expect(netWorthReport.netWorth.toNumber()).toBe(1000000);
  });

  it("2. Income Statement & Expense Analysis: Derives Gross Income vs Expenses", async () => {
    await prisma.$transaction(async (tx) => {
      // Income: Salary ₹150,000
      const salarySource = await IncomeDomainService.createSource(tx, {
        householdId: household1Id,
        name: "Tech Salary",
        category: "SALARY",
      });
      const salExp = await IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: salarySource.id,
        name: "October Paycheck",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(150000),
      });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: salExp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: salExp.id, householdId: household1Id, accountId: bankAccount1Id });

      // Expense: Rent ₹30,000 & Groceries ₹10,000
      const exp1 = await ExpenseDomainService.createDraft(tx, {
        householdId: household1Id,
        userId: user1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(30000),
        description: "Monthly Apartment Rent",
        date: new Date("2026-10-05"),
      });
      await ExpenseDomainService.postDraft(tx, { expenseId: exp1.id, householdId: household1Id, userId: user1Id });

      const exp2 = await ExpenseDomainService.createDraft(tx, {
        householdId: household1Id,
        userId: user1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(10000),
        description: "Supermarket Groceries",
        date: new Date("2026-10-10"),
      });
      await ExpenseDomainService.postDraft(tx, { expenseId: exp2.id, householdId: household1Id, userId: user1Id });
    });

    const incomeReport = await FinancialReportingService.getIncomeStatementReport(prisma, household1Id, {
      from: new Date("2026-10-01"),
      to: new Date("2026-10-31"),
    });

    expect(incomeReport.totalGrossIncome.toNumber()).toBe(150000);
    expect(incomeReport.totalExpenses.toNumber()).toBe(40000);
    expect(incomeReport.netSavings.toNumber()).toBe(110000);
  });

  it("3. Cash Flow Report: Excludes Internal Transfers from Inflows/Outflows", async () => {
    // Create second bank account in Household 1
    const bankAccount1B = await prisma.account.create({
      data: { householdId: household1Id, userId: user1Id, name: "ICICI Secondary Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });

    await prisma.$transaction(async (tx) => {
      // Income Credit: ₹50,000 (Operating Inflow)
      const source = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Freelance", category: "FREELANCE" });
      const exp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Project Payout", periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(), expectedAmount: new Prisma.Decimal(50000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: exp.id, householdId: household1Id, accountId: bankAccount1Id });

      // Expense: ₹20,000 (Operating Outflow)
      const expenseDraft = await ExpenseDomainService.createDraft(tx, {
        householdId: household1Id,
        userId: user1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(20000),
        description: "Laptop Hardware",
      });
      await ExpenseDomainService.postDraft(tx, { expenseId: expenseDraft.id, householdId: household1Id, userId: user1Id });

      // Internal Transfer: ₹30,000 from Bank 1 to Bank 1B (MUST NOT be counted as Operating/Investing/Financing cash inflow/outflow)
      await FinancialCommand.postTransfer(tx, {
        householdId: household1Id,
        sourceAccountId: bankAccount1Id,
        destinationAccountId: bankAccount1B.id,
        amount: new Prisma.Decimal(30000),
        description: "Internal Liquidity Transfer",
      });
    });

    const cashFlow = await FinancialReportingService.getCashFlowReport(prisma, household1Id);

    expect(cashFlow.operating.inflows.toNumber()).toBe(50000);
    expect(cashFlow.operating.outflows.toNumber()).toBe(20000);
    expect(cashFlow.totalNetCashFlow.toNumber()).toBe(30000); // ₹50k - ₹20k = ₹30k net cash flow (transfer ignored)
  });

  it("4. Investment Report: Separates Realized Gain vs Unrealized Gain vs Dividend", async () => {
    await prisma.$transaction(async (tx) => {
      const inv = await InvestmentDomainService.createDraft(tx, { householdId: household1Id, name: "Reliance Equity", category: "STOCK" });
      
      // Buy 100 units @ ₹100 = ₹10,000 cost basis
      await InvestmentDomainService.buyInvestment(tx, {
        investmentId: inv.id,
        householdId: household1Id,
        quantity: new Prisma.Decimal(100),
        pricePerUnit: new Prisma.Decimal(100),
        payingAccountId: bankAccount1Id,
      });

      // Sell 50 units @ ₹150 = ₹7,500 proceeds (Cost basis sold: ₹5,000 -> Realized Gain: ₹2,500)
      await InvestmentDomainService.sellInvestment(tx, {
        investmentId: inv.id,
        householdId: household1Id,
        quantity: new Prisma.Decimal(50),
        pricePerUnit: new Prisma.Decimal(150),
        receivingAccountId: bankAccount1Id,
      });

      // Revalue remaining 50 units @ ₹200 = ₹10,000 market value (Cost basis remaining: ₹5,000 -> Unrealized Gain: ₹5,000)
      await InvestmentDomainService.revalueInvestment(tx, {
        investmentId: inv.id,
        householdId: household1Id,
        currentPricePerUnit: new Prisma.Decimal(200),
      });

      // Dividend Income ₹1,200
      await InvestmentDomainService.recordIncome(tx, {
        investmentId: inv.id,
        householdId: household1Id,
        incomeType: "DIVIDEND",
        amount: new Prisma.Decimal(1200),
        receivingAccountId: bankAccount1Id,
      });
    });

    const invReport = await FinancialReportingService.getInvestmentReport(prisma, household1Id);

    expect(invReport.totalCostBasis.toNumber()).toBe(5000);
    expect(invReport.totalMarketValue.toNumber()).toBe(10000);
    expect(invReport.totalRealizedGainLoss.toNumber()).toBe(2500);
    expect(invReport.totalUnrealizedGainLoss.toNumber()).toBe(5000);
    expect(invReport.totalDividends.toNumber()).toBe(1200);
    expect(invReport.totalReturn.toNumber()).toBe(8700); // ₹2500 + ₹5000 + ₹1200
  });

  it("5. Goal Report: Calculates Completion % & Required Monthly Contribution", async () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    await prisma.$transaction(async (tx) => {
      const goal = await GoalDomainService.createGoal(tx, {
        householdId: household1Id,
        userId: user1Id,
        name: "Sister Marriage Fund",
        targetAmount: new Prisma.Decimal(500000),
        targetDate: nextYear,
      });

      await GoalDomainService.depositToGoal(tx, {
        goalId: goal.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(200000),
        userId: user1Id,
      });
    });

    const goalReport = await FinancialReportingService.getGoalReport(prisma, household1Id);
    const goalData = goalReport.goals[0];

    expect(goalData.targetAmount.toNumber()).toBe(500000);
    expect(goalData.currentAmount.toNumber()).toBe(200000);
    expect(goalData.remainingAmount.toNumber()).toBe(300000);
    expect(goalData.completionPercentage).toBe(40); // 200k / 500k = 40%
    expect(goalData.requiredMonthlyContribution.toNumber()).toBeGreaterThan(0);
  });

  it("6. Household Isolation: Prevents Household 2 from reading Household 1's reports", async () => {
    await prisma.$transaction(async (tx) => {
      const draft = await AssetDomainService.createDraft(tx, {
        householdId: household1Id,
        name: "Secret Villa",
        category: "PROPERTY",
        initialValue: new Prisma.Decimal(1000000),
        userId: user1Id,
      });
      await AssetDomainService.acquireAsset(tx, {
        assetId: draft.id,
        householdId: household1Id,
        amount: new Prisma.Decimal(1000000),
        userId: user1Id,
      });
    });

    const reportH2 = await FinancialReportingService.getNetWorthReport(prisma, household2Id);
    expect(reportH2.assetBreakdown.physicalAssets.toNumber()).toBe(0); // Household 2 sees 0 physical assets from Household 1
    expect(reportH2.netWorth.toNumber()).toBe(25000); // Household 2 only sees its own ₹25,000 bank account
  });

  it("7. Hard Regression Invariant: Ledger-Derived Balance === Account.balance === Report-Derived Balance", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Consulting", category: "FREELANCE" });
      const exp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Consulting Fee", periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(), expectedAmount: new Prisma.Decimal(80000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: exp.id, householdId: household1Id, accountId: bankAccount1Id });

      const expenseDraft = await ExpenseDomainService.createDraft(tx, {
        householdId: household1Id,
        userId: user1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(25000),
        description: "Office Supplies",
      });
      await ExpenseDomainService.postDraft(tx, { expenseId: expenseDraft.id, householdId: household1Id, userId: user1Id });
    });

    const validation = await FinancialReportingService.validateLedgerEquality(prisma, household1Id);
    expect(validation.valid).toBe(true);

    const bankAcc = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    const report = await FinancialReportingService.getNetWorthReport(prisma, household1Id);

    // Starting ₹500,000 + ₹80,000 income - ₹25,000 expense = ₹555,000
    expect(bankAcc.balance.toNumber()).toBe(555000);
    expect(report.assetBreakdown.liquidCash.toNumber()).toBe(555000);
  });
});
