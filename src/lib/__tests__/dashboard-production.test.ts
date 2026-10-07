import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { DashboardQueryService } from "@/finance/dashboard/dashboard-query.service";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";

describe("Kamasi Finance — Financial Command Center Production Certification Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;

  let householdBId: string;
  let userBId: string;

  beforeEach(async () => {
    // Reverse dependency cleanup
    await prisma.repaymentInstallment.deleteMany();
    await prisma.repaymentSchedule.deleteMany();
    await prisma.borrowingFinancialEvent.deleteMany();
    await prisma.borrowingLifecycleHistory.deleteMany();
    await prisma.borrowing.deleteMany();
    await prisma.investmentFinancialEvent.deleteMany();
    await prisma.investmentLifecycleHistory.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.goalFundingPlan.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Seed Household A (with active ledger records)
    const userA = await prisma.user.create({
      data: {
        email: `dashboard-owner-a-${Date.now()}@kamasi.internal`,
        passwordHash: "securehash",
        name: "Aarav Sharma",
        isOnboarded: true,
      },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: {
        name: "Sharma Family Office",
        currency: "INR",
        members: {
          create: {
            userId: userAId,
            role: "OWNER",
          },
        },
      },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: {
        householdId: householdAId,
        userId: userAId,
        name: "HDFC Primary Checking",
        type: "BANK",
        balance: new Prisma.Decimal(150000),
      },
    });
    accountAId = accA.id;

    // Seed an investment for Household A
    await prisma.investment.create({
      data: {
        householdId: householdAId,
        name: "Nifty 50 Index Fund",
        category: "EQUITY",
        type: "MUTUAL_FUND",
        status: "ACTIVE",
        totalQuantity: new Prisma.Decimal(100),
        totalCostBasis: new Prisma.Decimal(100000),
        currentMarketValue: new Prisma.Decimal(125000),
        currentPricePerUnit: new Prisma.Decimal(1250),
      },
    });

    // Seed a borrowing for Household A
    await prisma.borrowing.create({
      data: {
        householdId: householdAId,
        name: "Auto Loan",
        borrowingType: "VEHICLE_LOAN",
        financingType: "SECURED",
        status: "ACTIVE",
        principalAmount: new Prisma.Decimal(200000),
        outstandingPrincipal: new Prisma.Decimal(150000),
        interestRate: new Prisma.Decimal(9.5),
      },
    });

    // Seed a savings goal for Household A
    await prisma.goal.create({
      data: {
        householdId: householdAId,
        name: "Emergency Fund",
        targetAmount: new Prisma.Decimal(300000),
        currentAmount: new Prisma.Decimal(150000),
        targetDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });

    // Seed Household B (Empty tenant for isolation tests)
    const userB = await prisma.user.create({
      data: {
        email: `dashboard-owner-b-${Date.now()}@kamasi.internal`,
        passwordHash: "securehash",
        name: "Priya Rao",
        isOnboarded: true,
      },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: {
        name: "Rao Residence (Brand New)",
        currency: "INR",
        members: {
          create: {
            userId: userBId,
            role: "OWNER",
          },
        },
      },
    });
    householdBId = hhB.id;
  });

  // 1. READ-ONLY INVARIANT & ZERO MUTATIONS
  it("1. Asserts zero mutations to financial tables during dashboard query execution", async () => {
    const journalCountBefore = await prisma.journal.count();
    const journalEntryCountBefore = await prisma.journalEntry.count();
    const transactionCountBefore = await prisma.transaction.count();
    const accountBalancesBefore = await prisma.account.findMany({ select: { id: true, balance: true } });

    const snapshot = await DashboardQueryService.getSnapshot(prisma, householdAId, "MONTHLY");
    expect(snapshot).toBeDefined();
    expect(snapshot.overview).toBeDefined();

    // Verify absolutely zero mutations
    const journalCountAfter = await prisma.journal.count();
    const journalEntryCountAfter = await prisma.journalEntry.count();
    const transactionCountAfter = await prisma.transaction.count();
    const accountBalancesAfter = await prisma.account.findMany({ select: { id: true, balance: true } });

    expect(journalCountAfter).toBe(journalCountBefore);
    expect(journalEntryCountAfter).toBe(journalEntryCountBefore);
    expect(transactionCountAfter).toBe(transactionCountBefore);
    expect(accountBalancesAfter).toEqual(accountBalancesBefore);
  });

  // 2. MATHEMATICAL CONSISTENCY WITH AUTHORITATIVE REPORTING SERVICE
  it("2. Verifies mathematical equality between dashboard snapshot and FinancialReportingService", async () => {
    const snapshot = await DashboardQueryService.getSnapshot(prisma, householdAId, "MONTHLY");
    const netWorthReport = await FinancialReportingService.getNetWorthReport(prisma, householdAId);
    const investmentReport = await FinancialReportingService.getInvestmentReport(prisma, householdAId);

    // Equality invariants
    expect(snapshot.overview.netWorth).toBe(Math.round(Number(netWorthReport.netWorth)));
    expect(snapshot.overview.totalAssets).toBe(Math.round(Number(netWorthReport.totalAssets)));
    expect(snapshot.overview.totalLiabilities).toBe(Math.round(Number(netWorthReport.totalLiabilities)));
    expect(snapshot.overview.investmentMarketValue).toBe(Math.round(Number(investmentReport.totalMarketValue)));
  });

  // 3. MULTI-TENANT ISOLATION
  it("3. Strictly enforces household tenant isolation (Household B cannot see Household A data)", async () => {
    const snapshotA = await DashboardQueryService.getSnapshot(prisma, householdAId, "MONTHLY");
    const snapshotB = await DashboardQueryService.getSnapshot(prisma, householdBId, "MONTHLY");

    // Household A has assets, investments, borrowings, and goals
    expect(snapshotA.overview.totalAssets).toBeGreaterThan(0);
    expect(snapshotA.investments.holdingsCount).toBe(1);
    expect(snapshotA.borrowings.activeCount).toBe(1);
    expect(snapshotA.goals.totalGoals).toBe(1);

    // Household B must have 0 across all figures, with zero cross-tenant bleeding
    expect(snapshotB.overview.totalAssets).toBe(0);
    expect(snapshotB.overview.totalLiabilities).toBe(0);
    expect(snapshotB.overview.netWorth).toBe(0);
    expect(snapshotB.overview.availableCash).toBe(0);
    expect(snapshotB.investments.holdingsCount).toBe(0);
    expect(snapshotB.borrowings.activeCount).toBe(0);
    expect(snapshotB.goals.totalGoals).toBe(0);
    expect(snapshotB.budget.categories.length).toBe(0);
    expect(snapshotB.recentActivity.length).toBe(0);
  });

  // 4. PERIOD FILTERING & CALENDAR BOUNDS DYNAMICS
  it("4. Correctly computes dynamic period boundaries without hardcoded dates", () => {
    const testDate = new Date(2026, 4, 15); // May 15, 2026

    const monthly = DashboardQueryService.calculatePeriodBounds("MONTHLY", testDate);
    expect(monthly.startDate.getMonth()).toBe(4);
    expect(monthly.startDate.getDate()).toBe(1);
    expect(monthly.endDate.getMonth()).toBe(4);
    expect(monthly.endDate.getDate()).toBe(31);
    expect(monthly.label).toContain("May 2026");

    const quarterly = DashboardQueryService.calculatePeriodBounds("QUARTERLY", testDate);
    expect(quarterly.startDate.getMonth()).toBe(3); // Q2 starts in April (index 3)
    expect(quarterly.endDate.getMonth()).toBe(5); // Q2 ends in June (index 5)
    expect(quarterly.label).toContain("Q2 2026");

    const yearly = DashboardQueryService.calculatePeriodBounds("YEARLY", testDate);
    expect(yearly.startDate.getMonth()).toBe(0); // Jan 1
    expect(yearly.endDate.getMonth()).toBe(11); // Dec 31
    expect(yearly.label).toBe("Year 2026");
  });

  // 5. EMPTY STATE ROBUSTNESS & GRACEFUL DEGRADATION
  it("5. Gracefully handles completely empty household without throwing errors or null crashes", async () => {
    const emptySnapshot = await DashboardQueryService.getSnapshot(prisma, householdBId, "MONTHLY");

    expect(emptySnapshot).toBeDefined();
    expect(emptySnapshot.asOf).toBeDefined();
    expect(emptySnapshot.period.type).toBe("MONTHLY");
    expect(emptySnapshot.currency.code).toBe("INR");
    expect(emptySnapshot.overview.netWorth).toBe(0);
    expect(emptySnapshot.cashFlow.series).toBeDefined();
    expect(emptySnapshot.budget.categories).toEqual([]);
    expect(emptySnapshot.investments.allocation).toEqual([]);
    expect(emptySnapshot.borrowings.items).toEqual([]);
    expect(emptySnapshot.goals.items).toEqual([]);
    expect(emptySnapshot.alerts).toBeDefined();
  });
});
