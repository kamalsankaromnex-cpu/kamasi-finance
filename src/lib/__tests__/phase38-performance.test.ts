import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { FinancialReportingService } from '@/finance/reporting/reporting.service';
import { FinancialForecastingService } from '@/finance/forecasting/forecasting.service';
import { FinancialContextBuilder } from '@/finance/ai/context-builder';

const prisma = new PrismaClient();

function calculatePercentiles(durationsMs: number[]) {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;
  return { p50, p95, p99, avg };
}

describe('Phase 3.8 — Performance Benchmarking Suite', () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Setup isolated test household with 500 records for performance testing
    const user = await prisma.user.create({
      data: {
        email: `perf_user_${Date.now()}_${Math.random()}@example.com`,
        passwordHash: 'hash',
        name: 'Perf Test User',
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: 'Perf Test Household',
        currency: 'INR',
        members: { create: { userId, role: 'OWNER' } },
      },
    });
    householdId = household.id;

    const account = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: 'Perf Account',
        type: 'BANK',
        balance: new Prisma.Decimal(100000.0),
      },
    });
    bankAccountId = account.id;

    // Seed 100 transactions/journals into DB
    const txData = Array.from({ length: 100 }).map((_, i) => ({
      householdId,
      accountId: bankAccountId,
      amount: new Prisma.Decimal(100 + i),
      type: 'EXPENSE',
      description: `Perf Seed Expense ${i + 1}`,
      status: 'POSTED',
      date: new Date(Date.now() - i * 3600000),
    }));
    await prisma.transaction.createMany({ data: txData });
  });

  afterEach(async () => {
    await prisma.household.delete({ where: { id: householdId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('1. Simple Query Performance Benchmark — target p95 < 200 ms', async () => {
    const iterations = 20;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await prisma.transaction.findMany({
        where: { householdId, status: 'POSTED' },
        orderBy: { date: 'desc' },
        take: 50,
      });
      durations.push(performance.now() - start);
    }

    const metrics = calculatePercentiles(durations);
    console.log('Simple Query Metrics (ms):', metrics);

    expect(metrics.p95).toBeLessThan(200);
  });

  it('2. Reporting Query Performance Benchmark — target p95 < 500 ms', async () => {
    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await FinancialReportingService.getIncomeStatementReport(prisma, householdId, {
        from: new Date(Date.now() - 30 * 86400000),
        to: new Date(),
      });
      durations.push(performance.now() - start);
    }

    const metrics = calculatePercentiles(durations);
    console.log('Reporting Query Metrics (ms):', metrics);

    expect(metrics.p95).toBeLessThan(500);
  });

  it('3. Forecast Scenario Benchmark — target p95 < 1000 ms', async () => {
    const iterations = 5;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await FinancialForecastingService.runForecast({
        householdId,
        startDate: new Date().toISOString().slice(0, 10),
        horizonMonths: 12,
        scenario: {
          householdId,
          name: 'Baseline Scenario',
          type: 'BASELINE',
          isDefault: true,
          startYear: new Date().getFullYear(),
          endYear: new Date().getFullYear() + 1,
          horizonMonths: 12,
          incomeGrowthRate: 5.0,
          expenseInflationRate: 6.0,
          investmentReturnRate: 10.0,
          assetGrowthRate: 5.0,
          assumptionsVersion: 1,
        },
      });
      durations.push(performance.now() - start);
    }

    const metrics = calculatePercentiles(durations);
    console.log('Forecast Generation Metrics (ms):', metrics);

    expect(metrics.p95).toBeLessThan(1000);
  });

  it('4. AI Context Assembly Benchmark — target p95 < 1000 ms', async () => {
    const iterations = 10;
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await FinancialContextBuilder.buildContext(householdId);
      durations.push(performance.now() - start);
    }

    const metrics = calculatePercentiles(durations);
    console.log('AI Context Build Metrics (ms):', metrics);

    expect(metrics.p95).toBeLessThan(1000);
  });
});
