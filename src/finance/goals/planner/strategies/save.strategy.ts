import { StrategyContext, StrategyResult } from "./strategy.interface";

export class SaveStrategy {
  /**
   * Evaluates pure savings strategy by increasing monthly savings.
   * Compares required monthly savings against available goal funding capacity (surplus minus higher-priority commitments).
   */
  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap, snapshot } = ctx;
    const months = gap.monthsRemaining;

    if (gap.isFullyFunded) {
      return {
        strategyType: "SAVE",
        name: "Self-Funded from Available Cash",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 100,
        riskScore: 0,
        flexibilityScore: 100,
        invasivenessScore: 0, // Least invasive
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is fully achievable from available unallocated cash without additional monthly burden.",
      };
    }

    const additionalMonthlyRequired = Math.ceil(gap.netFundingGap / months);
    const totalMonthlyRequired = ctx.goal.monthlyContribution + additionalMonthlyRequired;
    const capacity = snapshot.availableGoalFundingCapacity;

    const isSurplusKnown = snapshot.monthlySurplus !== null;
    const isAffordable = isSurplusKnown && additionalMonthlyRequired <= capacity;
    const reasonCodes: string[] = [];

    if (!isSurplusKnown) {
      reasonCodes.push("INSUFFICIENT_DATA", "REQUIRES_USER_ASSUMPTION");
    } else if (!isAffordable) {
      reasonCodes.push("INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS");
    } else {
      reasonCodes.push("AFFORDABLE_MONTHLY_SAVING");
    }

    const feasibilityStatus = isAffordable
      ? "FEASIBLE"
      : !isSurplusKnown
      ? "REQUIRES_ASSUMPTION"
      : "INFEASIBLE";

    // Capital preservation: low = base = high = guaranteed principal savings
    const projectedFunding = gap.availableFundingCash + (totalMonthlyRequired * months);

    return {
      strategyType: "SAVE",
      name: "Increase Monthly Savings",
      feasible: isAffordable,
      feasibilityStatus,
      requiresUserAssumption: !isSurplusKnown,
      monthlyRequired: additionalMonthlyRequired,
      projectedLow: projectedFunding,
      projectedBase: projectedFunding,
      projectedHigh: projectedFunding,
      totalCost: 0, // No interest or transaction fees
      liquidityScore: 95,
      riskScore: 0, // Pure savings has 0 market risk
      flexibilityScore: 90, // Can be paused or adjusted anytime
      invasivenessScore: 15, // Very low invasiveness
      reasonCodes,
      explanation: isAffordable
        ? `Save an additional ₹${additionalMonthlyRequired.toLocaleString("en-IN")}/month from your available surplus of ₹${capacity.toLocaleString("en-IN")}/month for ${months} months to close the gap.`
        : !isSurplusKnown
        ? `Requires saving ₹${additionalMonthlyRequired.toLocaleString("en-IN")}/month for ${months} months. Affordability cannot be verified because monthly income/expenses are unknown.`
        : `Requires ₹${additionalMonthlyRequired.toLocaleString("en-IN")}/month which exceeds your available monthly surplus of ₹${capacity.toLocaleString("en-IN")}/month.`,
      subBreakdown: {
        additionalMonthlyRequired,
        totalMonthlyRequired,
        availableCapacity: capacity,
        monthsRemaining: months,
      },
    };
  }
}
