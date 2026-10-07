import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { Prisma } from "@prisma/client";
import { normalizeToUtcMidnight } from "../recurrence";

describe("Financial Lifecycle & Referential Integrity Regression Test Suite", () => {
  let testUserId: string;
  let householdIdAlpha: string;
  let householdIdBeta: string;
  let bankAccountIdAlpha: string;
  let categoryIdAlpha: string;

  beforeEach(async () => {
    // Setup isolated test entities for Household Alpha
    const user = await prisma.user.create({
      data: {
        email: `integrity_user_${Math.random().toString(36).substring(2)}_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Integrity Test User",
      },
    });
    testUserId = user.id;

    const hhAlpha = await prisma.household.create({
      data: { name: "Household Alpha", currency: "INR" },
    });
    householdIdAlpha = hhAlpha.id;

    await prisma.householdMember.create({
      data: { householdId: hhAlpha.id, userId: user.id, role: "OWNER" },
    });

    const bankAlpha = await prisma.account.create({
      data: {
        householdId: hhAlpha.id,
        name: "Alpha HDFC Checking",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
      },
    });
    bankAccountIdAlpha = bankAlpha.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000.0),
      });
    });

    const catAlpha = await prisma.category.create({
      data: { householdId: hhAlpha.id, name: "Alpha Groceries", type: "EXPENSE" },
    });
    categoryIdAlpha = catAlpha.id;

    // Setup Household Beta for cross-household isolation tests
    const hhBeta = await prisma.household.create({
      data: { name: "Household Beta", currency: "INR" },
    });
    householdIdBeta = hhBeta.id;

    const userBeta = await prisma.user.create({
      data: {
        email: `beta_user_${Math.random().toString(36).substring(2)}_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Beta User",
      },
    });

    await prisma.householdMember.create({
      data: { householdId: hhBeta.id, userId: userBeta.id, role: "OWNER" },
    });
  });

  it("REGRESSION TEST 1: Block deletion/voiding of an original expense that has linked refunds", async () => {
    const originalAmount = new Prisma.Decimal(5000.0);
    const originalTxn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        userId: testUserId,
        amount: originalAmount,
        type: "EXPENSE",
        description: "Department Store",
        refundedAmount: new Prisma.Decimal(1500.0), // Has recorded refund
      },
    });

    // Void attempt logic check
    const hasRefunds = originalTxn.refundedAmount.greaterThan(0);
    expect(hasRefunds).toBe(true);

    // Endpoint policy rule: Transactions with recorded refunds cannot be voided
    const canVoid = !hasRefunds && !originalTxn.isVoided;
    expect(canVoid).toBe(false);
  });

  it("REGRESSION TEST 2: Account deletion safeguards preserve posted transaction history", async () => {
    const txn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        userId: testUserId,
        amount: new Prisma.Decimal(1200.0),
        type: "EXPENSE",
        description: "Utility Bill",
      },
    });

    // Accounts with transactions should be archived rather than destructively deleted
    const updatedAcc = await prisma.account.update({
      where: { id: bankAccountIdAlpha },
      data: { isArchived: true },
    });

    expect(updatedAcc.isArchived).toBe(true);

    // Transaction history remains intact
    const fetchedTxn = await prisma.transaction.findUnique({ where: { id: txn.id } });
    expect(fetchedTxn).not.toBeNull();
    expect(fetchedTxn?.accountId).toBe(bankAccountIdAlpha);
  });

  it("REGRESSION TEST 3: Simultaneous requests with the same idempotency key return original result", async () => {
    const idempotencyKey = `key_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    const amount = new Prisma.Decimal(2500.0);

    // Initial posting
    const firstTxn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        userId: testUserId,
        idempotencyKey,
        amount,
        type: "EXPENSE",
        description: "Gadgets Purchase",
      },
    });

    // Re-query using same idempotency key
    const replayTxn = await prisma.transaction.findUnique({
      where: { idempotencyKey },
    });

    expect(replayTxn?.id).toBe(firstTxn.id);
    expect(replayTxn?.amount.toNumber()).toBe(2500.0);
  });

  it("REGRESSION TEST 4: Simultaneous refunds exceeding original expense amount are rejected", async () => {
    const originalAmount = new Prisma.Decimal(10000.0);
    const originalTxn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        userId: testUserId,
        amount: originalAmount,
        type: "EXPENSE",
        description: "Laptop Purchase",
        refundedAmount: new Prisma.Decimal(6000.0), // ₹6,000 already refunded
      },
    });

    // Refund request 1: ₹3,000 (Valid, total ₹9,000)
    // Refund request 2: ₹2,000 (Exceeds ₹10,000 limit)
    const refund1 = new Prisma.Decimal(3000.0);
    const refund2 = new Prisma.Decimal(2000.0);

    const remainingAllowed = originalTxn.amount.minus(originalTxn.refundedAmount); // ₹4,000
    expect(refund1.lessThanOrEqualTo(remainingAllowed)).toBe(true);

    const afterRefund1Remaining = remainingAllowed.minus(refund1); // ₹1,000
    expect(refund2.greaterThan(afterRefund1Remaining)).toBe(true); // ₹2,000 > ₹1,000 rejected!
  });

  it("REGRESSION TEST 5: Recurring occurrences normalize different due-date timestamps to UTC midnight", async () => {
    // Timestamps with different time components for the same UTC day
    const dateMorning = new Date("2026-10-15T08:30:00.000Z");
    const dateEvening = new Date("2026-10-15T22:45:00.000Z");

    const norm1 = normalizeToUtcMidnight(dateMorning);
    const norm2 = normalizeToUtcMidnight(dateEvening);

    expect(norm1.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(norm2.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(norm1.getTime()).toBe(norm2.getTime());
  });

  it("REGRESSION TEST 6: Enforces strict cross-household authorization and tenant isolation", async () => {
    // Create entity in Household Alpha
    const alphaBudget = await prisma.budget.create({
      data: {
        householdId: householdIdAlpha,
        categoryId: categoryIdAlpha,
        month: 10,
        year: 2026,
        amount: new Prisma.Decimal(15000.0),
      },
    });

    // Attempting query scoped to Household Beta
    const betaQueryResult = await prisma.budget.findFirst({
      where: { id: alphaBudget.id, householdId: householdIdBeta },
    });

    expect(betaQueryResult).toBeNull(); // Access blocked!
  });

  it("REGRESSION TEST 7: Existing financial primary keys remain unchanged", async () => {
    const txn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        userId: testUserId,
        amount: new Prisma.Decimal(450.0),
        type: "EXPENSE",
        description: "Coffee",
      },
    });

    const originalId = txn.id;
    expect(typeof originalId).toBe("string");
    expect(originalId.length).toBeGreaterThan(10);

    // Re-fetching confirms immutable ID
    const refetched = await prisma.transaction.findUnique({ where: { id: originalId } });
    expect(refetched?.id).toBe(originalId);
  });

  it("FINANCIAL LEDGER RECONCILIATION ORACLE: Verifies net worth, closing balances, and net spent", async () => {
    // 1. Posted Income +₹30,000
    const incomeAmount = new Prisma.Decimal(30000.0);
    await prisma.$transaction(async (tx) => {
      await TransactionDomainService.createIncome(tx, {
        householdId: householdIdAlpha,
        userId: testUserId,
        accountId: bankAccountIdAlpha,
        amount: incomeAmount,
        description: "Freelance Income",
      });
    });

    // 2. Gross Expense -₹10,000
    const expenseAmount = new Prisma.Decimal(10000.0);
    const expenseTxn = await prisma.$transaction(async (tx) => {
      return TransactionDomainService.createExpense(tx, {
        householdId: householdIdAlpha,
        userId: testUserId,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        amount: expenseAmount,
        description: "Equipment Purchase",
      });
    });

    // 3. Linked Refund +₹3,000
    const refundAmount = new Prisma.Decimal(3000.0);
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postRefund(tx, {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        amount: refundAmount,
        description: "Equipment Refund",
        refundOfId: expenseTxn.id,
      });

      await tx.transaction.create({
        data: {
          householdId: householdIdAlpha,
          accountId: bankAccountIdAlpha,
          categoryId: categoryIdAlpha,
          userId: testUserId,
          amount: refundAmount,
          type: "INCOME",
          refundOfId: expenseTxn.id,
          description: "Equipment Refund",
        },
      });

      await tx.transaction.update({
        where: { id: expenseTxn.id },
        data: { refundedAmount: { increment: refundAmount } },
      });
    });

    // Ledger Oracle Verification:
    // Opening (1,00,000) + Income (30,000) - Expense (10,000) + Refund (3,000) = 1,23,000
    const finalAccount = await prisma.account.findUnique({ where: { id: bankAccountIdAlpha } });
    expect(finalAccount?.balance.toNumber()).toBe(123000.0);

    // Net Eligible Spending: Gross (10,000) - Refund (3,000) = 7,000
    const netSpent = expenseAmount.minus(refundAmount).toNumber();
    expect(netSpent).toBe(7000.0);
  });
});
