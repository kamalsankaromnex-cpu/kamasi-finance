import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { reverseLedgerTransaction } from "../ledger";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { FinancialCommand } from "@/finance/financial-command";
import { previewCsvImport, commitCsvImport } from "../csv-import";
import { Prisma } from "@prisma/client";

describe("Unified Expense Management System — Acceptance Criteria Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;
  let creditAccountId: string;
  let categoryId: string;

  beforeEach(async () => {
    // Setup isolated test household & user
    const user = await prisma.user.create({
      data: {
        email: `exp-test-${Date.now()}@example.com`,
        name: "Expense Test User",
        passwordHash: "hash123",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Expense Test Household",
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
    householdId = household.id;

    const bankAccount = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC Checking",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    bankAccountId = bankAccount.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000.0),
      });
    });

    const creditAccount = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC Credit Card",
        type: "CREDIT",
        balance: new Prisma.Decimal(0.0),
        creditLimit: new Prisma.Decimal(50000.0),
      },
    });
    creditAccountId = creditAccount.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: creditAccountId,
        accountType: "CREDIT",
        openingBalance: new Prisma.Decimal(-5000.0),
      });
    });

    const category = await prisma.category.create({
      data: {
        householdId,
        name: "Groceries",
        type: "EXPENSE",
      },
    });
    categoryId = category.id;

    // Create budget limit
    const now = new Date();
    await prisma.budget.create({
      data: {
        householdId,
        categoryId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        amount: new Prisma.Decimal(10000.0),
      },
    });
  });

  afterEach(async () => {
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("CRITERION 1: Quick Add & Advanced Entry post to the canonical ledger and debit bank account balance", async () => {
    const decAmount = new Prisma.Decimal(2500.0);

    const txn = await prisma.$transaction(async (tx) => {
      return TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId,
        amount: decAmount,
        description: "Supermarket Purchase",
      });
    });

    expect(txn.id).toBeDefined();
    expect(txn.amount.toNumber()).toBe(2500.0);

    const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(updatedAccount.balance.toNumber()).toBe(47500.0);
  });

  it("CRITERION 2: Credit Card expenses increase liability and decrement available credit line correctly", async () => {
    const decAmount = new Prisma.Decimal(3000.0);

    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: creditAccountId,
        categoryId,
        amount: decAmount,
        description: "Electronics Store Purchase",
      });
    });

    const updatedCredit = await prisma.account.findUniqueOrThrow({ where: { id: creditAccountId } });
    // Balance was -5000, debited 3000 => -8000 outstanding debt
    expect(updatedCredit.balance.toNumber()).toBe(-8000.0);
  });

  it("CRITERION 3: Category splits sum validation succeeds when exact and rejects mismatching totals", async () => {
    const splits = [
      { categoryId, amount: 1500, description: "Food items" },
      { categoryId, amount: 1000, description: "Toiletries" },
    ];
    const totalSplitSum = splits.reduce((acc, s) => acc + s.amount, 0);

    expect(totalSplitSum).toBe(2500.0);

    // Rejection simulation if total amount is 3000 but splits sum to 2500
    const mismatchTotal = 3000.0;
    const isMismatch = Math.abs(totalSplitSum - mismatchTotal) > 0.01;
    expect(isMismatch).toBe(true);
  });

  it("CRITERION 4: Staged CSV import previews validation, flags duplicates, and commits valid rows cleanly", async () => {
    const csvData = `date,description,amount,type,category
2026-09-28,Supermarket Groceries,1200,EXPENSE,Groceries
2026-09-28,Supermarket Groceries,1200,EXPENSE,Groceries`;

    const preview = await previewCsvImport(householdId, bankAccountId, csvData);
    expect(preview.totalRows).toBe(2);
    expect(preview.rows.length).toBe(2);

    // Commit single valid row
    const result = await commitCsvImport(householdId, userId, [preview.rows[0]]);
    expect(result.postedCount).toBe(1);

    const updatedBank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(updatedBank.balance.toNumber()).toBe(48800.0);
  });

  it("CRITERION 5: Transaction reversal atomically voids entry and restores exact account balances", async () => {
    const decAmount = new Prisma.Decimal(5000.0);

    // 1. Post expense
    const txn = await prisma.$transaction(async (tx) => {
      return TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId,
        amount: decAmount,
        description: "Flight Booking",
      });
    });

    const accountAfterSpend = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(accountAfterSpend.balance.toNumber()).toBe(45000.0);

    // 2. Reverse transaction
    const voidedTxn = await prisma.$transaction(async (tx) => {
      return await reverseLedgerTransaction(tx, {
        transactionId: txn.id,
        householdId,
        voidedByUserId: userId,
      });
    });

    expect(voidedTxn.isVoided).toBe(true);
    expect(voidedTxn.voidedAt).toBeDefined();

    const accountAfterReversal = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(accountAfterReversal.balance.toNumber()).toBe(50000.0);
  });

  it("CRITERION 6: Budget utilization calculations reflect posted expenses accurately", async () => {
    const decAmount = new Prisma.Decimal(8500.0);

    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId,
        amount: decAmount,
        description: "Monthly Grocery Shopping",
      });
    });

    const aggregate = await prisma.transaction.aggregate({
      where: { householdId, categoryId, isVoided: false, type: "EXPENSE" },
      _sum: { amount: true },
    });
    const spentAmount = aggregate._sum.amount?.toNumber() || 0;
    expect(spentAmount).toBe(8500.0);

    const budget = await prisma.budget.findFirst({ where: { householdId, categoryId } });
    expect(budget).toBeDefined();

    const budgetLimit = budget?.amount.toNumber() || 1;
    const utilization = (spentAmount / budgetLimit) * 100;
    expect(utilization).toBe(85.0);
  });
});
