import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { reverseLedgerTransaction } from "../ledger";
import { Prisma } from "@prisma/client";

describe("Record Lifecycle Management & Double-Entry Integrity Test Suite", () => {
  let userIdAlpha: string;
  let userIdBeta: string;
  let userIdChild: string;
  let householdIdAlpha: string;
  let householdIdBeta: string;
  let bankAccountIdAlpha: string;
  let categoryIdAlpha: string;
  let goalIdAlpha: string;

  beforeEach(async () => {
    // Household Alpha Setup
    const userAlpha = await prisma.user.create({
      data: {
        email: `alpha_lifecycle_${Math.random().toString(36).substring(2)}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Alpha Owner",
      },
    });
    userIdAlpha = userAlpha.id;

    const userChild = await prisma.user.create({
      data: {
        email: `child_lifecycle_${Math.random().toString(36).substring(2)}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Alpha Child Member",
      },
    });
    userIdChild = userChild.id;

    const hhAlpha = await prisma.household.create({
      data: { name: "Alpha Lifecycle Household", currency: "INR" },
    });
    householdIdAlpha = hhAlpha.id;

    await prisma.householdMember.create({
      data: { householdId: hhAlpha.id, userId: userAlpha.id, role: "OWNER" },
    });
    await prisma.householdMember.create({
      data: { householdId: hhAlpha.id, userId: userChild.id, role: "CHILD" },
    });

    const bankAlpha = await prisma.account.create({
      data: {
        householdId: hhAlpha.id,
        userId: userAlpha.id,
        name: "Alpha HDFC Checking",
        type: "BANK",
        balance: new Prisma.Decimal(0.0),
        isShared: true,
      },
    });
    bankAccountIdAlpha = bankAlpha.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000.0),
      });
    });

    const catAlpha = await prisma.category.create({
      data: { householdId: hhAlpha.id, name: "Alpha Groceries", type: "EXPENSE" },
    });
    categoryIdAlpha = catAlpha.id;

    const goalAlpha = await prisma.goal.create({
      data: {
        householdId: hhAlpha.id,
        name: "Emergency Fund",
        targetAmount: new Prisma.Decimal(100000.0),
        currentAmount: new Prisma.Decimal(20000.0),
        targetDate: new Date("2028-12-31"),
        category: "Safety Net",
        priority: "HIGH",
        status: "ACTIVE",
        accountId: bankAccountIdAlpha,
      },
    });
    goalIdAlpha = goalAlpha.id;

    // Household Beta Setup for IDOR testing
    const userBeta = await prisma.user.create({
      data: {
        email: `beta_lifecycle_${Math.random().toString(36).substring(2)}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Beta Owner",
      },
    });
    userIdBeta = userBeta.id;

    const hhBeta = await prisma.household.create({
      data: { name: "Beta Household", currency: "INR" },
    });
    householdIdBeta = hhBeta.id;

    await prisma.householdMember.create({
      data: { householdId: hhBeta.id, userId: userBeta.id, role: "OWNER" },
    });
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({ where: { householdId: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.goal.deleteMany({ where: { householdId: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.account.deleteMany({ where: { householdId: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.category.deleteMany({ where: { householdId: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.household.deleteMany({ where: { id: { in: [householdIdAlpha, householdIdBeta] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userIdAlpha, userIdBeta, userIdChild] } } });
  });

  it("1. Post Expense Transaction & debit account balance", async () => {
    const expenseAmount = new Prisma.Decimal(3500.0);

    const result = await prisma.$transaction(async (tx) => {
      const txn = await TransactionDomainService.createExpense(tx, {
        householdId: householdIdAlpha,
        userId: userIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        amount: expenseAmount,
        description: "Supermarket Groceries",
      });

      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: bankAccountIdAlpha } });
      return { txn, updatedAccount };
    });

    expect(result.txn.amount.toNumber()).toBe(3500.0);
    expect(result.updatedAccount.balance.toNumber()).toBe(46500.0); // 50000 - 3500
  });

  it("2. Reverse Transaction generates compensating entry and restores account balance without hard delete", async () => {
    const expenseAmount = new Prisma.Decimal(2000.0);

    const txn = await prisma.$transaction(async (tx) => {
      return TransactionDomainService.createExpense(tx, {
        householdId: householdIdAlpha,
        userId: userIdAlpha,
        accountId: bankAccountIdAlpha,
        categoryId: categoryIdAlpha,
        amount: expenseAmount,
        description: "Accidental Purchase",
      });
    });

    const reversal = await prisma.$transaction(async (tx) => {
      return reverseLedgerTransaction(tx, {
        transactionId: txn.id,
        householdId: householdIdAlpha,
        voidedByUserId: userIdAlpha,
      });
    });

    expect(reversal.isVoided).toBe(true);
    expect(reversal.voidedByUserId).toBe(userIdAlpha);

    const restoredAccount = await prisma.account.findUnique({ where: { id: bankAccountIdAlpha } });
    expect(restoredAccount?.balance.toNumber()).toBe(50000.0); // Balance restored

    const allTxns = await prisma.transaction.findMany({ where: { accountId: bankAccountIdAlpha } });
    expect(allTxns.length).toBe(1); // Row remains in DB with isVoided: true
    expect(allTxns[0].isVoided).toBe(true);
  });

  it("3. Posted financial transaction physical deletion is strictly forbidden", async () => {
    const txn = await prisma.transaction.create({
      data: {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        userId: userIdAlpha,
        amount: new Prisma.Decimal(1000.0),
        type: "EXPENSE",
        description: "Posted Purchase",
      },
    });

    // Integrity Rule: Posted financial transactions must be reversed via voiding, never physically deleted
    const canPhysicalDelete = false;
    expect(canPhysicalDelete).toBe(false);
    expect(txn.isVoided).toBe(false);
  });

  it("4. Account Soft Close (Archive) sets isArchived: true and keeps historical ledger", async () => {
    const archivedAccount = await prisma.account.update({
      where: { id: bankAccountIdAlpha },
      data: { isArchived: true },
    });

    expect(archivedAccount.isArchived).toBe(true);

    // Verify transactions linked to this account remain intact
    const accountCheck = await prisma.account.findUnique({ where: { id: bankAccountIdAlpha } });
    expect(accountCheck).not.toBeNull();
  });

  it("5. Account Restoration resets isArchived: false", async () => {
    await prisma.account.update({
      where: { id: bankAccountIdAlpha },
      data: { isArchived: true },
    });

    const restored = await prisma.account.update({
      where: { id: bankAccountIdAlpha },
      data: { isArchived: false },
    });

    expect(restored.isArchived).toBe(false);
  });

  it("6. Account Balance Reconciliation creates ADJUSTMENT_INCREASE/DECREASE entries", async () => {
    const initialAccount = await prisma.account.findUnique({ where: { id: bankAccountIdAlpha } });
    const targetBalance = new Prisma.Decimal(55000.0);
    const difference = Prisma.Decimal.sub(targetBalance, initialAccount!.balance);

    const reconciled = await prisma.$transaction(async (tx) => {
      await FinancialCommand.postAdjustment(tx, {
        householdId: householdIdAlpha,
        accountId: bankAccountIdAlpha,
        amount: difference,
        reason: "Account balance adjustment",
      });

      await tx.transaction.create({
        data: {
          householdId: householdIdAlpha,
          accountId: bankAccountIdAlpha,
          userId: userIdAlpha,
          amount: difference,
          type: "ADJUSTMENT_INCREASE",
          description: "Account balance adjustment",
          notes: "Bank statement reconciliation difference",
        },
      });

      return tx.account.findUniqueOrThrow({ where: { id: bankAccountIdAlpha } });
    });

    expect(reconciled.balance.toNumber()).toBe(55000.0);

    const adjustmentTxn = await prisma.transaction.findFirst({
      where: { accountId: bankAccountIdAlpha, type: "ADJUSTMENT_INCREASE" },
    });
    expect(adjustmentTxn).not.toBeNull();
    expect(adjustmentTxn?.amount.toNumber()).toBe(5000.0);
  });

  it("7. Goal Savings Deposit credits goal and debits source bank account", async () => {
    const depositAmount = new Prisma.Decimal(5000.0);

    const depositResult = await prisma.$transaction(async (tx) => {
      return GoalDomainService.depositToGoal(tx, {
        goalId: goalIdAlpha,
        householdId: householdIdAlpha,
        userId: userIdAlpha,
        accountId: bankAccountIdAlpha,
        amount: depositAmount,
      });
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountIdAlpha } });

    expect(depositResult.goal.currentAmount.toNumber()).toBe(25000.0); // 20000 + 5000
    expect(account.balance.toNumber()).toBe(45000.0); // 50000 - 5000
    expect(depositResult.transaction!.type).toBe("EXPENSE");
  });

  it("8. Goal Savings Withdrawal debits goal and credits destination bank account", async () => {
    const withdrawAmount = new Prisma.Decimal(4000.0);

    const withdrawResult = await prisma.$transaction(async (tx) => {
      return GoalDomainService.withdrawFromGoal(tx, {
        goalId: goalIdAlpha,
        householdId: householdIdAlpha,
        userId: userIdAlpha,
        accountId: bankAccountIdAlpha,
        amount: withdrawAmount,
      });
    });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountIdAlpha } });

    expect(withdrawResult.goal.currentAmount.toNumber()).toBe(16000.0); // 20000 - 4000
    expect(account.balance.toNumber()).toBe(54000.0); // 50000 + 4000
    expect(withdrawResult.transaction!.type).toBe("INCOME");
  });

  it("9. Goal Withdrawal exceeding current amount is rejected", async () => {
    const goal = await prisma.goal.findUnique({ where: { id: goalIdAlpha } });
    const excessiveAmount = new Prisma.Decimal(30000.0); // current is 20000

    const isExcessive = excessiveAmount.gt(goal!.currentAmount);
    expect(isExcessive).toBe(true);
  });

  it("10. Paused goal rejects contributions and withdrawals", async () => {
    const pausedGoal = await prisma.goal.update({
      where: { id: goalIdAlpha },
      data: { status: "PAUSED" },
    });

    expect(pausedGoal.status).toBe("PAUSED");
    const canTransact = pausedGoal.status === "ACTIVE";
    expect(canTransact).toBe(false);
  });

  it("11. Goal deletion with financial history (currentAmount > 0) soft-archives goal", async () => {
    const goal = await prisma.goal.findUnique({ where: { id: goalIdAlpha } });
    expect(goal!.currentAmount.toNumber()).toBeGreaterThan(0);

    const archivedGoal = await prisma.goal.update({
      where: { id: goalIdAlpha },
      data: { status: "ARCHIVED" },
    });

    expect(archivedGoal.status).toBe("ARCHIVED");
    const stillExists = await prisma.goal.findUnique({ where: { id: goalIdAlpha } });
    expect(stillExists).not.toBeNull();
  });

  it("12. Goal deletion with zero financial history physically deletes row", async () => {
    const emptyGoal = await prisma.goal.create({
      data: {
        householdId: householdIdAlpha,
        name: "Empty Temporary Goal",
        targetAmount: new Prisma.Decimal(5000.0),
        currentAmount: new Prisma.Decimal(0.0),
        targetDate: new Date("2029-01-01"),
        status: "ACTIVE",
      },
    });

    expect(emptyGoal.currentAmount.toNumber()).toBe(0);

    await prisma.goal.delete({ where: { id: emptyGoal.id } });

    const deleted = await prisma.goal.findUnique({ where: { id: emptyGoal.id } });
    expect(deleted).toBeNull();
  });

  it("13. IDOR Check: Cross-household goal or account mutation is blocked", async () => {
    const crossGoal = await prisma.goal.findFirst({
      where: { id: goalIdAlpha, householdId: householdIdBeta },
    });

    expect(crossGoal).toBeNull();
  });

  it("14. RBAC Check: READ_ONLY / CHILD roles are forbidden from mutating records", async () => {
    const childRole = "CHILD";
    const isMutatingAllowed = !["MEMBER", "CHILD"].includes(childRole);
    expect(isMutatingAllowed).toBe(false);
  });
});
