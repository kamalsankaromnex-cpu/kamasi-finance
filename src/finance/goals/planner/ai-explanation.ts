import { RankedStrategy } from "./ranker";
import { FinancialSnapshot, FundingAssumptionConfig } from "./strategies/strategy.interface";

/**
 * AI Plan Explanation Generator with Strict Financial Number Validation
 *
 * Requirements:
 * 1. AI explains only structured planner JSON. AI must NOT calculate financial numbers.
 * 2. Every single number appearing in the generated explanation text must be verified against
 *    the allowed numbers whitelist derived directly from the deterministic plan and snapshot.
 * 3. If any unverified number appears, reject the AI output and fallback cleanly to deterministic text.
 */
export class AiPlanExplanationService {
  /**
   * Builds the comprehensive set of allowed numbers from the plan, snapshot, and assumptions.
   */
  public static buildAllowedNumbersWhitelist(
    strategy: RankedStrategy,
    snapshot: FinancialSnapshot,
    assumptions: FundingAssumptionConfig,
    gap: {
      initialTarget: number;
      availableFundingCash: number;
      projectedOwnSavings: number;
      netFundingGap: number;
      monthsRemaining: number;
    }
  ): Set<number> {
    const numbers = new Set<number>();

    // Core financial figures
    const addNum = (n: number | null | undefined) => {
      if (n !== null && n !== undefined && !isNaN(n)) {
        numbers.add(Math.round(n));
        numbers.add(Number(n.toFixed(1)));
        numbers.add(Number(n.toFixed(2)));
      }
    };

    // Strategy metrics
    addNum(strategy.monthlyRequired);
    addNum(strategy.projectedLow);
    addNum(strategy.projectedBase);
    addNum(strategy.projectedHigh);
    addNum(strategy.totalCost);
    addNum(strategy.score);
    addNum(strategy.rank);
    addNum(strategy.riskScore);
    addNum(strategy.liquidityScore);
    addNum(strategy.flexibilityScore);

    // Gap and goal
    addNum(gap.initialTarget);
    addNum(gap.availableFundingCash);
    addNum(gap.projectedOwnSavings);
    addNum(gap.netFundingGap);
    addNum(gap.monthsRemaining);

    // Snapshot
    addNum(snapshot.totalCash);
    addNum(snapshot.emergencyReserveMonths);
    addNum(snapshot.emergencyReserveAmount);
    addNum(snapshot.earmarkedCash);
    addNum(snapshot.monthlyIncome);
    addNum(snapshot.monthlyEssentialExpenses);
    addNum(snapshot.monthlyTotalExpenses);
    addNum(snapshot.existingEmiObligations);
    addNum(snapshot.monthlySurplus);
    addNum(snapshot.availableGoalFundingCapacity);
    addNum(snapshot.totalEligibleAssetValue);

    // Assumptions
    addNum(assumptions.fixedIncomeLow);
    addNum(assumptions.fixedIncomeBase);
    addNum(assumptions.fixedIncomeHigh);
    addNum(assumptions.investmentLow);
    addNum(assumptions.investmentBase);
    addNum(assumptions.investmentHigh);
    addNum(assumptions.emergencyReserveMonths);
    addNum(assumptions.maxDebtServiceRatio);
    addNum(assumptions.maxDebtServiceRatio * 100);

    // Strategy sub-breakdowns
    if (strategy.subBreakdown) {
      for (const val of Object.values(strategy.subBreakdown)) {
        if (typeof val === "number") addNum(val);
      }
    }

    // Common calendar or indexing numbers (e.g. 1st, 1, 2, 3)
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24, 36, 48, 60, 100].forEach((n) => numbers.add(n));

    return numbers;
  }

  /**
   * Validates whether all numbers mentioned in an explanation string exist in the allowed whitelist.
   */
  public static validateTextNumbers(text: string, allowedSet: Set<number>): { valid: boolean; unauthorizedNumbers: number[] } {
    // Regex matches currency numbers, percentages, decimals, and plain integers
    // Ignore dates formatted like 2026-12-01 by stripping hyphenated dates first
    const sanitized = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/\b\d{4}\b/g, "");

    const numberRegex = /(?:₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g;
    let match: RegExpExecArray | null;
    const unauthorized: number[] = [];

    while ((match = numberRegex.exec(sanitized)) !== null) {
      const cleanStr = match[1].replace(/,/g, "");
      const num = parseFloat(cleanStr);
      if (isNaN(num)) continue;

      const rounded = Math.round(num);
      const oneDec = Number(num.toFixed(1));
      const twoDec = Number(num.toFixed(2));

      if (!allowedSet.has(rounded) && !allowedSet.has(num) && !allowedSet.has(oneDec) && !allowedSet.has(twoDec)) {
        unauthorized.push(num);
      }
    }

    return {
      valid: unauthorized.length === 0,
      unauthorizedNumbers: unauthorized,
    };
  }

  /**
   * Deterministic narrative generator (Certified Fallback and standard narrator).
   */
  public static generateDeterministicNarrative(strategy: RankedStrategy): string {
    const lines: string[] = [];
    lines.push(`### Recommended Strategy: ${strategy.name}`);
    lines.push(`**Overall Suitability Score:** ${strategy.score}/100 (Rank #${strategy.rank})`);
    lines.push(`**Key Decision Factors:** ${strategy.reasonCodes.join(", ")}`);
    lines.push(`\n**Plan Summary:**\n${strategy.explanation}`);

    if (strategy.monthlyRequired > 0) {
      lines.push(`\n- **Required Monthly Commitment:** ₹${strategy.monthlyRequired.toLocaleString("en-IN")}`);
    } else {
      lines.push(`\n- **Required Monthly Commitment:** ₹0 (No monthly cash burden)`);
    }

    lines.push(`- **Estimated Total Cost (Interest/Fees):** ₹${strategy.totalCost.toLocaleString("en-IN")}`);
    lines.push(`- **Capital Risk Level:** ${strategy.riskScore}/100`);
    lines.push(`- **Liquidity Rating:** ${strategy.liquidityScore}/100`);

    return lines.join("\n");
  }

  /**
   * Safe Explanation Formatter:
   * Returns AI explanation if strictly validated, otherwise falls back to deterministic narrative.
   */
  public static formatSafeExplanation(
    candidateAiText: string | null | undefined,
    strategy: RankedStrategy,
    snapshot: FinancialSnapshot,
    assumptions: FundingAssumptionConfig,
    gap: {
      initialTarget: number;
      availableFundingCash: number;
      projectedOwnSavings: number;
      netFundingGap: number;
      monthsRemaining: number;
    }
  ): { text: string; source: "AI_VALIDATED" | "DETERMINISTIC_FALLBACK" } {
    if (!candidateAiText || candidateAiText.trim().length === 0) {
      return {
        text: this.generateDeterministicNarrative(strategy),
        source: "DETERMINISTIC_FALLBACK",
      };
    }

    const allowed = this.buildAllowedNumbersWhitelist(strategy, snapshot, assumptions, gap);
    const { valid } = this.validateTextNumbers(candidateAiText, allowed);

    if (valid) {
      return {
        text: candidateAiText,
        source: "AI_VALIDATED",
      };
    }

    // Unverified numbers detected -> Fall back to certified deterministic text
    return {
      text: this.generateDeterministicNarrative(strategy),
      source: "DETERMINISTIC_FALLBACK",
    };
  }
}
