import { FinancialQueryEngine, FinancialQueryResult } from "./query-engine";
import { AIToolRegistry } from "./tool-registry";
import { FinancialContextBuilder } from "./context-builder";
import { FinancialCommand } from "@/finance/financial-command";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export interface AIResponseFact {
  label: string;
  value: number | string;
  currency?: string;
}

export interface AIResponse {
  answer: string;
  facts: AIResponseFact[];
  calculationsUsed: string[];
  assumptions: string[];
  warnings: string[];
  sourceQueryIds: string[];
}

export type ActionProposalStatus = "PENDING" | "CONFIRMED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "FAILED";

export interface FinancialActionProposal {
  id: string;
  householdId: string;
  requestedByUserId: string;
  actionType: "RECORD_EXPENSE" | "RECORD_INCOME" | "CONTRIBUTE_GOAL" | "TRANSFER";
  parameters: Record<string, any>;
  parametersHash: string;
  humanReadableSummary: string;
  status: ActionProposalStatus;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  executedAt?: string;
}

// In-memory persistent proposal registry (or backed by DB)
const proposalStore = new Map<string, FinancialActionProposal>();

export class AIFinancialAssistantService {
  /**
   * Helper to generate SHA-256 hash of action parameters
   */
  public static hashParameters(params: Record<string, any>): string {
    const canonicalStr = JSON.stringify(params, Object.keys(params).sort());
    return crypto.createHash("sha256").update(canonicalStr).digest("hex");
  }

  /**
   * 1. Process Natural Language Query
   */
  public static async processQuery(householdId: string, prompt: string): Promise<AIResponse> {
    const lower = prompt.toLowerCase();
    const sourceQueryIds: string[] = [];
    const facts: AIResponseFact[] = [];
    const warnings: string[] = [];
    let answer = "";

    // 1. Spending / Expense query intent
    if (lower.includes("spend") || lower.includes("expense") || lower.includes("food") || lower.includes("where did my money go")) {
      if (!AIToolRegistry.isToolAllowed("get_spending_analysis")) {
        throw new Error("Tool get_spending_analysis is not authorized");
      }
      const res: FinancialQueryResult<any> = await FinancialQueryEngine.getSpendingAnalysis(householdId, {});
      sourceQueryIds.push(res.queryId);

      const total = Number(res.data.totalExpenses?.toString() || 0);
      facts.push({ label: "Total Expenses", value: total, currency: res.currency });

      (res.data.categoryTotals || []).forEach((cat: any) => {
        facts.push({ label: `Expense Category: ${cat.name}`, value: Number(cat.amount), currency: res.currency });
      });

      answer = `Your total expenses were ${res.currency || "INR"} ${total.toLocaleString()}.`;
    }
    // 2. Goal / Savings Target query intent
    else if (lower.includes("goal") || lower.includes("reach my goal") || lower.includes("target")) {
      if (!AIToolRegistry.isToolAllowed("get_goal_status")) {
        throw new Error("Tool get_goal_status is not authorized");
      }
      const res: FinancialQueryResult<any> = await FinancialQueryEngine.getGoalStatus(householdId);
      sourceQueryIds.push(res.queryId);

      const count = res.data.summary.activeGoalsCount;
      facts.push({ label: "Active Goals Count", value: count });
      facts.push({ label: "Total Goal Shortfall", value: Number(res.data.summary.totalShortfall), currency: res.currency });

      answer = `You have ${count} active savings goals with a total remaining shortfall of ${res.currency} ${Number(res.data.summary.totalShortfall).toLocaleString()}.`;
    }
    // 3. Liability / EMI query intent
    else if (lower.includes("liability") || lower.includes("debt") || lower.includes("emi") || lower.includes("loan")) {
      if (!AIToolRegistry.isToolAllowed("get_liability_summary")) {
        throw new Error("Tool get_liability_summary is not authorized");
      }
      const res: FinancialQueryResult<any> = await FinancialQueryEngine.getLiabilitySummary(householdId);
      sourceQueryIds.push(res.queryId);

      facts.push({ label: "Total Outstanding Principal", value: Number(res.data.summary.totalOutstandingPrincipal), currency: res.currency });
      facts.push({ label: "Total Monthly EMI", value: Number(res.data.summary.totalMonthlyEmi), currency: res.currency });

      answer = `Your total outstanding liability balance is ${res.currency} ${Number(res.data.summary.totalOutstandingPrincipal).toLocaleString()} with a monthly EMI obligation of ${res.currency} ${Number(res.data.summary.totalMonthlyEmi).toLocaleString()}.`;
    }
    // 4. Investment performance query intent
    else if (lower.includes("investment") || lower.includes("stock") || lower.includes("return") || lower.includes("portfolio")) {
      if (!AIToolRegistry.isToolAllowed("get_investment_performance")) {
        throw new Error("Tool get_investment_performance is not authorized");
      }
      const res: FinancialQueryResult<any> = await FinancialQueryEngine.getInvestmentPerformance(householdId);
      sourceQueryIds.push(res.queryId);

      facts.push({ label: "Investment Market Value", value: Number(res.data.summary.totalMarketValue), currency: res.currency });
      facts.push({ label: "Realized Gain/Loss", value: Number(res.data.summary.totalRealizedGainLoss), currency: res.currency });

      answer = `Your investment portfolio current market valuation is ${res.currency} ${Number(res.data.summary.totalMarketValue).toLocaleString()} with a cumulative realized gain of ${res.currency} ${Number(res.data.summary.totalRealizedGainLoss).toLocaleString()}.`;
    }
    // 5. Scenario Simulation intent ("What if salary increases 8%?")
    else if (lower.includes("what if") || lower.includes("simulation") || lower.includes("increases")) {
      if (!AIToolRegistry.isToolAllowed("run_scenario_simulation")) {
        throw new Error("Tool run_scenario_simulation is not authorized");
      }
      let growthRate = 5;
      const match = lower.match(/(\d+)%/);
      if (match) growthRate = Number(match[1]);

      const res: FinancialQueryResult<any> = await FinancialQueryEngine.runScenarioSimulation(householdId, {
        salaryGrowth: growthRate,
      });
      sourceQueryIds.push(res.queryId);

      facts.push({ label: `Simulated Salary Growth`, value: `${growthRate}%` });
      facts.push({ label: "Projected 12-Month Net Worth", value: Number(res.data.projectedEndingNetWorth), currency: "INR" });

      answer = `If your salary grows by ${growthRate}%, your projected net worth at 12 months will reach INR ${Number(res.data.projectedEndingNetWorth).toLocaleString()}.`;
    }
    // 6. Net Worth / General Summary default
    else {
      if (!AIToolRegistry.isToolAllowed("get_net_worth_analysis")) {
        throw new Error("Tool get_net_worth_analysis is not authorized");
      }
      const res: FinancialQueryResult<any> = await FinancialQueryEngine.getNetWorthAnalysis(householdId, {});
      sourceQueryIds.push(res.queryId);

      facts.push({ label: "Current Net Worth", value: Number(res.data.currentNetWorth), currency: res.currency });
      facts.push({ label: "12-Month Projected Net Worth", value: Number(res.data.projected12MonthNetWorth), currency: res.currency });

      answer = `Your current net worth is ${res.currency} ${Number(res.data.currentNetWorth).toLocaleString()}, projected to reach ${res.currency} ${Number(res.data.projected12MonthNetWorth).toLocaleString()} over 12 months.`;
    }

    return {
      answer,
      facts,
      calculationsUsed: ["FinancialQueryEngine Projections", "Double-Entry Ledger Totals"],
      assumptions: ["All active accounts in good standing", "Baseline recurring rules apply"],
      warnings,
      sourceQueryIds,
    };
  }

  /**
   * 2. Propose Financial Action (Immutable & Hashed)
   */
  public static async proposeAction(
    householdId: string,
    requestedByUserId: string,
    actionType: "RECORD_EXPENSE" | "RECORD_INCOME" | "CONTRIBUTE_GOAL" | "TRANSFER",
    parameters: Record<string, any>
  ): Promise<FinancialActionProposal> {
    if (!AIToolRegistry.isToolAllowed("propose_financial_action")) {
      throw new Error("Tool propose_financial_action is not authorized");
    }

    const proposalId = `prop_${crypto.randomBytes(8).toString("hex")}`;
    const parametersHash = this.hashParameters(parameters);
    const idempotencyKey = `ai_cmd_${proposalId}`;
    const createdAt = new Date().toISOString();
    // Expiration set to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const humanReadableSummary = `Proposed Action: ${actionType.replace("_", " ")} of ${parameters.currency || "INR"} ${parameters.amount} (${parameters.description || "No description"})`;

    const proposal: FinancialActionProposal = {
      id: proposalId,
      householdId,
      requestedByUserId,
      actionType,
      parameters,
      parametersHash,
      humanReadableSummary,
      status: "PENDING",
      idempotencyKey,
      createdAt,
      expiresAt,
    };

    proposalStore.set(proposalId, proposal);
    return proposal;
  }

  /**
   * 3. Confirm and Execute Action Proposal (Hash Binding & Expiration Checked)
   */
  public static async confirmAndExecuteAction(
    householdId: string,
    requestedByUserId: string,
    proposalId: string,
    confirmedParametersHash: string
  ): Promise<{ success: boolean; journalId?: string; proposal: FinancialActionProposal }> {
    const proposal = proposalStore.get(proposalId);
    if (!proposal) {
      throw new Error(`Action proposal not found: ${proposalId}`);
    }

    if (proposal.householdId !== householdId) {
      throw new Error(`Household isolation violation for proposal ${proposalId}`);
    }

    if (new Date() > new Date(proposal.expiresAt)) {
      proposal.status = "EXPIRED";
      proposalStore.set(proposalId, proposal);
      throw new Error(`Action proposal ${proposalId} has EXPIRED`);
    }

    if (proposal.status !== "PENDING") {
      throw new Error(`Action proposal ${proposalId} is in status ${proposal.status}, expected PENDING`);
    }

    // Verify parameter hash binding
    if (confirmedParametersHash !== proposal.parametersHash) {
      proposal.status = "FAILED";
      proposalStore.set(proposalId, proposal);
      throw new Error(`Parameter hash mismatch for proposal ${proposalId}. Proposal payload was altered.`);
    }

    // Execute dispatch via FinancialCommand
    let journalResult;
    try {
      if (proposal.actionType === "RECORD_EXPENSE") {
        journalResult = await prisma.$transaction(async (tx) =>
          FinancialCommand.postExpense(tx, {
            householdId: proposal.householdId,
            accountId: proposal.parameters.accountId,
            amount: new Prisma.Decimal(proposal.parameters.amount),
            description: proposal.parameters.description || "AI Proposed Expense",
            idempotencyKey: proposal.idempotencyKey,
          })
        );
      } else if (proposal.actionType === "RECORD_INCOME") {
        journalResult = await prisma.$transaction(async (tx) =>
          FinancialCommand.postIncome(tx, {
            householdId: proposal.householdId,
            accountId: proposal.parameters.accountId,
            amount: new Prisma.Decimal(proposal.parameters.amount),
            grossAmount: new Prisma.Decimal(proposal.parameters.amount),
            description: proposal.parameters.description || "AI Proposed Income",
            idempotencyKey: proposal.idempotencyKey,
          })
        );
      } else {
        throw new Error(`Unsupported proposal actionType: ${proposal.actionType}`);
      }

      proposal.status = "EXECUTED";
      proposal.confirmedAt = new Date().toISOString();
      proposal.executedAt = new Date().toISOString();
      proposalStore.set(proposalId, proposal);

      return {
        success: true,
        journalId: journalResult.id,
        proposal,
      };
    } catch (err: any) {
      proposal.status = "FAILED";
      proposalStore.set(proposalId, proposal);
      throw err;
    }
  }

  /**
   * Fetch Proposal by ID
   */
  public static getProposal(proposalId: string): FinancialActionProposal | undefined {
    return proposalStore.get(proposalId);
  }
}
