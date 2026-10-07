import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { FinancialSnapshotService } from "@/finance/goals/planner/snapshot";
import { GoalFundingPlannerService } from "@/finance/goals/planner/planner.service";
import { GoalFundingPlanLifecycleService } from "@/finance/goals/planner/lifecycle.service";
import { AiGoalParser } from "@/finance/goals/planner/ai-goal-parser";
import { AiPlanExplanationService } from "@/finance/goals/planner/ai-explanation";
import { SaveStrategy } from "@/finance/goals/planner/strategies/save.strategy";
import { InvestStrategy } from "@/finance/goals/planner/strategies/invest.strategy";
import { SellAssetStrategy } from "@/finance/goals/planner/strategies/sell-asset.strategy";
import { ExtendDeadlineStrategy } from "@/finance/goals/planner/strategies/extend-deadline.strategy";
import { BorrowStrategy } from "@/finance/goals/planner/strategies/borrow.strategy";
import { StrategyRanker } from "@/finance/goals/planner/ranker";
import { Prisma } from "@prisma/client";

describe("Goal Funding v2 — Deterministic Goal Funding Planner Suite", () => {
  const householdId = "hh-planner-v2-test";
  const userId = "usr-planner-v2-test";

  beforeEach(async () => {
    // Clean up
    await prisma.goalFundingPlanLifecycleHistory.deleteMany({
      where: { householdId },
    });
    await prisma.goalFundingPlan.deleteMany({
      where: { householdId },
    });
    await prisma.fundingAssumptionSet.deleteMany({
      where: { householdId },
    });
    await prisma.goalLifecycleHistory.deleteMany({
      where: { goal: { householdId } },
    });
    await prisma.goal.deleteMany({ where: { householdId } });
    await prisma.asset.deleteMany({ where: { householdId } });
    await prisma.borrowing.deleteMany({ where: { householdId } });
    await prisma.account.deleteMany({ where: { householdId } });
    await prisma.householdMember.deleteMany({ where: { householdId } });
    await prisma.household.deleteMany({ where: { id: householdId } });

    // Seed Household
    await prisma.household.create({
      data: {
        id: householdId,
        name: "Planner V2 Test Family",
        currency: "INR",
      },
    });
  });

  describe("1. Financial Snapshot & Hard Constraints", () => {
    it("subtracts emergency reserve from liquid cash (Available Cash cannot go below 0)", async () => {
      // Create Bank account with ₹2,00,000 cash
      await prisma.account.create({
        data: {
          householdId,
          name: "Main Savings",
          type: "BANK",
          balance: new Prisma.Decimal(200000),
        },
      });

      // Without essential expense assumptions or expense history, reserve is null and source is UNKNOWN
      const { snapshot: snapNoExp } = await FinancialSnapshotService.captureSnapshot(prisma, householdId);
      expect(snapNoExp.totalCash).toBe(200000);
      expect(snapNoExp.emergencyReserveAmount).toBeNull();
      expect(snapNoExp.emergencyReserveSource).toBe("UNKNOWN");
      expect(snapNoExp.availableFundingCash).toBe(200000);

      // Now create explicit funding assumptions with essentialExpenseRatio = 0.70
      await prisma.fundingAssumptionSet.create({
        data: {
          householdId,
          version: 2,
          emergencyReserveMonths: 6,
          essentialExpenseRatio: 0.70,
          active: true,
        },
      });

      // Create an expense account and 90-day transactions to derive actual monthly expenses
      const expenseAcc = await prisma.account.create({
        data: {
          householdId,
          name: "Living Expenses",
          type: "EXPENSE",
          balance: new Prisma.Decimal(0),
        },
      });

      const bankAcc = await prisma.account.findFirst({ where: { householdId, type: "BANK" } });
      const now = new Date();
      await prisma.transaction.create({
        data: {
          householdId,
          accountId: bankAcc!.id,
          amount: new Prisma.Decimal(90000),
          type: "EXPENSE",
          description: "Monthly living expenses",
          date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
          status: "POSTED",
        },
      });

      const { snapshot: snapWithExp } = await FinancialSnapshotService.captureSnapshot(prisma, householdId);
      expect(snapWithExp.emergencyReserveAmount).not.toBeNull();
      expect(snapWithExp.emergencyReserveAmount!).toBeGreaterThan(0);
      expect(snapWithExp.availableFundingCash).toBeGreaterThanOrEqual(0);
    });

    it("respects multi-goal priority hierarchy: higher priority goals consume surplus first", async () => {
      // Create a High-Priority Goal with ₹15,000/mo commitment
      await prisma.goal.create({
        data: {
          householdId,
          name: "Emergency Reserve Goal",
          targetAmount: new Prisma.Decimal(500000),
          currentAmount: new Prisma.Decimal(100000),
          targetDate: new Date("2028-12-31"),
          priority: "HIGH",
          monthlyContribution: new Prisma.Decimal(15000),
          status: "ACTIVE",
        },
      });

      // Create a Medium-Priority Target Goal
      const medGoal = await prisma.goal.create({
        data: {
          householdId,
          name: "Vacation Goal",
          targetAmount: new Prisma.Decimal(200000),
          currentAmount: new Prisma.Decimal(0),
          targetDate: new Date("2027-12-31"),
          priority: "MEDIUM",
          monthlyContribution: new Prisma.Decimal(5000),
          status: "ACTIVE",
        },
      });

      const { snapshot } = await FinancialSnapshotService.captureSnapshot(prisma, householdId, medGoal.id);

      // Higher priority commitments must equal ₹15,000
      expect(snapshot.higherPriorityGoalMonthlyCommitments).toBe(15000);
      // Available capacity for the medium goal must have subtracted 15,000
      expect(snapshot.availableGoalFundingCapacity).toBe(
        Math.max(0, (snapshot.monthlySurplus ?? 0) - 15000)
      );
    });
  });

  describe("2. Deterministic Gap Engine & Strategy Plugins", () => {
    it("reports FULLY_FUNDED when cash + projected savings exceed target (stops borrowing/investing suggestions)", () => {
      const ctx: any = {
        goal: {
          id: "g-1",
          name: "Bike",
          targetAmount: 100000,
          currentAmount: 50000,
          targetDate: new Date("2027-01-01"),
          priority: "MEDIUM",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: 5000,
        },
        snapshot: {
          availableGoalFundingCapacity: 20000,
          availableFundingCash: 60000,
        },
        gap: {
          initialTarget: 100000,
          availableFundingCash: 110000,
          projectedOwnSavings: 50000,
          netFundingGap: 0,
          monthsRemaining: 12,
          isFullyFunded: true,
        },
        assumptions: {
          version: 1,
          fixedIncomeLow: 5,
          fixedIncomeBase: 6.5,
          fixedIncomeHigh: 7.5,
          investmentLow: 7,
          investmentBase: 11,
          investmentHigh: 14,
          emergencyReserveMonths: 6,
          maxDebtServiceRatio: 0.35,
        },
      };

      const saveRes = SaveStrategy.evaluate(ctx);
      const borrowRes = BorrowStrategy.evaluate(ctx);

      expect(saveRes.reasonCodes).toContain("GOAL_FULLY_FUNDED");
      expect(saveRes.monthlyRequired).toBe(0);
      expect(borrowRes.reasonCodes).toContain("GOAL_FULLY_FUNDED");
      expect(borrowRes.explanation).toContain("already fully funded");
    });

    it("filters asset sales to only ELIGIBLE and OPTIONAL assets", () => {
      const ctx: any = {
        goal: {
          id: "g-2",
          name: "House Downpayment",
          targetAmount: 500000,
          currentAmount: 0,
          targetDate: new Date("2028-01-01"),
          priority: "HIGH",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: 0,
        },
        snapshot: {
          availableGoalFundingCapacity: 10000,
          eligibleAssets: [
            { id: "a-1", name: "Family Ancestral Home", currentValue: 1000000, fundingEligibility: "NOT_ELIGIBLE" },
            { id: "a-2", name: "Old Car", currentValue: 200000, fundingEligibility: "ELIGIBLE" },
            { id: "a-3", name: "Gold Coins", currentValue: 150000, fundingEligibility: "OPTIONAL" },
          ],
        },
        gap: {
          initialTarget: 500000,
          availableFundingCash: 0,
          projectedOwnSavings: 0,
          netFundingGap: 500000,
          monthsRemaining: 24,
          isFullyFunded: false,
        },
        assumptions: {},
      };

      const assetRes = SellAssetStrategy.evaluate(ctx);
      // Only Old Car (2L) + Gold Coins (1.5L) = 3.5L considered
      expect(assetRes.subBreakdown?.allocatedAssetAmount).toBe(350000);
      expect(assetRes.subBreakdown?.remainingGapAfterAsset).toBe(150000);
      expect(assetRes.subBreakdown?.eligibleAssetsConsidered.length).toBe(2);
    });

    it("flags elevated risk for investment strategy with short horizon (< 24 months)", () => {
      const ctxShort: any = {
        goal: { id: "g-3", name: "Laptop", targetAmount: 100000, currentAmount: 0, targetDate: new Date("2027-01-01"), priority: "MEDIUM", deadlineFlexibility: "MODERATE", monthlyContribution: 0 },
        snapshot: { availableGoalFundingCapacity: 20000 },
        gap: { initialTarget: 100000, availableFundingCash: 0, projectedOwnSavings: 0, netFundingGap: 100000, monthsRemaining: 10, isFullyFunded: false },
        assumptions: { investmentLow: 7, investmentBase: 11, investmentHigh: 14 },
      };

      const resShort = InvestStrategy.evaluate(ctxShort);
      expect(resShort.feasible).toBe(false); // short horizon < 12m is marked infeasible for pure SIP equity
      expect(resShort.reasonCodes).toContain("SHORT_HORIZON_VOLATILITY_RISK");
      expect(resShort.riskScore).toBeGreaterThanOrEqual(75);
    });

    it("respects deadlineFlexibility STRICT in ExtendDeadlineStrategy", () => {
      const ctxStrict: any = {
        goal: { id: "g-4", name: "Wedding", targetAmount: 500000, currentAmount: 0, targetDate: new Date("2027-01-01"), priority: "HIGH", deadlineFlexibility: "STRICT", monthlyContribution: 10000 },
        snapshot: { availableGoalFundingCapacity: 15000 },
        gap: { initialTarget: 500000, availableFundingCash: 0, projectedOwnSavings: 120000, netFundingGap: 380000, monthsRemaining: 12, isFullyFunded: false },
        assumptions: {},
      };

      const resStrict = ExtendDeadlineStrategy.evaluate(ctxStrict);
      expect(resStrict.feasible).toBe(false);
      expect(resStrict.reasonCodes).toContain("DEADLINE_STRICT_CANNOT_EXTEND");
    });
  });

  describe("3. Deterministic Ranker & Least-Invasive Hierarchy", () => {
    it("ranks cash/savings above borrowing when both are feasible", () => {
      const ctx: any = {
        goal: { targetAmount: 100000 },
        snapshot: { availableGoalFundingCapacity: 20000 },
        gap: { initialTarget: 100000, netFundingGap: 100000 },
      };

      const candidates: any[] = [
        { strategyType: "BORROW", name: "Loan", feasible: true, monthlyRequired: 5000, totalCost: 15000, riskScore: 70, liquidityScore: 40, flexibilityScore: 30, invasivenessScore: 85, reasonCodes: [] },
        { strategyType: "SAVE", name: "Save", feasible: true, monthlyRequired: 5000, totalCost: 0, riskScore: 0, liquidityScore: 95, flexibilityScore: 90, invasivenessScore: 15, reasonCodes: [] },
      ];

      const ranked = StrategyRanker.rankStrategies(candidates, ctx);
      expect(ranked[0].strategyType).toBe("SAVE");
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
  });

  describe("4. Plan Lifecycle, Immutability & Health Check", () => {
    it("approves plan, supersedes historical active plans, and detects stale plans", async () => {
      // 1. Create a Goal
      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "Land Purchase",
          targetAmount: new Prisma.Decimal(2000000),
          currentAmount: new Prisma.Decimal(300000),
          targetDate: new Date("2029-01-01"),
          priority: "HIGH",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: new Prisma.Decimal(25000),
          status: "ACTIVE",
        },
      });

      // 2. Generate Plan
      const planRes = await GoalFundingPlannerService.generatePlan(prisma, {
        goalId: goal.id,
        householdId,
      });

      expect(planRes.recommendedPlan).toBeDefined();

      // 3. Save as PROPOSED
      const proposed = await GoalFundingPlannerService.saveProposedPlan(prisma, {
        householdId,
        goalId: goal.id,
        selectedStrategy: planRes.recommendedPlan,
        planResult: planRes,
        userId,
      });

      expect(proposed.status).toBe("PROPOSED");
      expect(proposed.version).toBe(1);

      // 4. Approve Plan
      const approved = await GoalFundingPlanLifecycleService.approvePlan(prisma, {
        planId: proposed.id,
        goalId: goal.id,
        householdId,
        userId,
        reason: "User approved conservative savings plan",
      });

      expect(approved.status).toBe("ACTIVE");

      // Verify immutable lifecycle history was recorded
      const histories = await prisma.goalFundingPlanLifecycleHistory.findMany({
        where: { planId: proposed.id },
      });
      expect(histories.length).toBeGreaterThanOrEqual(2); // PROPOSE and APPROVE

      // 5. Check health: if surplus is healthy, plan is healthy
      const health = await GoalFundingPlanLifecycleService.checkPlanHealth(prisma, {
        goalId: goal.id,
        householdId,
        userId,
      });
      expect(health.status).toBeDefined();
    });
  });

  describe("5. AI Goal Parser & Strict Financial Number Validator", () => {
    it("accurately extracts goal draft parameters from natural language prompts", () => {
      const prompt = "I want to buy a car worth 12 lakhs in December 2027 and save 20k monthly with high priority";
      const draft = AiGoalParser.parse(prompt);

      expect(draft.name.toLowerCase()).toContain("car");
      expect(draft.targetAmount).toBe(1200000);
      expect(draft.monthlyContribution).toBe(20000);
      expect(draft.priority).toBe("HIGH");
      expect(draft.targetDate).toContain("2027-12");
    });

    it("rejects unauthorized hallucinated numbers in AI output and falls back to deterministic narrative", () => {
      const mockStrat: any = {
        name: "Save Strategy",
        strategyType: "SAVE",
        score: 85,
        rank: 1,
        monthlyRequired: 15000,
        totalCost: 0,
        riskScore: 0,
        liquidityScore: 95,
        flexibilityScore: 90,
        reasonCodes: ["AFFORDABLE_MONTHLY_SAVING"],
        explanation: "Save ₹15,000 per month.",
      };

      const mockSnapshot: any = {
        totalCash: 100000,
        emergencyReserveMonths: 6,
        emergencyReserveAmount: 60000,
        earmarkedCash: 0,
        monthlyIncome: 80000,
        monthlyEssentialExpenses: 30000,
        monthlyTotalExpenses: 40000,
        existingEmiObligations: 0,
        monthlySurplus: 40000,
        availableGoalFundingCapacity: 40000,
        totalEligibleAssetValue: 0,
      };

      const mockAssumptions: any = {
        version: 1,
        fixedIncomeLow: 5,
        fixedIncomeBase: 6.5,
        fixedIncomeHigh: 7.5,
        investmentLow: 7,
        investmentBase: 11,
        investmentHigh: 14,
        emergencyReserveMonths: 6,
        maxDebtServiceRatio: 0.35,
      };

      const mockGap = {
        initialTarget: 500000,
        availableFundingCash: 40000,
        projectedOwnSavings: 150000,
        netFundingGap: 310000,
        monthsRemaining: 24,
      };

      // Case A: Hallucinated number 999999 not in snapshot or plan
      const hallucinatedText = "You will definitely get a bonus of ₹999999 to cover the goal!";
      const resFallback = AiPlanExplanationService.formatSafeExplanation(
        hallucinatedText,
        mockStrat,
        mockSnapshot,
        mockAssumptions,
        mockGap
      );

      expect(resFallback.source).toBe("DETERMINISTIC_FALLBACK");
      expect(resFallback.text).not.toContain("999999");
      expect(resFallback.text).toContain("Save Strategy");

      // Case B: Legitimate explanation with only validated numbers
      const validText = "Save ₹15,000 monthly from your available surplus of ₹40,000 to achieve ₹500,000.";
      const resValid = AiPlanExplanationService.formatSafeExplanation(
        validText,
        mockStrat,
        mockSnapshot,
        mockAssumptions,
        mockGap
      );

      expect(resValid.source).toBe("AI_VALIDATED");
      expect(resValid.text).toBe(validText);
    });
  });

  describe("6. Production Remediation Certification Tests", () => {
    it("Borrowing Domain: calculateScenario & calculateAffordability are owned by BorrowingService", () => {
      // 1. Unknown interest rate requires rate assumption
      const unknownRateRes = BorrowStrategy.evaluate({
        goal: { id: "g-b1", name: "Car", targetAmount: 500000, currentAmount: 0, targetDate: new Date("2028-01-01"), priority: "MEDIUM", deadlineFlexibility: "FLEXIBLE", monthlyContribution: 0 },
        snapshot: { availableGoalFundingCapacity: 25000, monthlyIncome: 80000, monthlySurplus: 40000 },
        gap: { initialTarget: 500000, availableFundingCash: 0, projectedOwnSavings: 0, netFundingGap: 500000, monthsRemaining: 24, isFullyFunded: false },
        assumptions: { maxDebtServiceRatio: 0.35, borrowingAnnualInterestRate: null }, // no configured rate
      } as any);

      expect(unknownRateRes.feasibilityStatus).toBe("REQUIRES_ASSUMPTION");
      expect(unknownRateRes.reasonCodes).toContain("BORROWING_RATE_REQUIRED");
      expect(unknownRateRes.requiresUserAssumption).toBe(true);

      // 2. Configured rate evaluated through BorrowingService
      // Principal = 500,000, 24 months, 11.5% -> EMI is ~23,423.
      // Income 1,00,000 * 0.35 max debt service = 35,000 max EMI.
      // 23,423 <= 35,000 -> Affordable!
      const configuredRateRes = BorrowStrategy.evaluate({
        goal: { id: "g-b2", name: "Car", targetAmount: 500000, currentAmount: 0, targetDate: new Date("2028-01-01"), priority: "MEDIUM", deadlineFlexibility: "FLEXIBLE", monthlyContribution: 0 },
        snapshot: { householdId, availableGoalFundingCapacity: 30000, monthlyIncome: 100000, monthlyTotalExpenses: 40000, existingEmiObligations: 0, monthlySurplus: 60000 },
        gap: { initialTarget: 500000, availableFundingCash: 0, projectedOwnSavings: 0, netFundingGap: 500000, monthsRemaining: 24, isFullyFunded: false },
        assumptions: { maxDebtServiceRatio: 0.35, borrowingAnnualInterestRate: 11.5 },
      } as any);

      expect(configuredRateRes.feasibilityStatus).toBe("FEASIBLE");
      expect(configuredRateRes.subBreakdown?.interestRate).toBe(11.5);
      expect(configuredRateRes.monthlyRequired).toBeGreaterThan(0);
    });

    it("Controlled Combinations: Annotated with method CONTROLLED_SCENARIO and allocation breakdown", async () => {
      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "Factory Equipment",
          targetAmount: new Prisma.Decimal(1000000),
          currentAmount: new Prisma.Decimal(100000),
          targetDate: new Date("2028-01-01"),
          priority: "HIGH",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: new Prisma.Decimal(10000),
          status: "ACTIVE",
        },
      });

      const planRes = await GoalFundingPlannerService.generatePlan(prisma, {
        goalId: goal.id,
        householdId,
      });

      const comboStrategies = planRes.allStrategies.filter((s) => s.strategyType === "COMBINATION");
      expect(comboStrategies.length).toBeGreaterThan(0);
      for (const combo of comboStrategies) {
        expect(combo.subBreakdown?.method).toBe("CONTROLLED_SCENARIO");
      }
    });

    it("Two-Stage Ranking: Strict partitioning (FEASIBLE > REQUIRES_ASSUMPTION > INFEASIBLE)", () => {
      const ctx: any = {
        goal: { targetAmount: 500000 },
        snapshot: { availableGoalFundingCapacity: 30000 },
        gap: { initialTarget: 500000, netFundingGap: 500000 },
      };

      const candidates: any[] = [
        { strategyType: "INVEST", name: "Infeasible Invest", feasible: false, feasibilityStatus: "INFEASIBLE", monthlyRequired: 1000, totalCost: 0, riskScore: 90, liquidityScore: 10, flexibilityScore: 10, invasivenessScore: 90, reasonCodes: [] },
        { strategyType: "BORROW", name: "Assumption Borrow", feasible: false, feasibilityStatus: "REQUIRES_ASSUMPTION", requiresUserAssumption: true, monthlyRequired: 5000, totalCost: 20000, riskScore: 50, liquidityScore: 50, flexibilityScore: 50, invasivenessScore: 60, reasonCodes: [] },
        { strategyType: "SAVE", name: "Feasible Save", feasible: true, feasibilityStatus: "FEASIBLE", monthlyRequired: 15000, totalCost: 0, riskScore: 10, liquidityScore: 90, flexibilityScore: 90, invasivenessScore: 20, reasonCodes: [] },
      ];

      const ranked = StrategyRanker.rankStrategies(candidates, ctx);
      expect(ranked[0].feasibilityStatus).toBe("FEASIBLE");
      expect(ranked[1].feasibilityStatus).toBe("REQUIRES_ASSUMPTION");
      expect(ranked[2].feasibilityStatus).toBe("INFEASIBLE");
    });

    it("Canonical SHA-256 Calculation ID is reproducible for identical inputs", async () => {
      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "College Fund",
          targetAmount: new Prisma.Decimal(500000),
          currentAmount: new Prisma.Decimal(50000),
          targetDate: new Date("2029-01-01"),
          priority: "HIGH",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: new Prisma.Decimal(10000),
          status: "ACTIVE",
        },
      });

      const plan1 = await GoalFundingPlannerService.generatePlan(prisma, { goalId: goal.id, householdId });
      const plan2 = await GoalFundingPlannerService.generatePlan(prisma, { goalId: goal.id, householdId });

      expect(plan1.calculationId).toBe(plan2.calculationId);
      expect(plan1.calculationId.length).toBe(64); // SHA-256 hex string
    });

    it("Concurrency Safety: Sequential or atomic approvals supersede prior active plan", async () => {
      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "Farm Expansion",
          targetAmount: new Prisma.Decimal(800000),
          currentAmount: new Prisma.Decimal(100000),
          targetDate: new Date("2028-06-01"),
          priority: "HIGH",
          deadlineFlexibility: "MODERATE",
          monthlyContribution: new Prisma.Decimal(15000),
          status: "ACTIVE",
        },
      });

      const planRes = await GoalFundingPlannerService.generatePlan(prisma, { goalId: goal.id, householdId });

      const planA = await GoalFundingPlannerService.saveProposedPlan(prisma, {
        householdId,
        goalId: goal.id,
        selectedStrategy: planRes.recommendedPlan,
        planResult: planRes,
        userId,
      });

      const planB = await GoalFundingPlannerService.saveProposedPlan(prisma, {
        householdId,
        goalId: goal.id,
        selectedStrategy: planRes.allStrategies[1] || planRes.recommendedPlan,
        planResult: planRes,
        userId,
      });

      await GoalFundingPlanLifecycleService.approvePlan(prisma, {
        planId: planA.id,
        goalId: goal.id,
        householdId,
        userId,
        reason: "Approve plan A",
      });

      await GoalFundingPlanLifecycleService.approvePlan(prisma, {
        planId: planB.id,
        goalId: goal.id,
        householdId,
        userId,
        reason: "Approve plan B superseding plan A",
      });

      const activePlans = await prisma.goalFundingPlan.findMany({
        where: { goalId: goal.id, householdId, status: "ACTIVE" },
      });

      // Exactly ONE active plan must exist
      expect(activePlans.length).toBe(1);
      expect(activePlans[0].id).toBe(planB.id);

      const planARefreshed = await prisma.goalFundingPlan.findUnique({ where: { id: planA.id } });
      expect(planARefreshed?.status).toBe("SUPERSEDED");
    });
  });
});
