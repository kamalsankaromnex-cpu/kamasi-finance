export interface WidgetDefinition {
  id: string;
  title: string;
  category: "OVERVIEW" | "TRENDS" | "ALLOCATION" | "PLANNING" | "ACTIVITY";
  size: "LARGE" | "MEDIUM" | "SMALL";
  description: string;
  defaultVisible: boolean;
}

export const DASHBOARD_WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: "financial-summary",
    title: "Financial Summary KPIs",
    category: "OVERVIEW",
    size: "LARGE",
    description: "Key metrics across Net Worth, Liquid Cash, Income, Expenses, and Debt",
    defaultVisible: true,
  },
  {
    id: "cash-flow-trend",
    title: "Cash Flow & Net Surplus",
    category: "TRENDS",
    size: "LARGE",
    description: "Monthly income, expenses, and net surplus trajectory",
    defaultVisible: true,
  },
  {
    id: "budget-utilization",
    title: "Budget & Spend Limits",
    category: "ALLOCATION",
    size: "MEDIUM",
    description: "Category-level budget thresholds, actual spend, and utilization",
    defaultVisible: true,
  },
  {
    id: "goals-progress",
    title: "Savings Goals Progress",
    category: "PLANNING",
    size: "MEDIUM",
    description: "Progress rings, target dates, and funding completion for active goals",
    defaultVisible: true,
  },
  {
    id: "investments-portfolio",
    title: "Investment Portfolio & Returns",
    category: "ALLOCATION",
    size: "MEDIUM",
    description: "Holdings count, cost basis, market value, and asset class allocation",
    defaultVisible: true,
  },
  {
    id: "borrowings-debt",
    title: "Borrowing & Debt Obligations",
    category: "OVERVIEW",
    size: "MEDIUM",
    description: "Principal borrowed, remaining balance, EMI commitments, and repayment progress",
    defaultVisible: true,
  },
  {
    id: "net-worth-trajectory",
    title: "Net Worth Breakdown & History",
    category: "TRENDS",
    size: "LARGE",
    description: "Asset vs liability composition and 6-month historical progression",
    defaultVisible: true,
  },
  {
    id: "forecast-trajectory",
    title: "12-Month Financial Trajectory",
    category: "PLANNING",
    size: "LARGE",
    description: "Baseline, conservative, and optimistic net worth projections from forecasting engine",
    defaultVisible: true,
  },
  {
    id: "goal-funding-planner",
    title: "Goal Funding v2 Planner",
    category: "PLANNING",
    size: "MEDIUM",
    description: "Own savings, projected gap, and recommended deterministic funding strategies",
    defaultVisible: true,
  },
  {
    id: "attention-alerts",
    title: "Financial Attention Items",
    category: "ACTIVITY",
    size: "MEDIUM",
    description: "Critical liquidity alerts, budget limit breaches, and financial warnings",
    defaultVisible: true,
  },
  {
    id: "recent-activity",
    title: "Recent Posted Ledger Activity",
    category: "ACTIVITY",
    size: "MEDIUM",
    description: "Last 5 posted and reconciled financial transactions",
    defaultVisible: true,
  },
];

