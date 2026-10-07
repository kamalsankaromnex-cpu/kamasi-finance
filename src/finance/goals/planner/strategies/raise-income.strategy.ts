import { StrategyContext, StrategyResult } from "./strategy.interface";

export class RaiseIncomeStrategy {
  /**
   * Informational calculation of additional monthly income required to bridge the goal gap.
   */
  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap } = ctx;
    const months = gap.monthsRemaining;

    if (gap.isFullyFunded) {
      return {
        strategyType: "RAISE_INCOME",
        name: "Income Enhancement",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 90,
        riskScore: 20,
        flexibilityScore: 70,
        invasivenessScore: 40,
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded without additional income.",
      };
    }

    const additionalIncomeRequired = Math.ceil(gap.netFundingGap / months);

    return {
      strategyType: "RAISE_INCOME",
      name: "Increase Monthly Income (Informational)",
      feasible: true, // Informational reference benchmark
      feasibilityStatus: "FEASIBLE",
      monthlyRequired: additionalIncomeRequired,
      projectedLow: gap.initialTarget,
      projectedBase: gap.initialTarget,
      projectedHigh: gap.initialTarget,
      totalCost: 0,
      liquidityScore: 95,
      riskScore: 10,
      flexibilityScore: 70,
      invasivenessScore: 40,
      reasonCodes: ["INFORMATIONAL_BENCHMARK"],
      explanation: `Earning an extra ₹${additionalIncomeRequired.toLocaleString("en-IN")}/month (via salary appraisal, side business, or freelance consulting) for ${months} months would completely bridge the funding gap without reducing household living standards.`,
      subBreakdown: {
        additionalIncomeRequired,
        monthsRemaining: months,
      },
    };
  }
}
