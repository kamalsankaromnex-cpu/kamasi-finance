import { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { FinancialSnapshotService } from "./snapshot";
import {
  FinancialSnapshot,
  FundingAssumptionConfig,
  StrategyContext,
  StrategyResult,
} from "./strategies/strategy.interface";
import { SaveStrategy } from "./strategies/save.strategy";
import { FixedIncomeStrategy } from "./strategies/fixed-income.strategy";
import { InvestStrategy } from "./strategies/invest.strategy";
import { SellAssetStrategy } from "./strategies/sell-asset.strategy";
import { ExtendDeadlineStrategy } from "./strategies/extend-deadline.strategy";
import { RaiseIncomeStrategy } from "./strategies/raise-income.strategy";
import { BorrowStrategy } from "./strategies/borrow.strategy";
import { CombinationEngine } from "./combination-engine";
import { StrategyRanker, RankedStrategy, RankingWeights } from "./ranker";

export interface PlanGenerationResult {
  calculationId: string;
  goal: {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    deadlineFlexibility: "STRICT" | "MODERATE" | "FLEXIBLE";
    monthlyContribution: number;
  };
  snapshot: FinancialSnapshot;
  assumptions: FundingAssumptionConfig;
  gap: {
    initialTarget: number;
    availableFundingCash: number;
    projectedOwnSavings: number;
    netFundingGap: number;
    monthsRemaining: number;
    isFullyFunded: boolean;
  };
  recommendedPlan: RankedStrategy;
  alternativePlans: RankedStrategy[];
  allStrategies: RankedStrategy[];
}

export class GoalFundingPlannerService {
  public static readonly PLANNER_VERSION = 2;

  /**
   * Calculate months between now and target date (at least 1 month).
   */
  public static calculateMonthsRemaining(targetDate: Date, startDate: Date = new Date()): number {
    const start = new Date(startDate);
    const target = new Date(targetDate);
    const yearsDiff = target.getFullYear() - start.getFullYear();
    const monthsDiff = target.getMonth() - start.getMonth();
    const totalMonths = yearsDiff * 12 + monthsDiff;
    return Math.max(1, totalMonths);
  }

  /**
   * Deterministic SHA-256 calculation ID generated strictly from canonical inputs.
   * Reproducible across identical goal, snapshot, assumptions, and planner version.
   */
  public static computeCalculationId(
    goal: { id: string; targetAmount: number; currentAmount: number; targetDate: string; priority: string; deadlineFlexibility: string; monthlyContribution: number },
    snapshot: FinancialSnapshot,
    assumptions: FundingAssumptionConfig,
    plannerVersion: number = GoalFundingPlannerService.PLANNER_VERSION
  ): string {
    const canonicalPayload = {
      plannerVersion,
      goal: {
        id: goal.id,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: goal.targetDate,
        priority: goal.priority,
        deadlineFlexibility: goal.deadlineFlexibility,
        monthlyContribution: goal.monthlyContribution,
      },
      snapshot: {
        householdId: snapshot.householdId,
        totalCash: snapshot.totalCash,
        cashSource: snapshot.cashSource,
        emergencyReserveAmount: snapshot.emergencyReserveAmount,
        emergencyReserveSource: snapshot.emergencyReserveSource,
        earmarkedCash: snapshot.earmarkedCash,
        availableFundingCash: snapshot.availableFundingCash,
        monthlyIncome: snapshot.monthlyIncome,
        monthlyIncomeSource: snapshot.monthlyIncomeSource,
        monthlyTotalExpenses: snapshot.monthlyTotalExpenses,
        monthlyExpenseSource: snapshot.monthlyExpenseSource,
        monthlyEssentialExpenses: snapshot.monthlyEssentialExpenses,
        monthlyEssentialExpenseSource: snapshot.monthlyEssentialExpenseSource,
        existingEmiObligations: snapshot.existingEmiObligations,
        monthlySurplus: snapshot.monthlySurplus,
        higherPriorityGoalMonthlyCommitments: snapshot.higherPriorityGoalMonthlyCommitments,
        availableGoalFundingCapacity: snapshot.availableGoalFundingCapacity,
        totalEligibleAssetValue: snapshot.totalEligibleAssetValue,
        totalOutstandingBorrowings: snapshot.totalOutstandingBorrowings,
      },
      assumptions: {
        version: assumptions.version,
        fixedIncomeLow: assumptions.fixedIncomeLow,
        fixedIncomeBase: assumptions.fixedIncomeBase,
        fixedIncomeHigh: assumptions.fixedIncomeHigh,
        investmentLow: assumptions.investmentLow,
        investmentBase: assumptions.investmentBase,
        investmentHigh: assumptions.investmentHigh,
        emergencyReserveMonths: assumptions.emergencyReserveMonths,
        maxDebtServiceRatio: assumptions.maxDebtServiceRatio,
        borrowingAnnualInterestRate: assumptions.borrowingAnnualInterestRate,
      },
    };

    return createHash("sha256")
      .update(JSON.stringify(canonicalPayload))
      .digest("hex");
  }

  /**
   * Core Deterministic Goal Funding Planner Orchestration:
   * 1. Consumes Financial Snapshot (authoritative Cash, Reserves, Surplus, Goals, Assets).
   * 2. Evaluates Deterministic Gap.
   * 3. Evaluates 7 Strategy Plugins.
   * 4. Evaluates Controlled Combination Strategies.
   * 5. Runs Deterministic Ranker with Least-Invasive hierarchy & normalizations.
   * 6. Produces recommended plan and alternative plans.
   * Pure read-only calculation, zero ledger mutations.
   */
  public static async generatePlan(
    db: Prisma.TransactionClient | PrismaClient,
    params: {
      goalId: string;
      householdId: string;
      customWeights?: Partial<RankingWeights>;
      overrides?: {
        targetDate?: Date | string;
        monthlyContribution?: number;
      };
    }
  ): Promise<PlanGenerationResult> {
    const goal = await db.goal.findFirst({
      where: { id: params.goalId, householdId: params.householdId },
    });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    const targetDate = params.overrides?.targetDate
      ? new Date(params.overrides.targetDate)
      : new Date(goal.targetDate);

    const monthlyContribution =
      params.overrides?.monthlyContribution !== undefined
        ? Number(params.overrides.monthlyContribution)
        : Number(goal.monthlyContribution || 0);

    const targetAmount = Number(goal.targetAmount);
    const currentAmount = Number(goal.currentAmount);

    // 1. Snapshot
    const { snapshot, assumptions } = await FinancialSnapshotService.captureSnapshot(
      db,
      params.householdId,
      goal.id
    );

    // 2. Deterministic Gap Calculation
    const monthsRemaining = this.calculateMonthsRemaining(targetDate);
    const totalCashForGoal = currentAmount + snapshot.availableFundingCash;
    const projectedOwnSavings = monthlyContribution * monthsRemaining;
    const totalInitialProjected = totalCashForGoal + projectedOwnSavings;
    const netFundingGap = Math.max(0, targetAmount - totalInitialProjected);
    const isFullyFunded = netFundingGap <= 0;

    const gap = {
      initialTarget: targetAmount,
      availableFundingCash: totalCashForGoal,
      projectedOwnSavings,
      netFundingGap,
      monthsRemaining,
      isFullyFunded,
    };

    const ctx: StrategyContext = {
      goal: {
        id: goal.id,
        name: goal.name,
        targetAmount,
        currentAmount,
        targetDate,
        priority: (goal.priority as any) || "MEDIUM",
        deadlineFlexibility: (goal.deadlineFlexibility as any) || "MODERATE",
        monthlyContribution,
      },
      snapshot,
      gap,
      assumptions,
    };

    // 3. Strategy Plugins Evaluation
    const singleResults: Record<string, StrategyResult> = {
      SAVE: SaveStrategy.evaluate(ctx),
      FIXED_INCOME: FixedIncomeStrategy.evaluate(ctx),
      INVEST: InvestStrategy.evaluate(ctx),
      SELL_ASSET: SellAssetStrategy.evaluate(ctx),
      EXTEND_DEADLINE: ExtendDeadlineStrategy.evaluate(ctx),
      RAISE_INCOME: RaiseIncomeStrategy.evaluate(ctx),
      BORROW: BorrowStrategy.evaluate(ctx),
    };

    // 4. Controlled Combinations
    const combinations = CombinationEngine.generateCombinations(ctx, singleResults);

    // 5. Aggregate all evaluated options
    const allCandidates: StrategyResult[] = [
      ...Object.values(singleResults),
      ...combinations,
    ];

    // 6. Two-Stage Deterministic Ranker
    const defaultWeights = StrategyRanker.getDefaultWeights();
    const activeWeights: RankingWeights = {
      ...defaultWeights,
      ...(params.customWeights || {}),
    };

    const ranked = StrategyRanker.rankStrategies(allCandidates, ctx, activeWeights);

    const recommendedPlan = ranked[0];
    const alternativePlans = ranked.slice(1);

    const goalDescriptor = {
      id: goal.id,
      name: goal.name,
      targetAmount,
      currentAmount,
      targetDate: targetDate.toISOString(),
      priority: (goal.priority as any) || "MEDIUM",
      deadlineFlexibility: (goal.deadlineFlexibility as any) || "MODERATE",
      monthlyContribution,
    };

    const calculationId = this.computeCalculationId(goalDescriptor, snapshot, assumptions, this.PLANNER_VERSION);

    return {
      calculationId,
      goal: goalDescriptor,
      snapshot,
      assumptions,
      gap,
      recommendedPlan,
      alternativePlans,
      allStrategies: ranked,
    };
  }

  /**
   * Save a newly calculated plan proposal to the database as PROPOSED.
   */
  public static async saveProposedPlan(
    db: Prisma.TransactionClient | PrismaClient,
    params: {
      householdId: string;
      goalId: string;
      selectedStrategy: RankedStrategy;
      planResult: PlanGenerationResult;
      userId: string;
      parentPlanId?: string;
    }
  ) {
    // Find latest version for this goal
    const latestPlan = await db.goalFundingPlan.findFirst({
      where: { goalId: params.goalId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestPlan?.version || 0) + 1;

    // Projected completion date calculation
    let completionDate = new Date(params.planResult.goal.targetDate);
    if (params.selectedStrategy.subBreakdown?.newTargetDate) {
      completionDate = new Date(params.selectedStrategy.subBreakdown.newTargetDate);
    }

    const createdPlan = await db.goalFundingPlan.create({
      data: {
        householdId: params.householdId,
        goalId: params.goalId,
        version: nextVersion,
        parentPlanId: params.parentPlanId || latestPlan?.id || null,
        status: "PROPOSED",
        strategyType: params.selectedStrategy.strategyType,
        name: params.selectedStrategy.name,
        score: params.selectedStrategy.score,
        monthlyBurden: new Prisma.Decimal(params.selectedStrategy.monthlyRequired),
        totalCost: new Prisma.Decimal(params.selectedStrategy.totalCost),
        riskScore: params.selectedStrategy.riskScore,
        liquidityScore: params.selectedStrategy.liquidityScore,
        flexibilityScore: params.selectedStrategy.flexibilityScore,
        projectedLow: new Prisma.Decimal(params.selectedStrategy.projectedLow),
        projectedBase: new Prisma.Decimal(params.selectedStrategy.projectedBase),
        projectedHigh: new Prisma.Decimal(params.selectedStrategy.projectedHigh),
        fundingGap: new Prisma.Decimal(params.planResult.gap.netFundingGap),
        projectedCompletionDate: completionDate,
        planDetailsJson: JSON.stringify(params.selectedStrategy),
        snapshotJson: JSON.stringify(params.planResult.snapshot),
        reasonCodes: JSON.stringify(params.selectedStrategy.reasonCodes),
        assumptionSetVersion: params.planResult.assumptions.version,
        rankingModelVersion: 1,
        calculationDate: new Date(),
      },
    });

    // Record lifecycle history
    await db.goalFundingPlanLifecycleHistory.create({
      data: {
        planId: createdPlan.id,
        householdId: params.householdId,
        fromStatus: "NONE",
        toStatus: "PROPOSED",
        action: "PROPOSE",
        reason: "Initial plan calculation generated",
        performedBy: params.userId,
      },
    });

    return createdPlan;
  }
}
