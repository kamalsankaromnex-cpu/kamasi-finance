import { StrategyContext, StrategyResult } from "./strategies/strategy.interface";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";

export type CombinationMethod = "CONTROLLED_SCENARIO" | "OPTIMIZED";

export class CombinationEngine {
  /**
   * Generates controlled multi-strategy combinations:
   * Explicitly modeled as CONTROLLED_SCENARIO (never presented as mathematically optimal).
   * 1. SAVE + FIXED_INCOME (Conservative balanced scenario)
   * 2. SAVE + INVEST (Growth balanced scenario)
   * 3. SAVE + EXTEND_DEADLINE (Pragmatic savings scenario)
   * 4. SELL_ASSET + SAVE (Asset-assisted savings scenario)
   * 5. SAVE + BORROW (Hybrid loan scenario)
   * 6. SAVE + INVEST + BORROW (Comprehensive bridge scenario)
   */
  public static generateCombinations(
    ctx: StrategyContext,
    singleResults: Record<string, StrategyResult>
  ): StrategyResult[] {
    const combinations: StrategyResult[] = [];
    const { gap, snapshot, assumptions } = ctx;
    const months = gap.monthsRemaining;

    if (gap.isFullyFunded) return [];

    const capacity = snapshot.availableGoalFundingCapacity;
    const isSurplusKnown = snapshot.monthlySurplus !== null;

    // 1. SAVE + FIXED_INCOME (Controlled baseline: 50% savings + 50% fixed-income deposit)
    const halfGap = Math.round(gap.netFundingGap / 2);
    const saveHalfMonthly = Math.ceil(halfGap / months);
    const rFI = (assumptions.fixedIncomeBase / 100) / 12;
    const factorFI = ((Math.pow(1 + rFI, months) - 1) / rFI) * (1 + rFI);
    const fiHalfMonthly = Math.ceil(halfGap / factorFI);
    const combo1Monthly = saveHalfMonthly + fiHalfMonthly;
    const combo1Feasible = isSurplusKnown && combo1Monthly <= capacity;

    const fvFIHalf = Math.round(fiHalfMonthly * factorFI);
    const combo1Projected = gap.availableFundingCash + (saveHalfMonthly * months) + fvFIHalf;

    const combo1ReasonCodes = !isSurplusKnown
      ? ["INSUFFICIENT_DATA", "REQUIRES_USER_ASSUMPTION"]
      : combo1Feasible
      ? ["BALANCED_CONSERVATIVE_PLAN"]
      : ["INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS"];

    combinations.push({
      strategyType: "COMBINATION",
      name: "Save + Fixed Income (Conservative Scenario)",
      feasible: combo1Feasible,
      feasibilityStatus: combo1Feasible ? "FEASIBLE" : !isSurplusKnown ? "REQUIRES_ASSUMPTION" : "INFEASIBLE",
      requiresUserAssumption: !isSurplusKnown,
      monthlyRequired: combo1Monthly,
      projectedLow: combo1Projected - Math.round(fvFIHalf * 0.02),
      projectedBase: combo1Projected,
      projectedHigh: combo1Projected + Math.round(fvFIHalf * 0.02),
      totalCost: 0,
      liquidityScore: 90,
      riskScore: 5,
      flexibilityScore: 85,
      invasivenessScore: 20,
      reasonCodes: combo1ReasonCodes,
      explanation: combo1Feasible
        ? `Deterministic controlled scenario: Combine ₹${saveHalfMonthly.toLocaleString("en-IN")}/mo in pure savings (50%) and ₹${fiHalfMonthly.toLocaleString("en-IN")}/mo in fixed income (50% at ${assumptions.fixedIncomeBase}%). Total ₹${combo1Monthly.toLocaleString("en-IN")}/month fits within available surplus.`
        : !isSurplusKnown
        ? `Save + Fixed Income controlled scenario requires ₹${combo1Monthly.toLocaleString("en-IN")}/mo. Affordability cannot be verified because monthly surplus is unknown.`
        : `Save + Fixed Income combination requires ₹${combo1Monthly.toLocaleString("en-IN")}/mo, exceeding available surplus of ₹${capacity.toLocaleString("en-IN")}/mo.`,
      subBreakdown: {
        method: "CONTROLLED_SCENARIO" as CombinationMethod,
        allocation: { SAVE: 0.5, FIXED_INCOME: 0.5 },
        components: [
          { type: "SAVE", monthly: saveHalfMonthly, contribution: saveHalfMonthly * months },
          { type: "FIXED_INCOME", monthly: fiHalfMonthly, projected: fvFIHalf },
        ],
      },
    });

    // 2. SAVE + INVEST (Controlled baseline: 50% savings + 50% Systematic Investment)
    const rInv = (assumptions.investmentBase / 100) / 12;
    const factorInv = ((Math.pow(1 + rInv, months) - 1) / rInv) * (1 + rInv);
    const invHalfMonthly = Math.ceil(halfGap / factorInv);
    const combo2Monthly = saveHalfMonthly + invHalfMonthly;
    const combo2Feasible = isSurplusKnown && combo2Monthly <= capacity && months >= 12;

    const fvInvHalf = Math.round(invHalfMonthly * factorInv);
    const combo2Projected = gap.availableFundingCash + (saveHalfMonthly * months) + fvInvHalf;

    const combo2ReasonCodes = !isSurplusKnown
      ? ["INSUFFICIENT_DATA", "REQUIRES_USER_ASSUMPTION"]
      : combo2Feasible
      ? ["BALANCED_GROWTH_PLAN"]
      : months < 12
      ? ["GOAL_DATE_TOO_SHORT"]
      : ["INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS"];

    combinations.push({
      strategyType: "COMBINATION",
      name: "Save + Invest (Growth Scenario)",
      feasible: combo2Feasible,
      feasibilityStatus: combo2Feasible ? "FEASIBLE" : !isSurplusKnown ? "REQUIRES_ASSUMPTION" : "INFEASIBLE",
      requiresUserAssumption: !isSurplusKnown,
      monthlyRequired: combo2Monthly,
      projectedLow: Math.round(combo2Projected - (fvInvHalf * 0.15)),
      projectedBase: combo2Projected,
      projectedHigh: Math.round(combo2Projected + (fvInvHalf * 0.20)),
      totalCost: 0,
      liquidityScore: 80,
      riskScore: months < 24 ? 50 : 30,
      flexibilityScore: 85,
      invasivenessScore: 25,
      reasonCodes: combo2ReasonCodes,
      explanation: combo2Feasible
        ? `Deterministic controlled scenario: Blend ₹${saveHalfMonthly.toLocaleString("en-IN")}/mo cash savings (50%) + ₹${invHalfMonthly.toLocaleString("en-IN")}/mo systematic investing (50%). Total ₹${combo2Monthly.toLocaleString("en-IN")}/month fits within surplus.`
        : !isSurplusKnown
        ? `Save + Invest controlled scenario requires ₹${combo2Monthly.toLocaleString("en-IN")}/mo. Affordability cannot be verified because monthly surplus is unknown.`
        : `Requires ₹${combo2Monthly.toLocaleString("en-IN")}/month, exceeding available capacity of ₹${capacity.toLocaleString("en-IN")}/month.`,
      subBreakdown: {
        method: "CONTROLLED_SCENARIO" as CombinationMethod,
        allocation: { SAVE: 0.5, INVEST: 0.5 },
        components: [
          { type: "SAVE", monthly: saveHalfMonthly, contribution: saveHalfMonthly * months },
          { type: "INVEST", monthly: invHalfMonthly, projected: fvInvHalf },
        ],
      },
    });

    // 3. SAVE + EXTEND_DEADLINE (Save affordable surplus + extend remaining deadline)
    if (capacity > 0 && ctx.goal.deadlineFlexibility !== "STRICT") {
      const affordableSaveMonthly = Math.min(capacity, Math.ceil(gap.netFundingGap / months));
      const fundingOverOriginalMonths = affordableSaveMonthly * months;
      const remainingGapAfterSavings = Math.max(0, gap.netFundingGap - fundingOverOriginalMonths);
      const extraMonths = affordableSaveMonthly > 0 ? Math.ceil(remainingGapAfterSavings / affordableSaveMonthly) : 0;
      const combo3Feasible = extraMonths > 0 && extraMonths <= 48;

      if (combo3Feasible) {
        const extDate = new Date(ctx.goal.targetDate);
        extDate.setMonth(extDate.getMonth() + extraMonths);

        combinations.push({
          strategyType: "COMBINATION",
          name: "Save + Extend Deadline (Pragmatic Scenario)",
          feasible: true,
          feasibilityStatus: "FEASIBLE",
          monthlyRequired: affordableSaveMonthly,
          projectedLow: gap.initialTarget,
          projectedBase: gap.initialTarget,
          projectedHigh: gap.initialTarget,
          totalCost: 0,
          liquidityScore: 90,
          riskScore: 0,
          flexibilityScore: 75,
          invasivenessScore: 40,
          reasonCodes: ["AFFORDABLE_SURPLUS_WITH_TIMELINE_BUFFER"],
          explanation: `Controlled scenario: Save comfortably at ₹${affordableSaveMonthly.toLocaleString("en-IN")}/month and extend deadline by ${extraMonths} months (new date: ${extDate.getFullYear()}-${String(extDate.getMonth() + 1).padStart(2, "0")}).`,
          subBreakdown: {
            method: "CONTROLLED_SCENARIO" as CombinationMethod,
            monthlyRate: affordableSaveMonthly,
            additionalMonths: extraMonths,
            newTargetDate: extDate.toISOString().split("T")[0],
          },
        });
      }
    }

    // 4. SELL_ASSET + SAVE (Allocate available asset + save remaining)
    const assetRes = singleResults["SELL_ASSET"];
    if (assetRes && assetRes.subBreakdown && (assetRes.subBreakdown.allocatedAssetAmount as number) > 0) {
      const assetAlloc = assetRes.subBreakdown.allocatedAssetAmount as number;
      const remainingAfterAsset = Math.max(0, gap.netFundingGap - assetAlloc);
      const monthlyToCoverRemaining = Math.ceil(remainingAfterAsset / months);
      const combo4Feasible = isSurplusKnown && monthlyToCoverRemaining <= capacity && remainingAfterAsset > 0;

      if (combo4Feasible) {
        combinations.push({
          strategyType: "COMBINATION",
          name: "Eligible Asset Allocation + Monthly Savings",
          feasible: true,
          feasibilityStatus: "FEASIBLE",
          monthlyRequired: monthlyToCoverRemaining,
          projectedLow: gap.initialTarget,
          projectedBase: gap.initialTarget,
          projectedHigh: gap.initialTarget,
          totalCost: 0,
          liquidityScore: 65,
          riskScore: 10,
          flexibilityScore: 60,
          invasivenessScore: 45,
          reasonCodes: ["ASSET_ASSISTED_SAVINGS"],
          explanation: `Controlled scenario: Reallocate ₹${assetAlloc.toLocaleString("en-IN")} from eligible assets and save ₹${monthlyToCoverRemaining.toLocaleString("en-IN")}/month for ${months} months to bridge the remaining balance.`,
          subBreakdown: {
            method: "CONTROLLED_SCENARIO" as CombinationMethod,
            assetAllocation: assetAlloc,
            monthlySaving: monthlyToCoverRemaining,
          },
        });
      }
    }

    // 5. SAVE + BORROW (Controlled baseline: Save 60% + Borrow 40%)
    const borrowGapPortion = Math.round(gap.netFundingGap * 0.40);
    const saveGapPortion = gap.netFundingGap - borrowGapPortion;
    const savePartMonthly = Math.ceil(saveGapPortion / months);
    const loanTenure = Math.min(60, Math.max(12, months));

    const borrowScenario = BorrowingService.calculateScenario({
      principal: borrowGapPortion,
      tenureMonths: loanTenure,
      annualInterestRate: assumptions.borrowingAnnualInterestRate,
      rateSource: assumptions.borrowingRateSource,
      assumptionVersion: assumptions.version,
    });

    const isBorrowRateKnown = !borrowScenario.requiresRateAssumption && borrowScenario.emi !== null;
    const emiPart = borrowScenario.emi || 0;
    const estimatedInterest = borrowScenario.totalInterest || 0;

    let combo5Feasible = false;
    let combo5Status: "FEASIBLE" | "REQUIRES_ASSUMPTION" | "INFEASIBLE" = "INFEASIBLE";
    const combo5ReasonCodes: string[] = [];

    if (!isBorrowRateKnown) {
      combo5Status = "REQUIRES_ASSUMPTION";
      combo5ReasonCodes.push("BORROWING_RATE_REQUIRED", "REQUIRES_USER_ASSUMPTION");
    } else if (!isSurplusKnown || snapshot.monthlyIncome === null) {
      combo5Status = "REQUIRES_ASSUMPTION";
      combo5ReasonCodes.push("BORROWING_AFFORDABILITY_DATA_REQUIRED", "REQUIRES_USER_ASSUMPTION");
    } else {
      const affordability = BorrowingService.calculateAffordability({
        householdId: snapshot.householdId,
        proposedEmi: emiPart,
        existingEmis: snapshot.existingEmiObligations,
        verifiedIncome: snapshot.monthlyIncome,
        verifiedExpenses: snapshot.monthlyTotalExpenses,
        maxDebtServiceRatio: assumptions.maxDebtServiceRatio,
      });

      const isSaveAffordable = savePartMonthly <= capacity;
      combo5Feasible = isSaveAffordable && affordability.affordable;
      combo5Status = combo5Feasible ? "FEASIBLE" : "INFEASIBLE";

      if (combo5Feasible) {
        combo5ReasonCodes.push("HYBRID_SAVINGS_AND_LOAN");
      } else {
        combo5ReasonCodes.push("DEBT_BURDEN_RESTRICTION", "INSUFFICIENT_MONTHLY_SURPLUS");
      }
    }

    combinations.push({
      strategyType: "COMBINATION",
      name: "Save + Moderate Borrowing (Hybrid Loan Scenario)",
      feasible: combo5Feasible,
      feasibilityStatus: combo5Status,
      requiresUserAssumption: combo5Status === "REQUIRES_ASSUMPTION",
      monthlyRequired: savePartMonthly,
      projectedLow: gap.initialTarget,
      projectedBase: gap.initialTarget,
      projectedHigh: gap.initialTarget,
      totalCost: estimatedInterest,
      liquidityScore: 60,
      riskScore: 50,
      flexibilityScore: 50,
      invasivenessScore: 65,
      reasonCodes: combo5ReasonCodes,
      explanation: combo5Feasible
        ? `Deterministic controlled scenario: Save ₹${savePartMonthly.toLocaleString("en-IN")}/month to cover 60% of the gap, and bridge 40% with a ₹${borrowGapPortion.toLocaleString("en-IN")} loan (EMI ₹${emiPart.toLocaleString("en-IN")}/month at ${borrowScenario.annualInterestRate}%).`
        : combo5Status === "REQUIRES_ASSUMPTION"
        ? `Controlled scenario: Save 60% + Borrow 40% (₹${borrowGapPortion.toLocaleString("en-IN")}). Requires interest rate or verified income assumption to confirm affordability.`
        : `Hybrid borrow combination exceeds debt service affordability capacity.`,
      subBreakdown: {
        method: "CONTROLLED_SCENARIO" as CombinationMethod,
        allocation: { SAVE: 0.6, BORROW: 0.4 },
        savingsPortion: saveGapPortion,
        borrowingPortion: borrowGapPortion,
        monthlySaving: savePartMonthly,
        monthlyEmi: emiPart,
        estimatedInterest,
      },
    });

    // 6. SAVE + INVEST + BORROW (Controlled baseline: Save 40%, Invest 40%, Borrow 20%)
    if (months >= 18) {
      const borrowPortion20 = Math.round(gap.netFundingGap * 0.20);
      const investPortion40 = Math.round(gap.netFundingGap * 0.40);
      const savePortion40 = gap.netFundingGap - borrowPortion20 - investPortion40;

      const saveM = Math.ceil(savePortion40 / months);
      const invM = Math.ceil(investPortion40 / factorInv);
      const combo6Monthly = saveM + invM;

      const bScenario20 = BorrowingService.calculateScenario({
        principal: borrowPortion20,
        tenureMonths: loanTenure,
        annualInterestRate: assumptions.borrowingAnnualInterestRate,
        rateSource: assumptions.borrowingRateSource,
        assumptionVersion: assumptions.version,
      });

      const isRateKnown20 = !bScenario20.requiresRateAssumption && bScenario20.emi !== null;
      const emi20 = bScenario20.emi || 0;
      const estInterest20 = bScenario20.totalInterest || 0;

      let combo6Feasible = false;
      let combo6Status: "FEASIBLE" | "REQUIRES_ASSUMPTION" | "INFEASIBLE" = "INFEASIBLE";
      const combo6ReasonCodes: string[] = [];

      if (!isRateKnown20) {
        combo6Status = "REQUIRES_ASSUMPTION";
        combo6ReasonCodes.push("BORROWING_RATE_REQUIRED", "REQUIRES_USER_ASSUMPTION");
      } else if (!isSurplusKnown || snapshot.monthlyIncome === null) {
        combo6Status = "REQUIRES_ASSUMPTION";
        combo6ReasonCodes.push("BORROWING_AFFORDABILITY_DATA_REQUIRED", "REQUIRES_USER_ASSUMPTION");
      } else {
        const affordability20 = BorrowingService.calculateAffordability({
          householdId: snapshot.householdId,
          proposedEmi: emi20,
          existingEmis: snapshot.existingEmiObligations,
          verifiedIncome: snapshot.monthlyIncome,
          verifiedExpenses: snapshot.monthlyTotalExpenses,
          maxDebtServiceRatio: assumptions.maxDebtServiceRatio,
        });

        const isSaveInvAffordable = combo6Monthly <= capacity;
        combo6Feasible = isSaveInvAffordable && affordability20.affordable;
        combo6Status = combo6Feasible ? "FEASIBLE" : "INFEASIBLE";

        if (combo6Feasible) {
          combo6ReasonCodes.push("MULTI_PILLAR_FUNDING_PLAN");
        } else {
          combo6ReasonCodes.push("INSUFFICIENT_MONTHLY_SURPLUS", "EXCEEDS_AFFORDABLE_SURPLUS");
        }
      }

      combinations.push({
        strategyType: "COMBINATION",
        name: "Save + Invest + Small Loan (Bridge Scenario)",
        feasible: combo6Feasible,
        feasibilityStatus: combo6Status,
        requiresUserAssumption: combo6Status === "REQUIRES_ASSUMPTION",
        monthlyRequired: combo6Monthly,
        projectedLow: Math.round(gap.initialTarget * 0.95),
        projectedBase: gap.initialTarget,
        projectedHigh: Math.round(gap.initialTarget * 1.05),
        totalCost: estInterest20,
        liquidityScore: 65,
        riskScore: 40,
        flexibilityScore: 60,
        invasivenessScore: 55,
        reasonCodes: combo6ReasonCodes,
        explanation: combo6Feasible
          ? `Controlled scenario: ₹${saveM.toLocaleString("en-IN")}/mo savings (40%) + ₹${invM.toLocaleString("en-IN")}/mo investing (40%) + small ₹${borrowPortion20.toLocaleString("en-IN")} loan (20%, EMI ₹${emi20.toLocaleString("en-IN")}/mo).`
          : combo6Status === "REQUIRES_ASSUMPTION"
          ? `Controlled scenario: Save 40% + Invest 40% + Borrow 20%. Requires interest rate or verified income assumption.`
          : `Multi-pillar combination exceeds monthly capacity.`,
        subBreakdown: {
          method: "CONTROLLED_SCENARIO" as CombinationMethod,
          allocation: { SAVE: 0.4, INVEST: 0.4, BORROW: 0.2 },
          saveMonthly: saveM,
          investMonthly: invM,
          borrowEmi: emi20,
        },
      });
    }

    return combinations;
  }
}
