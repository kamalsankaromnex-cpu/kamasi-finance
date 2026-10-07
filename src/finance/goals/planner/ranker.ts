import { StrategyResult, StrategyContext, StrategyFeasibilityStatus } from "./strategies/strategy.interface";

export interface RankingWeights {
  feasibilityWeight: number; // 0.30
  monthlyBurdenWeight: number; // 0.25
  riskWeight: number; // 0.15
  totalCostWeight: number; // 0.10
  liquidityWeight: number; // 0.10
  invasivenessWeight: number; // 0.10
}

export interface RankedStrategy extends StrategyResult {
  score: number; // 0 - 100
  rank: number;  // 1-indexed
  scoreBreakdown: {
    feasibilityScore: number;
    monthlyBurdenScore: number;
    riskAdjustedScore: number;
    costEfficiencyScore: number;
    liquidityScore: number;
    invasivenessAdjustment: number;
  };
}

export class StrategyRanker {
  public static getDefaultWeights(): RankingWeights {
    return {
      feasibilityWeight: 0.30,
      monthlyBurdenWeight: 0.25,
      riskWeight: 0.15,
      totalCostWeight: 0.10,
      liquidityWeight: 0.10,
      invasivenessWeight: 0.10,
    };
  }

  /**
   * Deterministic Two-Stage Strategy Ranking Engine:
   * 
   * Stage 1: Feasibility Partition
   *   Priority: FEASIBLE > REQUIRES_ASSUMPTION > INFEASIBLE
   *   An infeasible or requires-assumption plan can NEVER outrank a feasible plan, regardless of normalized sub-scores.
   * 
   * Stage 2: Rank within partition
   *   For feasible plans:
   *     Feasibility: 30%, Monthly Burden: 25%, Risk: 15%, Total Cost: 10%, Liquidity: 10%, Invasiveness: 10%
   *   Tie-breaking: Lowest Risk, then Least Invasiveness.
   */
  public static rankStrategies(
    strategies: StrategyResult[],
    ctx: StrategyContext,
    weights: RankingWeights = this.getDefaultWeights()
  ): RankedStrategy[] {
    const capacity = Math.max(1000, ctx.snapshot.availableGoalFundingCapacity);
    const target = Math.max(1000, ctx.gap.initialTarget);

    const scored = strategies.map((s) => {
      // 1. Feasibility sub-score
      const sFeas = s.feasible ? 100 : s.feasibilityStatus === "REQUIRES_ASSUMPTION" ? 50 : 0;

      // 2. Monthly Burden sub-score (0 to 100, where 0 monthly burden = 100, burden == capacity = 40, burden > capacity = 0)
      let sBurden = 100;
      if (s.monthlyRequired > 0) {
        const burdenRatio = s.monthlyRequired / capacity;
        sBurden = Math.max(0, Math.round(100 - (burdenRatio * 60)));
      }

      // 3. Risk-adjusted sub-score (100 - riskScore)
      const sRisk = Math.max(0, Math.min(100, 100 - s.riskScore));

      // 4. Cost Efficiency sub-score (0 interest / fees = 100, high interest = lower)
      let sCost = 100;
      if (s.totalCost > 0) {
        const costRatio = s.totalCost / target;
        sCost = Math.max(0, Math.round(100 - (costRatio * 150)));
      }

      // 5. Liquidity sub-score
      const sLiq = Math.max(0, Math.min(100, s.liquidityScore));

      // 6. Invasiveness adjustment (100 - invasivenessScore)
      const sInvasive = Math.max(0, Math.min(100, 100 - s.invasivenessScore));

      // Composite weighted score
      const compositeScore = (
        sFeas * weights.feasibilityWeight +
        sBurden * weights.monthlyBurdenWeight +
        sRisk * weights.riskWeight +
        sCost * weights.totalCostWeight +
        sLiq * weights.liquidityWeight +
        sInvasive * weights.invasivenessWeight
      );

      const finalScore = Number(compositeScore.toFixed(1));

      return {
        ...s,
        score: finalScore,
        rank: 0,
        scoreBreakdown: {
          feasibilityScore: sFeas,
          monthlyBurdenScore: sBurden,
          riskAdjustedScore: sRisk,
          costEfficiencyScore: sCost,
          liquidityScore: sLiq,
          invasivenessAdjustment: sInvasive,
        },
      };
    });

    // Partition Priority: FEASIBLE (1) > REQUIRES_ASSUMPTION (2) > INFEASIBLE (3)
    const getPartitionRank = (status: StrategyFeasibilityStatus) => {
      switch (status) {
        case "FEASIBLE": return 1;
        case "REQUIRES_ASSUMPTION": return 2;
        case "INFEASIBLE": return 3;
        default: return 3;
      }
    };

    scored.sort((a, b) => {
      const pA = getPartitionRank(a.feasibilityStatus);
      const pB = getPartitionRank(b.feasibilityStatus);

      // Stage 1: Partition separation
      if (pA !== pB) return pA - pB;

      // Stage 2: Within partition, rank by score, then lowest risk, then least invasiveness
      if (b.score !== a.score) return b.score - a.score;
      if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
      return a.invasivenessScore - b.invasivenessScore;
    });

    // Assign 1-indexed ranks
    return scored.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }
}
