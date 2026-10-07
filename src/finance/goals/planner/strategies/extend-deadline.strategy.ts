import { StrategyContext, StrategyResult } from "./strategy.interface";

export class ExtendDeadlineStrategy {
  /**
   * Evaluates extending goal timeline based on user's current planned monthly contribution or available surplus.
   * Hard Constraint: Respects goal.deadlineFlexibility ('STRICT' -> Infeasible).
   */
  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap, goal, snapshot } = ctx;

    if (gap.isFullyFunded) {
      return {
        strategyType: "EXTEND_DEADLINE",
        name: "Timeline Strategy",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 90,
        riskScore: 0,
        flexibilityScore: 90,
        invasivenessScore: 60,
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded within original timeline.",
      };
    }

    const reasonCodes: string[] = [];

    // Deadline Flexibility Constraint
    if (goal.deadlineFlexibility === "STRICT") {
      reasonCodes.push("DEADLINE_STRICT_CANNOT_EXTEND");
      return {
        strategyType: "EXTEND_DEADLINE",
        name: "Extend Target Date",
        feasible: false,
        feasibilityStatus: "INFEASIBLE",
        monthlyRequired: goal.monthlyContribution,
        projectedLow: gap.availableFundingCash + (goal.monthlyContribution * gap.monthsRemaining),
        projectedBase: gap.availableFundingCash + (goal.monthlyContribution * gap.monthsRemaining),
        projectedHigh: gap.availableFundingCash + (goal.monthlyContribution * gap.monthsRemaining),
        totalCost: 0,
        liquidityScore: 85,
        riskScore: 0,
        flexibilityScore: 20,
        invasivenessScore: 60,
        reasonCodes,
        explanation: "Goal deadline is marked as STRICT and cannot be extended.",
      };
    }

    const monthlyRate = goal.monthlyContribution > 0
      ? goal.monthlyContribution
      : Math.min(10000, snapshot.availableGoalFundingCapacity);

    if (monthlyRate <= 0) {
      reasonCodes.push("ZERO_MONTHLY_CONTRIBUTION_CANNOT_PROJECT", "REQUIRES_USER_ASSUMPTION");
      return {
        strategyType: "EXTEND_DEADLINE",
        name: "Extend Target Date",
        feasible: false,
        feasibilityStatus: "REQUIRES_ASSUMPTION",
        requiresUserAssumption: true,
        monthlyRequired: 0,
        projectedLow: gap.availableFundingCash,
        projectedBase: gap.availableFundingCash,
        projectedHigh: gap.availableFundingCash,
        totalCost: 0,
        liquidityScore: 85,
        riskScore: 0,
        flexibilityScore: 30,
        invasivenessScore: 60,
        reasonCodes,
        explanation: "Cannot project date extension without a monthly contribution or available surplus.",
      };
    }

    const additionalMonthsNeeded = Math.ceil(gap.netFundingGap / monthlyRate);
    const originalTargetDate = new Date(goal.targetDate);
    const newTargetDate = new Date(originalTargetDate);
    newTargetDate.setMonth(newTargetDate.getMonth() + additionalMonthsNeeded);

    const maxExtensionMonths = goal.deadlineFlexibility === "MODERATE" ? 36 : 120;
    const isFeasible = additionalMonthsNeeded <= maxExtensionMonths;

    if (!isFeasible) {
      reasonCodes.push("EXTENSION_EXCEEDS_REASONABLE_HORIZON");
    } else {
      reasonCodes.push("DEADLINE_EXTENSION_FEASIBLE");
    }

    const totalProjected = gap.initialTarget;
    const dateFormatted = `${newTargetDate.getFullYear()}-${String(newTargetDate.getMonth() + 1).padStart(2, "0")}`;

    return {
      strategyType: "EXTEND_DEADLINE",
      name: "Extend Target Completion Date",
      feasible: isFeasible,
      feasibilityStatus: isFeasible ? "FEASIBLE" : "INFEASIBLE",
      monthlyRequired: monthlyRate,
      projectedLow: totalProjected,
      projectedBase: totalProjected,
      projectedHigh: totalProjected,
      totalCost: 0,
      liquidityScore: 85,
      riskScore: 0,
      flexibilityScore: 80,
      invasivenessScore: 60,
      reasonCodes,
      explanation: isFeasible
        ? `Maintain your current ₹${monthlyRate.toLocaleString("en-IN")}/month contribution and extend target date by ${additionalMonthsNeeded} months to ${dateFormatted}.`
        : `Requires extending timeline by ${additionalMonthsNeeded} months, which exceeds the flexibility limit for this goal.`,
      subBreakdown: {
        additionalMonthsNeeded,
        newTargetDate: newTargetDate.toISOString().split("T")[0],
        originalTargetDate: originalTargetDate.toISOString().split("T")[0],
        monthlyRate,
      },
    };
  }
}
