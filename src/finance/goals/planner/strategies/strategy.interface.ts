export type StrategyType =
  | "SAVE"
  | "FIXED_INCOME"
  | "INVEST"
  | "SELL_ASSET"
  | "EXTEND_DEADLINE"
  | "RAISE_INCOME"
  | "BORROW"
  | "COMBINATION";

export type FinancialValueSource =
  | "ACTUAL"
  | "DERIVED"
  | "USER_ASSUMED"
  | "UNKNOWN";

export type StrategyFeasibilityStatus =
  | "FEASIBLE"
  | "REQUIRES_ASSUMPTION"
  | "INFEASIBLE";

export interface StrategyResult {
  strategyType: StrategyType;
  name: string;
  feasible: boolean;
  feasibilityStatus: StrategyFeasibilityStatus;
  requiresUserAssumption?: boolean;
  monthlyRequired: number;
  projectedLow: number;
  projectedBase: number;
  projectedHigh: number;
  totalCost: number;
  liquidityScore: number;    // 0-100 (100 = completely liquid cash)
  riskScore: number;         // 0-100 (0 = zero risk, 100 = high equity risk)
  flexibilityScore: number;  // 0-100 (100 = can adjust or stop anytime)
  invasivenessScore: number; // 0-100 (lower is less invasive)
  reasonCodes: string[];
  explanation: string;
  subBreakdown?: Record<string, any>;
}

export interface StrategyContext {
  goal: {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: Date;
    priority: "HIGH" | "MEDIUM" | "LOW";
    deadlineFlexibility: "STRICT" | "MODERATE" | "FLEXIBLE";
    monthlyContribution: number;
  };
  snapshot: FinancialSnapshot;
  gap: {
    initialTarget: number;
    availableFundingCash: number;
    projectedOwnSavings: number;
    netFundingGap: number;
    monthsRemaining: number;
    isFullyFunded: boolean;
  };
  assumptions: FundingAssumptionConfig;
}

export interface FinancialSnapshot {
  householdId: string;
  calculatedAt: string;
  totalCash: number;
  cashSource: FinancialValueSource;
  emergencyReserveMonths: number;
  emergencyReserveAmount: number | null;
  emergencyReserveSource: FinancialValueSource;
  earmarkedCash: number;
  restrictedCash: number;
  availableFundingCash: number;

  monthlyIncome: number | null;
  monthlyIncomeSource: FinancialValueSource;
  monthlyEssentialExpenses: number | null;
  monthlyEssentialExpenseSource: FinancialValueSource;
  monthlyTotalExpenses: number | null;
  monthlyExpenseSource: FinancialValueSource;
  existingEmiObligations: number;
  monthlySurplus: number | null; // monthlyIncome - monthlyTotalExpenses - existingEmiObligations (null if income/expense unknown)

  higherPriorityGoalMonthlyCommitments: number;
  availableGoalFundingCapacity: number; // monthlySurplus - higherPriorityGoalMonthlyCommitments (0 if surplus unknown)

  existingInvestmentsValue: number;
  investmentSource: FinancialValueSource;
  eligibleAssets: Array<{
    id: string;
    name: string;
    category: string;
    currentValue: number;
    fundingEligibility: "NOT_ELIGIBLE" | "OPTIONAL" | "ELIGIBLE";
  }>;
  totalEligibleAssetValue: number;
  assetSource: FinancialValueSource;

  existingBorrowings: Array<{
    id: string;
    name: string;
    outstandingPrincipal: number;
    interestRate: number;
  }>;
  totalOutstandingBorrowings: number;
  borrowingSource: FinancialValueSource;
}

export interface FundingAssumptionConfig {
  version: number;
  fixedIncomeLow: number;     // e.g. 5.0%
  fixedIncomeBase: number;    // e.g. 6.5%
  fixedIncomeHigh: number;    // e.g. 7.5%
  investmentLow: number;     // e.g. 7.0%
  investmentBase: number;    // e.g. 11.0%
  investmentHigh: number;    // e.g. 14.0%
  emergencyReserveMonths: number; // e.g. 6
  maxDebtServiceRatio: number;   // e.g. 0.35 (35%)
  borrowingAnnualInterestRate: number | null; // e.g. 10.5%, null if UNKNOWN
  borrowingRateSource: "CONFIGURED" | "USER_ASSUMED" | "BORROWING_PRODUCT_ASSUMPTION" | "UNKNOWN";
  essentialExpenseRatio?: number | null; // If configured by user/system, otherwise null
}
