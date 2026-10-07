import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { commitCsvImport } from "../csv-import";
import { Prisma } from "@prisma/client";

describe("Global Financial Integrity & Ledger Reconciliation Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;
  let creditAccountId: string;
  let transferAccountId: string;

  beforeEach(async () => {
    // Clear test database state
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.investmentActivity.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.assetValuation.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Create base user & household
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        passwordHash: "hashed",
        name: "Financial Core Test User",
        isOnboarded: true,
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Test Financial Household",
        currency: "INR",
        members: {
          create: { userId, role: "OWNER" },
        },
      },
    });
    householdId = household.id;

    // Create test accounts with 0 balance
    const bank = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(0),
      },
    });
    bankAccountId = bank.id;

    const credit = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "ICICI Credit Card",
        type: "CREDIT",
        balance: new Prisma.Decimal(0),
        creditLimit: new Prisma.Decimal(50000),
      },
    });
    creditAccountId = credit.id;

    const transferAcc = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "Axis Savings Bank",
        type: "BANK",
        balance: new Prisma.Decimal(0),
      },
    });
    transferAccountId = transferAcc.id;
  });

  afterEach(async () => {
    // Verify reconciliation for all active accounts after every test
    const results = await ReconciliationService.reconcileHousehold(householdId);
    for (const res of results) {
      expect(res.status, `Account ${res.accountName} (${res.accountId}) drifted! Stored: ${res.storedBalance}, Calculated: ${res.calculatedBalance}`).toBe("MATCH");
    }
  });

  it("Scenario 1: Opening Balance — Asset & Liability", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: creditAccountId,
        accountType: "CREDIT",
        openingBalance: new Prisma.Decimal(-5000),
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10000);

    const credit = await prisma.account.findUniqueOrThrow({ where: { id: creditAccountId } });
    expect(credit.balance.toNumber()).toBe(-5000);
  });

  it("Scenario 2: Expense — Opening ₹10,000, Spend ₹2,000 => Account ₹8,000", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });
    });

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(2000),
        description: "Grocery Expense",
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(8000);
  });

  it("Scenario 3: Income — Opening ₹10,000, Income ₹5,000 => Account ₹15,000", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postIncome(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(5000),
        description: "Freelance Payment",
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(15000);
  });

  it("Scenario 4: Transfer — A=₹10,000, B=₹5,000, Transfer ₹3,000 => A=₹7,000, B=₹8,000", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: transferAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(5000),
      });

      await FinancialCommand.postTransfer(tx, {
        householdId,
        sourceAccountId: bankAccountId,
        destinationAccountId: transferAccountId,
        amount: new Prisma.Decimal(3000),
        description: "Fund Transfer A -> B",
      });
    });

    const bankA = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    const bankB = await prisma.account.findUniqueOrThrow({ where: { id: transferAccountId } });

    expect(bankA.balance.toNumber()).toBe(7000);
    expect(bankB.balance.toNumber()).toBe(8000);
  });

  it("Scenario 5 & 6: Goal Contribution & Goal Withdrawal", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });
    });

    // Goal Contribution ₹3,000 => Bank = ₹7,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postGoalContribution(tx, {
        householdId,
        accountId: bankAccountId,
        goalName: "Emergency Fund",
        amount: new Prisma.Decimal(3000),
      });
    });

    let bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(7000);

    // Goal Withdrawal ₹1,000 => Bank = ₹8,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postGoalWithdrawal(tx, {
        householdId,
        accountId: bankAccountId,
        goalName: "Emergency Fund",
        amount: new Prisma.Decimal(1000),
      });
    });

    bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(8000);
  });

  it("Scenario 7: Refund — Expense ₹5,000, Refund ₹2,000 => Net Expense ₹3,000", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postExpense(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(5000),
        description: "Electronics Purchase",
      });

      await FinancialCommand.postRefund(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(2000),
        description: "Partial Item Refund",
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(7000);
  });

  it("Scenario 8: Reversal — Expense ₹5,000, Reverse => Net Financial Effect = ₹0", async () => {
    let journalId = "";
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      const journal = await FinancialCommand.postExpense(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(5000),
        description: "Hotel Booking",
      });
      journalId = journal.id;
    });

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postReversal(tx, journalId, householdId);
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10000);
  });

  it("Scenario 9, 10 & 11: Investment Buy, Sell & Dividend", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(20000),
      });
    });

    // Buy Investment ₹10,000 => Bank = ₹10,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postInvestmentBuy(tx, {
        householdId,
        accountId: bankAccountId,
        investmentName: "Nifty 50 Index Fund",
        totalAmount: new Prisma.Decimal(10000),
      });
    });

    let bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10000);

    // Dividend ₹500 => Bank = ₹10,500
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postDividend(tx, {
        householdId,
        accountId: bankAccountId,
        investmentName: "Nifty 50 Index Fund",
        amount: new Prisma.Decimal(500),
      });
    });

    bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10500);

    // Sell Investment ₹4,000 => Bank = ₹14,500
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postInvestmentSell(tx, {
        householdId,
        accountId: bankAccountId,
        investmentName: "Nifty 50 Index Fund",
        totalAmount: new Prisma.Decimal(4000),
      });
    });

    bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(14500);
  });

  it("Scenario 12: Loan Payment (EMI) — Principal ₹18,000 + Interest ₹7,000 = ₹25,000 Deduction", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000),
      });

      await FinancialCommand.postLoanPayment(tx, {
        householdId,
        payingAccountId: bankAccountId,
        liabilityName: "HDFC Home Loan",
        principalAmount: new Prisma.Decimal(18000),
        interestAmount: new Prisma.Decimal(7000),
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(25000);
  });

  it("Scenario 13 & 14: Asset Purchase & Sale", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000),
      });

      // Buy Asset ₹40,000 => Bank = ₹60,000
      await FinancialCommand.postAssetPurchase(tx, {
        householdId,
        payingAccountId: bankAccountId,
        assetName: "Gold Coins",
        amount: new Prisma.Decimal(40000),
      });
    });

    let bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(60000);

    // Sell Asset ₹45,000 => Bank = ₹105,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postAssetSale(tx, {
        householdId,
        receivingAccountId: bankAccountId,
        assetName: "Gold Coins",
        amount: new Prisma.Decimal(45000),
      });
    });

    bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(105000);
  });

  it("Scenario 15: Non-Cash Asset Valuation Adjustment", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      // Valuation gain ₹50,000 (does not affect bank account balance)
      await FinancialCommand.postAssetValuationAdjustment(tx, {
        householdId,
        assetName: "Real Estate Property",
        deltaAmount: new Prisma.Decimal(50000),
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10000);
  });

  it("Scenario 16: Explicit Account Adjustment", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postAdjustment(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(500),
        reason: "Bank statement reconciliation difference",
      });
    });

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(10500);
  });

  it("Scenario 17: CSV Import Financial Engine Execution", async () => {
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });
    });

    const rows = [
      {
        rowId: "row-1",
        date: "2026-09-30",
        description: "Salary Credit CSV",
        amount: 5000,
        type: "INCOME" as const,
        accountId: bankAccountId,
        categoryId: null,
        categoryName: null,
        isDuplicate: false,
        status: "VALID" as const,
      },
      {
        rowId: "row-2",
        date: "2026-09-30",
        description: "Fuel Expense CSV",
        amount: 1500,
        type: "EXPENSE" as const,
        accountId: bankAccountId,
        categoryId: null,
        categoryName: null,
        isDuplicate: false,
        status: "VALID" as const,
      },
    ];

    const result = await commitCsvImport(householdId, userId, rows);
    expect(result.postedCount).toBe(2);

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(13500);
  });

  it("Scenario 18: Idempotency Key Duplicate Rejection", async () => {
    const key = `idem-${Date.now()}`;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000),
      });

      await FinancialCommand.postExpense(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(2000),
        description: "Utility Bill",
        idempotencyKey: key,
      });
    });

    // Re-send identical command with same key
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(2000),
        description: "Utility Bill",
        idempotencyKey: key,
      });
    });

    const journals = await prisma.journal.findMany({ where: { idempotencyKey: key } });
    expect(journals.length).toBe(1);

    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(bank.balance.toNumber()).toBe(8000);
  });
});
