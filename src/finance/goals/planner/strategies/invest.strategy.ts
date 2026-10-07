import { StrategyContext, StrategyResult } from "./strategy.interface";

export class InvestStrategy {
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
        strategyType: "INVEST",
        name: "Market Investment Strategy",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 70,
        riskScore: 30,
        flexibilityScore: 85,
        invasivenessScore: 35,
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded.",
      };
    }

    const lowRate = assumptions.investmentLow;
    const baseRate = assumptions.investmentBase;
    const highRate = assumptions.investmentHigh;

    const monthlyRequired = this.calculateRequiredMonthly(gap.netFundingGap, baseRate, months);
    const capacity = snapshot.availableGoalFundingCapacity;
    const isSurplusKnown = snapshot.monthlySurplus !== null;
    const isAffordable = isSurplusKnown && monthlyRequired <= capacity;

    const fvLow = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, lowRate, months));
    const fvBase = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, baseRate, months));
    const fvHigh = Math.round(gap.availableFundingCash + this.calculateFutureValue(monthlyRequired, highRate, months));

    const reasonCodes: string[] = [];

    // Horizon Risk Constraint:
    const isShortHorizon = months < 24;
    let feasible = isAffordable;

    if (isShortHorizon) {
      reasonCodes.push("SHORT_HORIZON_VOLATILITY_RISK");
      if (months < 12) {
        feasible = false;
        reasonCodes.push("HORIZON_TOO_SHORT_FOR_INVESTMENTS", "GOAL_DATE_TOO_SHORT");
      }
    }

    if (!isSurplusKnown) {
      reasonCodes.push("INSUFFICIENT_DATA", "REQUIRES_USER_ASSUMPTION");
    } else if (!isAffordable) {
      reasonCodes.push("INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS");
    } else if (feasible) {
      reasonCodes.push("AFFORDABLE_INVESTMENT_SIP", "COMPOUNDING_BENEFIT");
    }

    const feasibilityStatus = feasible
      ? "FEASIBLE"
      : !isSurplusKnown
      ? "REQUIRES_ASSUMPTION"
      : "INFEASIBLE";

    return {
      strategyType: "INVEST",
      name: "Systematic Investment Strategy (Advisory Simulation)",
      feasible,
      feasibilityStatus,
      requiresUserAssumption: !isSurplusKnown,
      monthlyRequired,
      projectedLow: fvLow,
      projectedBase: fvBase,
      projectedHigh: fvHigh,
      totalCost: 0,
      liquidityScore: 70,
      riskScore: isShortHorizon ? 75 : 45,
      flexibilityScore: 85,
      invasivenessScore: 35,
      reasonCodes,
      explanation: feasible
        ? `Invest ₹${monthlyRequired.toLocaleString("en-IN")}/month at ${baseRate}% base estimate (${lowRate}%-${highRate}% range). Projected: Low ₹${fvLow.toLocaleString("en-IN")}, Base ₹${fvBase.toLocaleString("en-IN")}, High ₹${fvHigh.toLocaleString("en-IN")}. Returns are subject to market risks.`
        : isShortHorizon && months < 12
        ? `Goal horizon of ${months} months is too short for volatile market investments. Capital preservation is recommended.`
        : !isSurplusKnown
        ? `Invest ₹${monthlyRequired.toLocaleString("en-IN")}/month at ${baseRate}% estimate. Affordability cannot be verified because monthly income/expenses are unknown.`
        : `Requires ₹${monthlyRequired.toLocaleString("en-IN")}/month which exceeds available monthly surplus of ₹${capacity.toLocaleString("en-IN")}/month.`,
      subBreakdown: {
        rates: { low: lowRate, base: baseRate, high: highRate },
        isShortHorizon,
        monthlyRequired,
        disclaimer: "Market investments carry market risks. Past returns are not guaranteed.",
      },
    };
  }
}
