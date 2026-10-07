import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { FinancialCommand } from "@/finance/financial-command";
import { Prisma } from "@prisma/client";

describe("Kamasi Finance — Real-Life End-to-End Financial Test Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;
  let savingsAccountId: string;
  let groceryCatId: string;
  let rentCatId: string;
  let utilityCatId: string;
  let salaryCatId: string;

  beforeEach(async () => {
    // 1. Setup Test User and Household
    const user = await prisma.user.create({
      data: {
        email: `qa-e2e-${Date.now()}@kamasi.com`,
        name: "Kamal QA Tester",
        passwordHash: "securepass123",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "QA Family Household",
        currency: "INR",
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
    householdId = household.id;

    // 2. Setup Accounts with Initial Balances via FinancialCommand.postOpeningBalance
    const checking = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC Primary Checking",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    bankAccountId = checking.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId,
        accountId: bankAccountId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000.0),
      });
    });

    const savings = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "HDFC High-Yield Savings",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    savingsAccountId = savings.id;

    // 3. Setup Categories
    const groc = await prisma.category.create({ data: { householdId, name: "Groceries", type: "EXPENSE" } });
    groceryCatId = groc.id;

    const rent = await prisma.category.create({ data: { householdId, name: "Rent & Housing", type: "EXPENSE" } });
    rentCatId = rent.id;

    const util = await prisma.category.create({ data: { householdId, name: "Utilities", type: "EXPENSE" } });
    utilityCatId = util.id;

    const sal = await prisma.category.create({ data: { householdId, name: "Salary Income", type: "INCOME" } });
    salaryCatId = sal.id;
  });

  afterEach(async () => {
    await prisma.household.deleteMany({ where: { id: householdId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("EXECUTES END-TO-END SCENARIO: Opening ₹10k, Salary +₹40k, Groceries -₹5k, Rent -₹10k, Electricity -₹2k, Savings Transfer ₹8k", async () => {
    // Step 1: Salary Received (₹40,000 Income)
    const salAmount = new Prisma.Decimal(40000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createIncome(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId: salaryCatId,
        amount: salAmount,
        description: "Monthly Salary Credit",
      });
    });

    // Step 2: Groceries Expense (₹5,000 Expense)
    const grocAmount = new Prisma.Decimal(5000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId: groceryCatId,
        amount: grocAmount,
        description: "Supermarket Groceries",
      });
    });

    // Step 3: Rent Payment (₹10,000 Expense)
    const rentAmount = new Prisma.Decimal(10000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId: rentCatId,
        amount: rentAmount,
        description: "Monthly House Rent",
      });
    });

    // Step 4: Electricity Bill (₹2,000 Expense)
    const utilAmount = new Prisma.Decimal(2000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createExpense(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        categoryId: utilityCatId,
        amount: utilAmount,
        description: "Electricity Bill Payment",
      });
    });

    // Step 5: Own-Account Transfer to Savings (₹8,000 Transfer - NOT an expense)
    const transferAmount = new Prisma.Decimal(8000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createTransfer(tx, {
        householdId,
        userId,
        accountId: bankAccountId,
        transferAccountId: savingsAccountId,
        amount: transferAmount,
        description: "Transfer to Savings",
      });
    });

    // === VERIFICATION & AUDIT RECONCILIATION ===

    // 1. Primary Bank Account Balance Reconciliation
    // ₹10,000 opening + ₹40,000 salary - ₹5,000 groc - ₹10,000 rent - ₹2,000 util - ₹8,000 transfer = ₹25,000
    const checkingAccount = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(checkingAccount.balance.toNumber()).toBe(25000.0);

    // 2. Savings Account Balance Reconciliation
    // ₹0 opening + ₹8,000 transfer = ₹8,000
    const savingsAccount = await prisma.account.findUniqueOrThrow({ where: { id: savingsAccountId } });
    expect(savingsAccount.balance.toNumber()).toBe(8000.0);

    // 3. Total Eligible Expenses Reconciliation (Groceries + Rent + Electricity)
    // ₹5,000 + ₹10,000 + ₹2,000 = ₹17,000 (Transfer of ₹8,000 is EXCLUDED from expenses)
    const totalExpensesAgg = await prisma.transaction.aggregate({
      where: { householdId, type: "EXPENSE", isVoided: false },
      _sum: { amount: true },
    });
    const totalExpenses = totalExpensesAgg._sum.amount?.toNumber() || 0;
    expect(totalExpenses).toBe(17000.0);

    // 4. Total Income Reconciliation
    const totalIncomeAgg = await prisma.transaction.aggregate({
      where: { householdId, type: "INCOME", isVoided: false },
      _sum: { amount: true },
    });
    const totalIncome = totalIncomeAgg._sum.amount?.toNumber() || 0;
    expect(totalIncome).toBe(40000.0);

    // 5. Net Income Less Expenses Reconciliation
    // ₹40,000 Income - ₹17,000 Expenses = ₹23,000
    const netIncomeLessExpenses = totalIncome - totalExpenses;
    expect(netIncomeLessExpenses).toBe(23000.0);

    // 6. Net Worth Accounting
    // Total Assets (Checking ₹25,000 + Savings ₹8,000) - Total Liabilities (₹0) = ₹33,000 Total Net Worth
    const netWorth = checkingAccount.balance.toNumber() + savingsAccount.balance.toNumber();
    expect(netWorth).toBe(33000.0);
  });
});
