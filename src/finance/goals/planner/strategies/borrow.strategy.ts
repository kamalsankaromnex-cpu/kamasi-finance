import { StrategyContext, StrategyResult } from "./strategy.interface";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";

export class BorrowStrategy {
  /**
   * Evaluates debt funding using certified Borrowing domain services.
   * Consumes:
   * 1. BorrowingService.calculateScenario (rate from assumptions or borrowing product, no hardcoded rates)
   * 2. BorrowingService.calculateAffordability (debt service ratio & affordability owned by Borrowing domain)
   * Zero mutation: Pure simulation only.
   */
  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap, snapshot, assumptions } = ctx;
    const months = gap.monthsRemaining;

    if (gap.isFullyFunded) {
      return {
        strategyType: "BORROW",
        name: "Borrowing / Loan Strategy",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 40,
        riskScore: 70,
        flexibilityScore: 30,
        invasivenessScore: 85,
        reasonCodes: ["GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded. Borrowing is unnecessary.",
      };
    }

    const principal = gap.netFundingGap;
    const tenureMonths = Math.min(60, Math.max(12, months));

    // Request borrowing scenario from Borrowing domain
    const scenario = BorrowingService.calculateScenario({
      principal,
      tenureMonths,
      annualInterestRate: assumptions.borrowingAnnualInterestRate,
      rateSource: assumptions.borrowingRateSource,
      assumptionVersion: assumptions.version,
    });

    // Check if interest rate is unknown
    if (scenario.requiresRateAssumption || scenario.annualInterestRate === null || scenario.emi === null) {
      return {
        strategyType: "BORROW",
        name: "Borrowing / Loan Option (Simulation)",
        feasible: false,
        feasibilityStatus: "REQUIRES_ASSUMPTION",
        requiresUserAssumption: true,
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 40,
        riskScore: 70,
        flexibilityScore: 30,
        invasivenessScore: 85,
        reasonCodes: ["BORROWING_RATE_REQUIRED", "REQUIRES_USER_ASSUMPTION"],
        explanation: "Borrowing strategy requires an interest rate assumption. Enter an assumed rate in assumptions to simulate loan options.",
        subBreakdown: {
          principalAmount: principal,
          tenureMonths,
          requiresRateAssumption: true,
        },
      };
    }

    const emi = scenario.emi;
    const totalRepayment = scenario.totalRepayment || (emi * tenureMonths);
    const estimatedInterestCost = scenario.totalInterest || Math.max(0, totalRepayment - principal);

    // Debt Affordability owned by Borrowing domain
    const affordability = BorrowingService.calculateAffordability({
      householdId: snapshot.householdId,
      proposedEmi: emi,
      existingEmis: snapshot.existingEmiObligations,
      verifiedIncome: snapshot.monthlyIncome,
      verifiedExpenses: snapshot.monthlyTotalExpenses,
      maxDebtServiceRatio: assumptions.maxDebtServiceRatio,
    });

    const isAffordable = affordability.affordable;
    const isDataRequired = affordability.affordabilityStatus === "UNKNOWN";

    const reasonCodes = [...affordability.reasonCodes];

    let feasibilityStatus: "FEASIBLE" | "REQUIRES_ASSUMPTION" | "INFEASIBLE" = "INFEASIBLE";
    if (isAffordable) {
      feasibilityStatus = "FEASIBLE";
    } else if (isDataRequired) {
      feasibilityStatus = "REQUIRES_ASSUMPTION";
    }

    const projectedFunding = gap.availableFundingCash + principal;

    return {
      strategyType: "BORROW",
      name: "Borrowing / Loan Option (Simulation)",
      feasible: isAffordable,
      feasibilityStatus,
      requiresUserAssumption: isDataRequired,
      monthlyRequired: emi,
      projectedLow: projectedFunding,
      projectedBase: projectedFunding,
      projectedHigh: projectedFunding,
      totalCost: estimatedInterestCost,
      liquidityScore: 40,
      riskScore: 70,
      flexibilityScore: 30,
      invasivenessScore: 85,
      reasonCodes,
      explanation: isAffordable
        ? `A loan of ₹${principal.toLocaleString("en-IN")} at ${scenario.annualInterestRate}% for ${tenureMonths} months requires an EMI of ₹${emi.toLocaleString("en-IN")}/month (total interest: ₹${estimatedInterestCost.toLocaleString("en-IN")}). Fits within your verified debt service capacity.`
        : isDataRequired
        ? `A loan of ₹${principal.toLocaleString("en-IN")} at ${scenario.annualInterestRate}% requires an EMI of ₹${emi.toLocaleString("en-IN")}/month. Affordability cannot be verified because monthly income is unknown.`
        : `Required loan EMI of ₹${emi.toLocaleString("en-IN")}/month exceeds your safe debt service capacity.`,
      subBreakdown: {
        principalAmount: principal,
        interestRate: scenario.annualInterestRate,
        rateSource: scenario.source,
        tenureMonths,
        monthlyEmi: emi,
        estimatedInterestCost,
        totalRepayment,
        affordability,
      },
    };
  }
}
