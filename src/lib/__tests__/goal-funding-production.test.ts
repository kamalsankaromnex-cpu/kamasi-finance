import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { FinancialForecastingService } from "@/finance/forecasting/forecasting.service";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { Prisma } from "@prisma/client";

describe("Goal Funding v1 — Production Suite", () => {
  const householdId = "hh-goal-funding-prod";
  const userId = "usr-goal-funding-prod";

  beforeEach(async () => {
    // Clean up test data
    await prisma.goalLifecycleHistory.deleteMany({
      where: { goal: { householdId } },
    });
    await prisma.goal.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { householdId } });
    await prisma.householdMember.deleteMany({ where: { householdId } });
    await prisma.household.deleteMany({ where: { id: householdId } });

    await prisma.household.create({
      data: {
        id: householdId,
        name: "Goal Funding Family",
        currency: "INR",
      },
    });
  });

  describe("1. Pure Financial Forecasting Engine — calculateGoalFundingPlan", () => {
    it("Case A: Goal is On Track when projected own funding >= target amount", () => {
      // Land Purchase: Target 20,00,000, Available 3,00,000, Monthly 50,000, 36 months remaining
      // Projected = 3,00,000 + (50,000 * 36) = 21,00,000 >= 20,00,000
      const start = new Date("2026-01-01");
      const target = new Date("2029-01-01"); // exactly 36 months

      const result = FinancialForecastingService.calculateGoalFundingPlan({
        targetAmount: 2000000,
        currentAvailable: 300000,
        monthlyContribution: 50000,
        startDate: start,
        targetDate: target,
      });

      expect(result.status).toBe("ON_TRACK");
      expect(result.isAchievable).toBe(true);
      expect(result.monthsRemaining).toBe(36);
      expect(result.projectedOwnFunding).toBe(2100000);
      expect(result.projectedGap).toBe(0);
      expect(result.projectedSurplus).toBe(100000);
      expect(result.options).toBeUndefined();
      expect(result.decisionMessage).toContain("Goal is on track");
    });

    it("Case B: Funding Gap detected when projected own funding < target amount", () => {
      // Land Purchase: Target 20,00,000, Available 3,00,000, Monthly 25,000, 36 months
      // Projected = 3,00,000 + (25,000 * 36) = 12,00,000
      // Gap = 20,00,000 - 12,00,000 = 8,00,000
      const start = new Date("2026-01-01");
      const target = new Date("2029-01-01");

      const result = FinancialForecastingService.calculateGoalFundingPlan({
        targetAmount: 2000000,
        currentAvailable: 300000,
        monthlyContribution: 25000,
        startDate: start,
        targetDate: target,
      });

      expect(result.status).toBe("FUNDING_GAP");
      expect(result.isAchievable).toBe(false);
      expect(result.initialGap).toBe(1700000); // 20L - 3L
      expect(result.projectedOwnFunding).toBe(1200000);
      expect(result.projectedGap).toBe(800000);
      expect(result.projectedSurplus).toBe(0);
      expect(result.options).toBeDefined();

      const options = result.options!;

      // 1. Save More: ceil(8,00,000 / 36) = 22223
      expect(options.saveMore.additionalMonthlySaving).toBe(Math.ceil(800000 / 36));
      expect(options.saveMore.totalMonthlySavingNeeded).toBe(25000 + Math.ceil(800000 / 36));
      expect(options.saveMore.monthsRemaining).toBe(36);

      // 2. Consider Investing: Advisory with non-guarantee disclaimer
      expect(options.considerInvesting.message).toContain("8,00,000");
      expect(options.considerInvesting.disclaimer).toContain("not guaranteed");

      // 3. Extend Goal Date: ceil(8,00,000 / 25,000) = 32 months
      expect(options.extendDate.monthsToExtend).toBe(32);
      expect(options.extendDate.projectedTargetDate).toBeDefined();

      // 4. Consider Borrowing: Informational warning about repayment obligation and interest cost
      expect(options.considerBorrowing.message).toContain("8,00,000");
      expect(options.considerBorrowing.obligationWarning).toContain("EMI");
      expect(options.considerBorrowing.obligationWarning).toContain("interest");
    });

    it("Invariant: Gap is strictly non-negative even with large available funds", () => {
      const result = FinancialForecastingService.calculateGoalFundingPlan({
        targetAmount: 500000,
        currentAvailable: 1000000,
        monthlyContribution: 10000,
        targetDate: new Date("2027-01-01"),
      });

      expect(result.projectedGap).toBe(0);
      expect(result.projectedSurplus).toBeGreaterThan(0);
      expect(result.status).toBe("ON_TRACK");
      expect(result.isAchievable).toBe(true);
    });

    it("Extend Date is null when monthly contribution is 0", () => {
      const result = FinancialForecastingService.calculateGoalFundingPlan({
        targetAmount: 500000,
        currentAvailable: 100000,
        monthlyContribution: 0,
        targetDate: new Date("2027-01-01"),
      });

      expect(result.status).toBe("FUNDING_GAP");
      expect(result.options?.extendDate.monthsToExtend).toBeNull();
      expect(result.options?.extendDate.projectedTargetDate).toBeNull();
    });
  });

  describe("2. Domain Service Integration — GoalDomainService", () => {
    it("persists monthlyContribution and notes, and evaluates funding plan accurately", async () => {
      const goal = await prisma.$transaction(async (tx) => {
        return GoalDomainService.createGoal(tx, {
          householdId,
          userId,
          name: "Land Purchase",
          targetAmount: new Prisma.Decimal(2000000),
          currentAmount: new Prisma.Decimal(300000),
          monthlyContribution: new Prisma.Decimal(25000),
          targetDate: new Date("2029-01-01"),
          description: "2400 sqft residential plot",
          notes: "Planning to buy in outskirts",
        });
      });

      expect(goal.notes).toBe("Planning to buy in outskirts");
      expect(Number(goal.monthlyContribution)).toBe(25000);

      // Evaluate plan
      const fundingResult = await prisma.$transaction(async (tx) => {
        return GoalDomainService.getGoalFunding(tx, {
          goalId: goal.id,
          householdId,
        });
      });

      expect(fundingResult.targetAmount).toBe(2000000);
      expect(fundingResult.currentAvailable).toBe(300000);
      expect(fundingResult.monthlyContribution).toBe(25000);
      expect(fundingResult.status).toBe("FUNDING_GAP");
      expect(fundingResult.options).toBeDefined();

      // Test What-If overrides without database mutation (with sufficient contribution to reach 20L)
      const whatIfResult = await prisma.$transaction(async (tx) => {
        return GoalDomainService.getGoalFunding(tx, {
          goalId: goal.id,
          householdId,
          overrides: {
            startDate: new Date("2026-01-01"),
            targetDate: new Date("2029-01-01"),
            monthlyContribution: 50000, // 300,000 + (50,000 * 36) = 2,100,000 >= 2,000,000
          },
        });
      });

      expect(whatIfResult.monthlyContribution).toBe(50000);
      expect(whatIfResult.status).toBe("ON_TRACK");
      expect(whatIfResult.projectedGap).toBe(0);

      // Verify DB goal was NOT mutated by the what-if override
      const dbGoal = await prisma.goal.findUnique({ where: { id: goal.id } });
      expect(Number(dbGoal?.monthlyContribution)).toBe(25000);
    });
  });

  describe("3. Strict Read-Only Financial Safety", () => {
    it("guarantees zero ledger, account balance, borrowing, or investment mutations during funding calculations", async () => {
      // Create initial accounts and transactions
      const acc = await prisma.account.create({
        data: {
          householdId,
          name: "HDFC Savings",
          type: "ASSET",
          balance: new Prisma.Decimal(500000),
          currency: "INR",
        },
      });

      const goal = await prisma.$transaction(async (tx) => {
        return GoalDomainService.createGoal(tx, {
          householdId,
          userId,
          name: "Retirement Reserve",
          targetAmount: new Prisma.Decimal(5000000),
          currentAmount: new Prisma.Decimal(500000),
          monthlyContribution: new Prisma.Decimal(30000),
          targetDate: new Date("2035-01-01"),
        });
      });

      const initialJournalsCount = await prisma.journal.count({ where: { householdId } });
      const initialJournalEntriesCount = await prisma.journalEntry.count({
        where: { journal: { householdId } },
      });
      const initialTransactionsCount = await prisma.transaction.count({ where: { householdId } });
      const initialBorrowingsCount = await prisma.borrowing.count({ where: { householdId } });
      const initialInvestmentsCount = await prisma.investment.count({ where: { householdId } });

      // Run multiple funding calculations & simulations
      await prisma.$transaction(async (tx) => {
        await GoalDomainService.getGoalFunding(tx, { goalId: goal.id, householdId });
        await GoalDomainService.getGoalFunding(tx, {
          goalId: goal.id,
          householdId,
          overrides: { monthlyContribution: 100000 },
        });
        await GoalDomainService.getGoalFunding(tx, {
          goalId: goal.id,
          householdId,
          overrides: { currentAvailable: 2000000 },
        });
      });

      // Verify zero leaks
      const finalJournalsCount = await prisma.journal.count({ where: { householdId } });
      const finalJournalEntriesCount = await prisma.journalEntry.count({
        where: { journal: { householdId } },
      });
      const finalTransactionsCount = await prisma.transaction.count({ where: { householdId } });
      const finalBorrowingsCount = await prisma.borrowing.count({ where: { householdId } });
      const finalInvestmentsCount = await prisma.investment.count({ where: { householdId } });
      const finalAcc = await prisma.account.findUnique({ where: { id: acc.id } });

      expect(finalJournalsCount).toBe(initialJournalsCount);
      expect(finalJournalEntriesCount).toBe(initialJournalEntriesCount);
      expect(finalTransactionsCount).toBe(initialTransactionsCount);
      expect(finalBorrowingsCount).toBe(initialBorrowingsCount);
      expect(finalInvestmentsCount).toBe(initialInvestmentsCount);
      expect(Number(finalAcc?.balance)).toBe(500000);
    });
  });
});
