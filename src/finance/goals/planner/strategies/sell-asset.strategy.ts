import { StrategyContext, StrategyResult } from "./strategy.interface";

export class SellAssetStrategy {
  /**
   * Evaluates partial/full allocation of eligible non-essential assets.
   * Only assets with fundingEligibility = 'ELIGIBLE' or 'OPTIONAL' are considered.
   * Hard Constraint: 'NOT_ELIGIBLE' assets (e.g. primary residence) are strictly excluded.
   * Zero execution: This is purely a planning simulation.
   */
  public static evaluate(ctx: StrategyContext): StrategyResult {
    const { gap, snapshot } = ctx;

    if (gap.isFullyFunded) {
      return {
        strategyType: "SELL_ASSET",
        name: "Asset Allocation Strategy",
        feasible: true,
        feasibilityStatus: "FEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.initialTarget,
        projectedBase: gap.initialTarget,
        projectedHigh: gap.initialTarget,
        totalCost: 0,
        liquidityScore: 60,
        riskScore: 20,
        flexibilityScore: 50,
        invasivenessScore: 50,
        reasonCodes: ["NO_FUNDING_GAP", "GOAL_FULLY_FUNDED"],
        explanation: "Goal is already fully funded.",
      };
    }

    const eligibleAssets = snapshot.eligibleAssets.filter(
      (a) => a.fundingEligibility === "ELIGIBLE" || a.fundingEligibility === "OPTIONAL"
    );

    const totalEligibleValue = eligibleAssets.reduce((sum, a) => sum + a.currentValue, 0);
    const reasonCodes: string[] = [];

    if (eligibleAssets.length === 0 || totalEligibleValue <= 0) {
      reasonCodes.push("ASSET_NOT_ELIGIBLE", "NO_ELIGIBLE_ASSETS_AVAILABLE");
      return {
        strategyType: "SELL_ASSET",
        name: "Asset Allocation Strategy (Simulation)",
        feasible: false,
        feasibilityStatus: "INFEASIBLE",
        monthlyRequired: 0,
        projectedLow: gap.availableFundingCash,
        projectedBase: gap.availableFundingCash,
        projectedHigh: gap.availableFundingCash,
        totalCost: 0,
        liquidityScore: 40,
        riskScore: 15,
        flexibilityScore: 30,
        invasivenessScore: 50,
        reasonCodes,
        explanation: "No assets are marked as eligible or optional for goal funding reallocation.",
      };
    }

    const allocatedAssetAmount = Math.min(gap.netFundingGap, totalEligibleValue);
    const remainingGapAfterAsset = Math.max(0, gap.netFundingGap - allocatedAssetAmount);
    const feasible = allocatedAssetAmount >= gap.netFundingGap;

    if (feasible) {
      reasonCodes.push("ASSET_ALLOCATION_CLOSES_GAP");
    } else {
      reasonCodes.push("PARTIAL_ASSET_ALLOCATION");
    }

    const projectedFunding = gap.availableFundingCash + allocatedAssetAmount;

    return {
      strategyType: "SELL_ASSET",
      name: "Reallocate Eligible Asset Value",
      feasible,
      feasibilityStatus: feasible ? "FEASIBLE" : "INFEASIBLE",
      monthlyRequired: 0,
      projectedLow: projectedFunding,
      projectedBase: projectedFunding,
      projectedHigh: projectedFunding,
      totalCost: 0,
      liquidityScore: 50,
      riskScore: 20,
      flexibilityScore: 40,
      invasivenessScore: 50,
      reasonCodes,
      explanation: feasible
        ? `Reallocating ₹${allocatedAssetAmount.toLocaleString("en-IN")} from eligible assets (${eligibleAssets.map((a) => a.name).join(", ")}) can fully close the gap. Note: Actual liquidation requires explicit execution in Asset management.`
        : `Allocating all eligible assets provides ₹${allocatedAssetAmount.toLocaleString("en-IN")}, leaving ₹${remainingGapAfterAsset.toLocaleString("en-IN")} unfunded.`,
      subBreakdown: {
        eligibleAssetsConsidered: eligibleAssets.map((a) => ({ id: a.id, name: a.name, value: a.currentValue })),
        allocatedAssetAmount,
        remainingGapAfterAsset,
      },
    };
  }
}
