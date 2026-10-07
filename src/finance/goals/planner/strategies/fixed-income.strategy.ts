import { StrategyContext, StrategyResult } from "./strategy.interface";

export class FixedIncomeStrategy {
  private static calculateFutureValue(monthlyP: number, annualRatePct: number, months: number): number {
    if (monthlyP <= 0 || months <= 0) return 0;
    const r = (annualRatePct / 100) / 12;
    if (r <= 0) return monthlyP * months;
    return monthlyP * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  }

  private static calculateRequiredMonthly(targetFV: number, annualRatePct: number, months: number): number {
    if (targetFV <= 0 || months <= 0) return 0;
    const r = (annualRatePct / 100) / 12;
    if (r <= 0) return Math.ceil(targetFV / months);
    const factor = ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
    return Math.ceil(targetFV / factor);
  }

  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap, snapshot, assumptions } = ctx;
    const months = gap.monthsRemaining;

    if (gap.isFullyFunded) {
      return {
        strategyType: "FIXED_INCOME",
        name: "Fixed Income (RD / Term Deposit)",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 85,
        riskScore: 10,
        flexibilityScore: 80,
        invasivenessScore: 25,
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded.",
      };
    }

    const lowRate = assumptions.fixedIncomeLow;
    const baseRate = assumptions.fixedIncomeBase;
    const highRate = assumptions.fixedIncomeHigh;

    // Base calculation
    const monthlyRequired = this.calculateRequiredMonthly(gap.netFundingGap, baseRate, months);
    const capacity = snapshot.availableGoalFundingCapacity;
    const isSurplusKnown = snapshot.monthlySurplus !== null;
    const isAffordable = isSurplusKnown && monthlyRequired <= capacity;

    const fvLow = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, lowRate, months));
    const fvBase = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, baseRate, months));
    const fvHigh = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, highRate, months));

    const totalDeposit = monthlyRequired * months;
    const estimatedInterestEarned = Math.max(0, fvBase - gap.availableFundingCash - totalDeposit);

    const reasonCodes: string[] = [];
    if (!isSurplusKnown) {
      reasonCodes.push("INSUFFICIENT_DATA", "REQUIRES_USER_ASSUMPTION");
    } else if (!isAffordable) {
      reasonCodes.push("INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS");
    } else {
      reasonCodes.push("AFFORDABLE_FIXED_INCOME", "CAPITAL_PRESERVATION");
    }

    const feasibilityStatus = isAffordable
      ? "FEASIBLE"
      : !isSurplusKnown
      ? "REQUIRES_ASSUMPTION"
      : "INFEASIBLE";

    return {
      strategyType: "FIXED_INCOME",
      name: "Fixed Income (Recurring Deposit / Term Instruments)",
      feasible: isAffordable,
      feasibilityStatus,
      requiresUserAssumption: !isSurplusKnown,
      monthlyRequired,
      projectedLow: fvLow,
      projectedBase: fvBase,
      projectedHigh: fvHigh,
      totalCost: 0,
      liquidityScore: 80,
      riskScore: 10,
      flexibilityScore: 75,
      invasivenessScore: 25,
      reasonCodes,
      explanation: isAffordable
        ? `Deposit ₹${monthlyRequired.toLocaleString("en-IN")}/month into fixed-income planning instruments (${baseRate}% base estimate). Projected total: ₹${fvBase.toLocaleString("en-IN")} (est. ₹${estimatedInterestEarned.toLocaleString("en-IN")} interest).`
        : !isSurplusKnown
        ? `Deposit ₹${monthlyRequired.toLocaleString("en-IN")}/month into fixed-income instruments. Affordability cannot be verified because monthly income/expenses are unknown.`
        : `Requires ₹${monthlyRequired.toLocaleString("en-IN")}/month in fixed income which exceeds available surplus of ₹${capacity.toLocaleString("en-IN")}/month.`,
      subBreakdown: {
        rates: { low: lowRate, base: baseRate, high: highRate },
        monthlyRequired,
        estimatedInterestEarned,
        totalDeposit,
      },
    };
  }
}
