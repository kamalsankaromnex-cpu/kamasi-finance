import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { FinancialCommand } from '@/finance/financial-command';
import { GoalDomainService } from '@/modules/goals/goal.service';
import { InvestmentDomainService } from '@/modules/investments/investment.service';

const prisma = new PrismaClient();

// Helper to run promises in controlled concurrent batches for SQLite single-writer safety
async function runInBatches<T>(tasks: Array<() => Promise<T>>, batchSize: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map((fn) => fn());
    const batchResults = await Promise.allSettled(batch);
    results.push(...batchResults);
  }
  return results;
}

describe('Phase 3.8 — Concurrency & Financial Stress Test Suite', () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Setup isolated test household and user
    const user = await prisma.user.create({
      data: {
        email: `stress_user_${Date.now()}_${Math.random()}@example.com`,
        passwordHash: 'hash',
        name: 'Stress Test User',
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: 'Stress Test Household',
        currency: 'INR',
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
    });
    householdId = household.id;

    const bankAccount = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: 'Main Bank Account',
        type: 'BANK',
        balance: new Prisma.Decimal(1000000.0), // 1,000,000 initial balance
        currency: 'INR',
      },
    });
    bankAccountId = bankAccount.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.household.delete({ where: { id: householdId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('100 Concurrent Expenses — verifies double-entry balance, exact debit/credit equality, and balance precision', async () => {
    const parallelRequests = 100;
    const expenseAmount = new Prisma.Decimal(1000.0);

    const taskFactories = Array.from({ length: parallelRequests }).map((_, idx) => () =>
      prisma.$transaction(async (tx) => {
        return FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: expenseAmount,
          description: `Concurrent Expense ${idx + 1}`,
          idempotencyKey: `CONCURRENT_EXPENSE_${householdId}_${idx + 1}`,
        });
      })
    );

    const results = await runInBatches(taskFactories, 10);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(100);

    // Verify account balance updated by exactly 100 * 1000 = 100,000
    const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(Number(updatedAccount.balance.toString())).toBe(900000.0);

    // Verify double-entry journal total balance
    const journals = await prisma.journal.findMany({
      where: { householdId },
      include: { entries: true },
    });
    expect(journals.length).toBe(100);

    let totalDebits = new Prisma.Decimal(0);
    let totalCredits = new Prisma.Decimal(0);

    for (const journal of journals) {
      for (const entry of journal.entries) {
        totalDebits = totalDebits.add(entry.debit);
        totalCredits = totalCredits.add(entry.credit);
      }
    }

    expect(totalDebits.toString()).toBe('100000');
    expect(totalCredits.toString()).toBe('100000');
    expect(totalDebits.equals(totalCredits)).toBe(true);
  }, 30000);

  it('100 Parallel Requests with identical idempotency key — resulting in exactly 1 operation and 1 balance mutation', async () => {
    const sharedIdempotencyKey = `SAME_IDEMPOTENCY_KEY_${householdId}`;
    const expenseAmount = new Prisma.Decimal(5000.0);

    const taskFactories = Array.from({ length: 100 }).map(() => () =>
      prisma.$transaction(async (tx) => {
        return FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: expenseAmount,
          description: 'Idempotency Stress Test',
          idempotencyKey: sharedIdempotencyKey,
        });
      })
    );

    const results = await runInBatches(taskFactories, 10);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(100);

    // Verify only 1 journal record exists with this idempotency key
    const journals = await prisma.journal.findMany({
      where: { householdId, idempotencyKey: sharedIdempotencyKey },
    });
    expect(journals.length).toBe(1);

    // Verify account balance deducted by exactly 5000 once (1,000,000 - 5,000 = 995,000)
    const account = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
    expect(Number(account.balance.toString())).toBe(995000.0);
  }, 30000);

  it('100 Concurrent Goal Withdrawals against ₹100,000 balance — prevents negative protected goal balance', async () => {
    const goal = await prisma.goal.create({
      data: {
        householdId,
        name: 'Emergency Fund',
        targetAmount: new Prisma.Decimal(200000.0),
        currentAmount: new Prisma.Decimal(100000.0), // ₹100,000 available
        targetDate: new Date(Date.now() + 86400000 * 30),
        status: 'ACTIVE',
      },
    });

    // 100 requests trying to withdraw ₹2,000 each (Total requested = ₹200,000)
    const withdrawalFactories = Array.from({ length: 100 }).map(() => () =>
      prisma.$transaction(async (tx) => {
        return GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(2000.0),
        });
      })
    );

    const results = await runInBatches(withdrawalFactories, 10);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 50 withdrawals of ₹2,000 should succeed = ₹100,000
    expect(fulfilled.length).toBe(50);
    expect(rejected.length).toBe(50);

    // Final goal balance must be exactly 0 (never negative)
    const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(Number(updatedGoal.currentAmount.toString())).toBe(0);
  }, 30000);

  it('Concurrent Investment Sales — prevents overselling available quantity', async () => {
    // 1. Create DRAFT investment
    const draft = await prisma.$transaction(async (tx) =>
      InvestmentDomainService.createDraft(tx, {
        householdId,
        userId,
        name: 'Reliance Stock',
        category: 'STOCK',
        symbol: 'RELIANCE',
      })
    );

    // 2. Buy 100 units at ₹100/unit
    await prisma.$transaction(async (tx) =>
      InvestmentDomainService.buyInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId,
        quantity: new Prisma.Decimal(100.0),
        pricePerUnit: new Prisma.Decimal(100.0),
        payingAccountId: bankAccountId,
      })
    );

    // Request A: Sell 70 units
    // Request B: Sell 50 units
    // Concurrent execution
    const sellA = prisma.$transaction(async (tx) =>
      InvestmentDomainService.sellInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId,
        receivingAccountId: bankAccountId,
        quantity: new Prisma.Decimal(70.0),
        pricePerUnit: new Prisma.Decimal(120.0),
      })
    );

    const sellB = prisma.$transaction(async (tx) =>
      InvestmentDomainService.sellInvestment(tx, {
        investmentId: draft.id,
        householdId,
        userId,
        receivingAccountId: bankAccountId,
        quantity: new Prisma.Decimal(50.0),
        pricePerUnit: new Prisma.Decimal(120.0),
      })
    );

    const results = await Promise.allSettled([sellA, sellB]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 sale must succeed and 1 must fail due to insufficient units
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Remaining quantity must be exactly 30 (100 - 70 = 30)
    const updatedInvestment = await prisma.investment.findUniqueOrThrow({ where: { id: draft.id } });
    expect([30, 50]).toContain(Number(updatedInvestment.totalQuantity.toString()));
    expect(Number(updatedInvestment.totalQuantity.toString())).toBeGreaterThanOrEqual(0);
  }, 30000);
});
