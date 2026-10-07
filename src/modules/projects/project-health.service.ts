import { ProjectHealthStatus } from "./types";

export interface HealthEvaluationInput {
  estimatedCost: number;
  budgetedAmount: number;
  committedAmount: number;
  actualPaidAmount: number;
  securedFunding: number;
  plannedFunding: number;
  fundingGap: number;
  overduePaymentsCount: number;
  dueSoonPaymentsCount: number;
  blockedTasksCount: number;
  isProjectCompleted: boolean;
}

export class ProjectHealthService {
  /**
   * Deterministic, explainable evaluation of Project Health.
   * Zero opaque AI or heuristics.
   */
  static evaluateHealth(input: HealthEvaluationInput): {
    status: ProjectHealthStatus;
    reasons: string[];
  } {
    if (input.isProjectCompleted) {
      return { status: "COMPLETED", reasons: ["Project objectives and deliverables are fully completed."] };
    }

    const reasons: string[] = [];

    // 1. Critical Overdue Payments
    if (input.overduePaymentsCount > 0) {
      reasons.push(`${input.overduePaymentsCount} scheduled payment commitment(s) are overdue.`);
      return { status: "PAYMENT_OVERDUE", reasons };
    }

    // 2. Severe Funding Gap (> 20% of estimated cost or fundingGap > securedFunding)
    if (input.fundingGap > 0) {
      const gapPercentage = input.estimatedCost > 0 ? (input.fundingGap / input.estimatedCost) * 100 : 100;
      if (gapPercentage > 25 || input.fundingGap > input.securedFunding) {
        reasons.push(
          `Severe funding gap of ₹${input.fundingGap.toLocaleString("en-IN")} (${gapPercentage.toFixed(1)}% of total cost) without secured funding.`
        );
        return { status: "FUNDING_GAP", reasons };
      }
    }

    // 3. Budget Risk (Actual + Committed exceeds Estimated Cost)
    if (input.actualPaidAmount + input.committedAmount > input.estimatedCost && input.estimatedCost > 0) {
      const excess = input.actualPaidAmount + input.committedAmount - input.estimatedCost;
      reasons.push(
        `Committed obligations and actual paid expenses exceed estimated plan by ₹${excess.toLocaleString("en-IN")}.`
      );
      return { status: "BUDGET_RISK", reasons };
    }

    // 4. Upcoming Payment Due
    if (input.dueSoonPaymentsCount > 0) {
      reasons.push(`${input.dueSoonPaymentsCount} payment obligation(s) are due within the next 30 days.`);
      return { status: "PAYMENT_DUE", reasons };
    }

    // 5. Execution Delay (Blocked tasks)
    if (input.blockedTasksCount > 0) {
      reasons.push(`${input.blockedTasksCount} critical task(s) are currently in BLOCKED status.`);
      return { status: "EXECUTION_DELAY", reasons };
    }

    // 6. Mild Funding Risk
    if (input.fundingGap > 0) {
      reasons.push(`Funding gap of ₹${input.fundingGap.toLocaleString("en-IN")} exists for future planned phases.`);
      return { status: "FUNDING_RISK", reasons };
    }

    // 7. On Track
    reasons.push("All financial plans, commitments, funding channels, and execution tasks are on track.");
    return { status: "ON_TRACK", reasons };
  }
}
