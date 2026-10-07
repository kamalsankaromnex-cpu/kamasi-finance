export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required: boolean; description: string }>;
}

export const FINANCIAL_TOOLS: AIToolDefinition[] = [
  {
    name: "get_spending_analysis",
    description: "Categorized expense analysis over specified date ranges.",
    parameters: {
      from: { type: "string", required: false, description: "Start date YYYY-MM-DD" },
      to: { type: "string", required: false, description: "End date YYYY-MM-DD" },
      period: { type: "string", required: false, description: "Period like MONTHLY, QUARTERLY, YEARLY" },
    },
  },
  {
    name: "get_income_summary",
    description: "Universal income breakdown across 10 income streams.",
    parameters: {
      from: { type: "string", required: false, description: "Start date YYYY-MM-DD" },
      to: { type: "string", required: false, description: "End date YYYY-MM-DD" },
    },
  },
  {
    name: "get_goal_status",
    description: "Active savings goals status, required contributions, and shortfalls.",
    parameters: {},
  },
  {
    name: "get_liability_summary",
    description: "Outstanding liabilities, EMIs, and simulated settlement timelines.",
    parameters: {},
  },
  {
    name: "get_investment_performance",
    description: "Investment performance, cost basis, realized vs unrealized gains, and forecast growth.",
    parameters: {},
  },
  {
    name: "get_net_worth_analysis",
    description: "Net worth actuals and 3m/6m/12m trajectory projections.",
    parameters: {
      scenarioType: { type: "string", required: false, description: "BASELINE, CONSERVATIVE, OPTIMISTIC" },
    },
  },
  {
    name: "run_scenario_simulation",
    description: "Run forward-looking scenario simulation using Phase 3.6 engine.",
    parameters: {
      salaryGrowth: { type: "number", required: false, description: "Salary growth rate percentage" },
      inflation: { type: "number", required: false, description: "Expense inflation rate percentage" },
      horizonMonths: { type: "number", required: false, description: "Projection horizon in months" },
    },
  },
  {
    name: "propose_financial_action",
    description: "Generate structured financial action proposal for user explicit confirmation.",
    parameters: {
      actionType: { type: "string", required: true, description: "RECORD_EXPENSE, RECORD_INCOME, CONTRIBUTE_GOAL" },
      amount: { type: "number", required: true, description: "Transaction amount" },
      description: { type: "string", required: true, description: "Description or purpose" },
      accountId: { type: "string", required: false, description: "Target account ID" },
      categoryId: { type: "string", required: false, description: "Category ID" },
    },
  },
];

export class AIToolRegistry {
  public static isToolAllowed(toolName: string): boolean {
    return FINANCIAL_TOOLS.some((t) => t.name === toolName);
  }

  public static getToolDefinition(toolName: string): AIToolDefinition | undefined {
    return FINANCIAL_TOOLS.find((t) => t.name === toolName);
  }
}
