import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

describe("Phase 2 Prisma Persistence & Transaction Rollback Integration Tests", () => {
  let householdId: string;
  let bankAccountId: string;
  let creditAccountId: string;
  let categoryId: string;
  let goalId: string;

  beforeAll(async () => {
    // Clean up test records
    await prisma.transaction.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.category.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();

    // Create persistent test household
    const hh = await prisma.household.create({
      data: { name: "Test Persistent Household", currency: "INR" },
    });
    householdId = hh.id;

    // Create test accounts
    const bank = await prisma.account.create({
      data: { householdId, name: "Test HDFC Bank", type: "BANK", balance: new Prisma.Decimal(345000.00) },
    });
    bankAccountId = bank.id;

    const credit = await prisma.account.create({
      data: { householdId, name: "Test ICICI Credit", type: "CREDIT", balance: new Prisma.Decimal(-24500.00) },
    });
    creditAccountId = credit.id;

    // Create test category
    const cat = await prisma.category.create({
      data: { householdId, name: "Test Groceries", type: "EXPENSE" },
    });
    categoryId = cat.id;

    // Create test goal
    const goal = await prisma.goal.create({
      data: {
        householdId,
        name: "Test Emergency Fund",
        targetAmount: new Prisma.Decimal(600000.00),
        currentAmount: new Prisma.Decimal(420000.00),
        targetDate: new Date(2026, 11, 31),
      },
    });
    goalId = goal.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists accounts and initial balances in database", async () => {
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(bank).not.toBeNull();
    expect(bank?.balance.toNumber()).toBe(345000.00);
  });

  it("executes atomic double-entry account transfer in database", async () => {
    const transferAmount = new Prisma.Decimal(50000.00);

    // Atomic transaction
    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          householdId,
          accountId: bankAccountId,
          transferAccountId: creditAccountId,
          amount: transferAmount,
          type: "TRANSFER",
          description: "Test Credit Card Bill Payment",
        },
      });

      await tx.account.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: transferAmount } },
      });

      await tx.account.update({
        where: { id: creditAccountId },
        data: { balance: { increment: transferAmount } },
      });
    });

    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    const credit = await prisma.account.findUnique({ where: { id: creditAccountId } });

    // HDFC balance decreased by 50,000 (345,000 - 50,000 = 295,000)
    expect(bank?.balance.toNumber()).toBe(295000.00);

    // ICICI Credit balance increased by 50,000 (-24,500 + 50,000 = 25,500)
    expect(credit?.balance.toNumber()).toBe(25500.00);
  });

  it("rolls back atomic transaction completely when an error occurs", async () => {
    const initialBank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    const initialBalance = initialBank?.balance.toNumber();

    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Update balance
        await tx.account.update({
          where: { id: bankAccountId },
          data: { balance: { decrement: new Prisma.Decimal(100000.00) } },
        });

        // Step 2: Intentionally throw error to test rollback
        throw new Error("Simulated Database Error During Transfer");
      });
    } catch (e: any) {
      expect(e.message).toBe("Simulated Database Error During Transfer");
    }

    // Balance must be unchanged (rolled back completely)
    const afterRollbackBank = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(afterRollbackBank?.balance.toNumber()).toBe(initialBalance);
  });

  it("executes atomic goal deposit and bank balance deduction in database", async () => {
    const depositAmount = new Prisma.Decimal(25000.00);

    await prisma.$transaction(async (tx) => {
      await tx.goal.update({
        where: { id: goalId },
        data: { currentAmount: { increment: depositAmount } },
      });

      await tx.account.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: depositAmount } },
      });

      await tx.transaction.create({
        data: {
          householdId,
          accountId: bankAccountId,
          amount: depositAmount,
          type: "EXPENSE",
          description: "Goal Savings Allocation: Test Emergency Fund",
          tags: "savings-goal,allocation",
        },
      });
    });

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    const bank = await prisma.account.findUnique({ where: { id: bankAccountId } });

    // Goal currentAmount increased by 25,000 (420,000 + 25,000 = 445,000)
    expect(goal?.currentAmount.toNumber()).toBe(445000.00);

    // Bank balance decreased by 25,000 (295,000 - 25,000 = 270,000)
    expect(bank?.balance.toNumber()).toBe(270000.00);
  });
});
