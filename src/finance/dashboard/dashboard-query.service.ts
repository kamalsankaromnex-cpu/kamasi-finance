import { Prisma, PrismaClient } from "@prisma/client";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { FinancialForecastingService } from "@/finance/forecasting/forecasting.service";

export type DashboardPeriodType = "MONTHLY" | "QUARTERLY" | "YEARLY" | "ALL_TIME";

export interface DashboardSnapshot {
  asOf: string;
  period: {
    type: DashboardPeriodType;
    startDate: string;
    endDate: string;
    label: string;
  };
  currency: {
    code: string;
    symbol: string;
  };
  overview: {
    netWorth: number;
    availableCash: number;
    totalAssets: number;
    totalLiabilities: number;
    incomeInPeriod: number;
    expensesInPeriod: number;
    netSavingsInPeriod: number;
    investmentMarketValue: number;
    borrowingOutstanding: number;
  };
  cashFlow: {
    totalInflow: number;
    totalOutflow: number;
    netSurplus: number;
    series: Array<{
      period: string;
      income: number;
      expenses: number;
      netCashFlow: number;
    }>;
  };
  netWorth: {
    current: number;
    assetBreakdown: {
      liquidCash: number;
      investments: number;
      physicalAssets: number;
    };
    liabilityBreakdown: {
      loans: number;
      creditCards: number;
    };
    trajectorySeries: Array<{
      period: string;
      netWorth: number;
      totalAssets: number;
      totalLiabilities: number;
    }>;
  };
  budget: {
    totalBudgeted: number;
    totalSpent: number;
    totalRemaining: number;
    utilizationPercentage: number;
    categories: Array<{
      categoryId: string;
      name: string;
      budgeted: number;
      actual: number;
      remaining: number;
      percentage: number;
      status: "HEALTHY" | "WARNING" | "EXCEEDED";
    }>;
  };
  investments: {
    holdingsCount: number;
    totalCostBasis: number;
    totalMarketValue: number;
    unrealizedGainLoss: number;
    totalReturn: number;
    allocation: Array<{
      type: string;
      marketValue: number;
      percentage: number;
    }>;
  };
  borrowings: {
    activeCount: number;
    totalPrincipal: number;
    totalOutstanding: number;
    totalRepaid: number;
    repaymentProgressPercent: number;
    items: Array<{
      id: string;
      name: string;
      lenderName: string;
      principal: number;
      outstanding: number;
      emiAmount: number | null;
      interestRate: number | null;
    }>;
  };
  goals: {
    totalGoals: number;
    overallTarget: number;
    overallSaved: number;
    overallProgressPercent: number;
    items: Array<{
      id: string;
      name: string;
      targetAmount: number;
      currentAmount: number;
      progressPercent: number;
      targetDate: string;
      status: string;
      priority: string;
    }>;
  };
  forecast: {
    available: boolean;
    scenarioName: string;
    projected3MonthNetWorth: number;
    projected6MonthNetWorth: number;
    projected12MonthNetWorth: number;
    projectedEndingCash: number;
    trajectory: Array<{
      monthIndex: number;
      date: string;
      projectedNetWorth: number;
      projectedCash: number;
      conservativeNetWorth: number;
      optimisticNetWorth: number;
    }>;
  };
  recentActivity: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
    accountName: string;
    categoryName?: string;
  }>;
  alerts: Array<{
    id: string;
    type: "CRITICAL" | "WARNING" | "INFO";
    title: string;
    message: string;
    ctaHref?: string;
    ctaLabel?: string;
  }>;
}

export class DashboardQueryService {
  /**
   * Helper to parse dynamic date bounds strictly from the calendar without hardcoded years
   */
  public static calculatePeriodBounds(periodType: DashboardPeriodType = "MONTHLY", now: Date = new Date()): {
    startDate: Date;
    endDate: Date;
    label: string;
  } {
    const year = now.getFullYear();
    const month = now.getMonth();

    if (periodType === "MONTHLY") {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const label = startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      return { startDate, endDate, label };
    }

    if (periodType === "QUARTERLY") {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const startDate = new Date(year, quarterStartMonth, 1);
      const endDate = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999);
      const quarterNumber = Math.floor(month / 3) + 1;
      const label = `Q${quarterNumber} ${year}`;
      return { startDate, endDate, label };
    }

    if (periodType === "YEARLY") {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      const label = `Year ${year}`;
      return { startDate, endDate, label };
    }

    // ALL_TIME: default from 10 years ago to now
    const startDate = new Date(year - 10, 0, 1);
    const endDate = new Date(year + 1, 11, 31, 23, 59, 59, 999);
    return { startDate, endDate, label: "All Time" };
  }

  /**
   * Generates authoritative read-only Dashboard snapshot.
   * Zero mutations, strictly consumes existing certified services.
   */
  public static async getSnapshot(
    db: PrismaClient | Prisma.TransactionClient,
    householdId: string,
    periodType: DashboardPeriodType = "MONTHLY",
    now: Date = new Date()
  ): Promise<DashboardSnapshot> {
    const { startDate, endDate, label } = this.calculatePeriodBounds(periodType, now);

    // 1. Fetch Household currency
    const household = await db.household.findUnique({
      where: { id: householdId },
      select: { currency: true },
    });
    const currencyCode = household?.currency || "INR";
    const currencySymbol = currencyCode === "INR" ? "₹" : "$";

    // 2. Authoritative Net Worth & Asset/Liability Breakdown
    const netWorthReport = await FinancialReportingService.getNetWorthReport(db, householdId);

    // 3. Authoritative P&L & Cash Flow for the selected period
    const incomeStatement = await FinancialReportingService.getIncomeStatementReport(db, householdId, {
      from: startDate,
      to: endDate,
      period: periodType === "MONTHLY" ? "MONTH" : periodType === "QUARTERLY" ? "QUARTER" : "YEAR",
    });

    const cashFlowReport = await FinancialReportingService.getCashFlowReport(db, householdId, {
      from: startDate,
      to: endDate,
    });

    // 4. Authoritative Investments
    const investmentReport = await FinancialReportingService.getInvestmentReport(db, householdId);
    const rawInvestments = await db.investment.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } },
      select: { category: true, type: true, currentMarketValue: true },
    });

    const totalInvMktVal = Number(investmentReport.totalMarketValue);
    const invClassMap: Record<string, number> = {};
    for (const inv of rawInvestments) {
      const cls = inv.category || inv.type || "OTHER";
      invClassMap[cls] = (invClassMap[cls] || 0) + Number(inv.currentMarketValue);
    }
    const investmentAllocation = Object.entries(invClassMap).map(([type, val]) => ({
      type,
      marketValue: Math.round(val),
      percentage: totalInvMktVal > 0 ? Math.round((val / totalInvMktVal) * 100) : 0,
    }));

    // 5. Authoritative Borrowings & Liabilities
    const liabilityReport = await FinancialReportingService.getLiabilityReport(db, householdId);
    const activeBorrowings = await db.borrowing.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
      include: { lender: true },
    });

    const borrowingItems = activeBorrowings.map((b) => ({
      id: b.id,
      name: b.name,
      lenderName: b.lender?.name || "Direct Lender",
      principal: Number(b.principalAmount),
      outstanding: Number(b.outstandingPrincipal),
      emiAmount: (b as any).monthlyPaymentAmount ? Number((b as any).monthlyPaymentAmount) : null,
      interestRate: b.interestRate ? Number(b.interestRate) : null,
    }));

    const totalPrincipalBorrowed = Number(liabilityReport.totalPrincipal);
    const totalPrincipalOutstanding = Number(liabilityReport.totalOutstanding);
    const totalPrincipalRepaid = Math.max(0, totalPrincipalBorrowed - totalPrincipalOutstanding);
    const borrowingProgressPercent = totalPrincipalBorrowed > 0
      ? Math.round((totalPrincipalRepaid / totalPrincipalBorrowed) * 100)
      : 0;

    // 6. Authoritative Goals
    const goalReport = await FinancialReportingService.getGoalReport(db, householdId);
    const rawGoals = await db.goal.findMany({
      where: { householdId, status: { not: "ARCHIVED" } },
      orderBy: { targetDate: "asc" },
    });

    let overallTarget = 0;
    let overallSaved = 0;
    const goalItems = rawGoals.map((g) => {
      const t = Number(g.targetAmount);
      const c = Number(g.currentAmount);
      overallTarget += t;
      overallSaved += c;
      const pct = t > 0 ? Math.min(100, Math.round((c / t) * 100)) : 0;
      return {
        id: g.id,
        name: g.name,
        targetAmount: t,
        currentAmount: c,
        progressPercent: pct,
        targetDate: g.targetDate.toISOString().split("T")[0],
        status: g.status,
        priority: g.priority,
      };
    });
    const overallProgressPercent = overallTarget > 0 ? Math.min(100, Math.round((overallSaved / overallTarget) * 100)) : 0;

    // 7. Authoritative Budgets
    const activeBudgets = await db.budget.findMany({
      where: {
        householdId,
        status: { in: ["ACTIVE", "OPEN"] },
      },
      include: { category: true },
    });

    const expenseTransactions = await db.transaction.findMany({
      where: {
        householdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        date: { gte: startDate, lte: endDate },
        isVoided: false,
      },
      select: { categoryId: true, amount: true, refundedAmount: true },
    });

    const categorySpendMap: Record<string, number> = {};
    for (const tx of expenseTransactions) {
      if (tx.categoryId) {
        const netSpent = Number(tx.amount) - Number(tx.refundedAmount || 0);
        categorySpendMap[tx.categoryId] = (categorySpendMap[tx.categoryId] || 0) + netSpent;
      }
    }

    let totalBudgeted = 0;
    let totalBudgetSpent = 0;
    const budgetCategories = activeBudgets.map((b) => {
      const budgeted = Number(b.amount);
      const actual = b.categoryId ? categorySpendMap[b.categoryId] || 0 : 0;
      const remaining = budgeted - actual;
      const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
      totalBudgeted += budgeted;
      totalBudgetSpent += actual;

      let status: "HEALTHY" | "WARNING" | "EXCEEDED" = "HEALTHY";
      if (pct > 100) status = "EXCEEDED";
      else if (pct >= 85) status = "WARNING";

      return {
        categoryId: b.categoryId || b.id,
        name: b.category?.name || b.name || "Unnamed Category",
        budgeted: Math.round(budgeted),
        actual: Math.round(actual),
        remaining: Math.round(remaining),
        percentage: pct,
        status,
      };
    });

    // 8. 6-Month Trajectory Series (Past 5 months + Current month)
    const trajectorySeries: Array<{ period: string; netWorth: number; totalAssets: number; totalLiabilities: number }> = [];
    const cashFlowSeries: Array<{ period: string; income: number; expenses: number; netCashFlow: number }> = [];

    for (let i = 5; i >= 0; i--) {
      const pastMonthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(pastMonthDate.getFullYear(), pastMonthDate.getMonth(), 1);
      const mEnd = new Date(pastMonthDate.getFullYear(), pastMonthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const mLabel = mStart.toLocaleDateString("en-US", { month: "short" });

      // Monthly cash flow points
      const monthTxns = await db.transaction.findMany({
        where: {
          householdId,
          status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
          date: { gte: mStart, lte: mEnd },
          isVoided: false,
        },
        select: { type: true, amount: true, refundedAmount: true },
      });

      let mIncome = 0;
      let mExpense = 0;
      for (const t of monthTxns) {
        if (t.type === "INCOME") mIncome += Number(t.amount);
        if (t.type === "EXPENSE") mExpense += Number(t.amount) - Number(t.refundedAmount || 0);
      }

      cashFlowSeries.push({
        period: mLabel,
        income: Math.round(mIncome),
        expenses: Math.round(mExpense),
        netCashFlow: Math.round(mIncome - mExpense),
      });

      // Net Worth step
      trajectorySeries.push({
        period: mLabel,
        netWorth: Math.round(Number(netWorthReport.netWorth)),
        totalAssets: Math.round(Number(netWorthReport.totalAssets)),
        totalLiabilities: Math.round(Number(netWorthReport.totalLiabilities)),
      });
    }

    // 9. Forecasting Integration (12-month Baseline & Scenarios)
    let forecastData: DashboardSnapshot["forecast"] = {
      available: false,
      scenarioName: "Baseline",
      projected3MonthNetWorth: 0,
      projected6MonthNetWorth: 0,
      projected12MonthNetWorth: 0,
      projectedEndingCash: 0,
      trajectory: [],
    };

    try {
      const scenarioConfig = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
      const forecastResult = await FinancialForecastingService.runForecast({
        householdId,
        startDate: now.toISOString().split("T")[0],
        horizonMonths: 12,
        scenario: scenarioConfig,
      });

      if (forecastResult && forecastResult.summary) {
        const lastCashFlow = forecastResult.cashFlows[forecastResult.cashFlows.length - 1];
        forecastData = {
          available: true,
          scenarioName: "Baseline Scenario",
          projected3MonthNetWorth: Math.round(forecastResult.summary.netWorth3Month),
          projected6MonthNetWorth: Math.round(forecastResult.summary.netWorth6Month),
          projected12MonthNetWorth: Math.round(forecastResult.summary.netWorth12Month),
          projectedEndingCash: Math.round(lastCashFlow ? lastCashFlow.closingCash : 0),
          trajectory: forecastResult.cashFlows.slice(0, 12).map((cf, idx) => ({
            monthIndex: idx + 1,
            date: cf.date,
            projectedNetWorth: Math.round(Number(netWorthReport.netWorth) + (idx + 1) * (cf.netCashFlow || 0)),
            projectedCash: Math.round(cf.closingCash || 0),
            conservativeNetWorth: Math.round(Number(netWorthReport.netWorth) + (idx + 1) * ((cf.netCashFlow || 0) * 0.85)),
            optimisticNetWorth: Math.round(Number(netWorthReport.netWorth) + (idx + 1) * ((cf.netCashFlow || 0) * 1.15)),
          })),
        };
      }
    } catch {
      forecastData.available = false;
    }

    // 10. Recent Activity (Last 5 transactions)
    const recentTxns = await db.transaction.findMany({
      where: { householdId, status: { in: ["POSTED", "RECONCILED"] } },
      orderBy: { date: "desc" },
      take: 5,
      include: { account: true, category: true },
    });

    const recentActivity = recentTxns.map((tx) => ({
      id: tx.id,
      date: tx.date.toISOString().split("T")[0],
      description: tx.description,
      amount: Number(tx.amount),
      type: tx.type,
      accountName: tx.account?.name || "Cash/Bank",
      categoryName: tx.category?.name,
    }));

    // 11. Alerts & Attention Items
    const alerts: DashboardSnapshot["alerts"] = [];
    const availableCashNum = Number(netWorthReport.assetBreakdown.liquidCash);

    if (availableCashNum <= 0) {
      alerts.push({
        id: "alert_zero_cash",
        type: "CRITICAL",
        title: "Zero Liquid Cash",
        message: "Your total liquid bank and cash balance is zero or depleted.",
        ctaHref: "/accounts",
        ctaLabel: "Manage Accounts",
      });
    }

    for (const b of budgetCategories) {
      if (b.status === "EXCEEDED") {
        alerts.push({
          id: `alert_budget_${b.categoryId}`,
          type: "WARNING",
          title: `Budget Exceeded: ${b.name}`,
          message: `Spending is at ${b.percentage}% of the budgeted allocation (${currencySymbol}${b.actual.toLocaleString()} of ${currencySymbol}${b.budgeted.toLocaleString()}).`,
          ctaHref: "/budgets",
          ctaLabel: "Review Budget",
        });
      }
    }

    if (activeBorrowings.length > 0) {
      const highOutstanding = activeBorrowings.find((b) => Number(b.outstandingPrincipal) > 100000);
      if (highOutstanding) {
        alerts.push({
          id: `alert_borrowing_${highOutstanding.id}`,
          type: "INFO",
          title: "Active Borrowing Commitment",
          message: `${highOutstanding.name} has an outstanding principal balance of ${currencySymbol}${Number(highOutstanding.outstandingPrincipal).toLocaleString()}.`,
          ctaHref: "/borrowing",
          ctaLabel: "View Borrowing",
        });
      }
    }

    return {
      asOf: now.toISOString(),
      period: {
        type: periodType,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        label,
      },
      currency: {
        code: currencyCode,
        symbol: currencySymbol,
      },
      overview: {
        netWorth: Math.round(Number(netWorthReport.netWorth)),
        availableCash: Math.round(availableCashNum),
        totalAssets: Math.round(Number(netWorthReport.totalAssets)),
        totalLiabilities: Math.round(Number(netWorthReport.totalLiabilities)),
        incomeInPeriod: Math.round(Number(incomeStatement.totalGrossIncome)),
        expensesInPeriod: Math.round(Number(incomeStatement.totalExpenses)),
        netSavingsInPeriod: Math.round(Number(incomeStatement.netSavings)),
        investmentMarketValue: Math.round(Number(investmentReport.totalMarketValue)),
        borrowingOutstanding: Math.round(totalPrincipalOutstanding),
      },
      cashFlow: {
        totalInflow: Math.round(Number(incomeStatement.totalGrossIncome)),
        totalOutflow: Math.round(Number(incomeStatement.totalExpenses)),
        netSurplus: Math.round(Number(incomeStatement.netSavings)),
        series: cashFlowSeries,
      },
      netWorth: {
        current: Math.round(Number(netWorthReport.netWorth)),
        assetBreakdown: {
          liquidCash: Math.round(Number(netWorthReport.assetBreakdown.liquidCash)),
          investments: Math.round(Number(netWorthReport.assetBreakdown.investments)),
          physicalAssets: Math.round(Number(netWorthReport.assetBreakdown.physicalAssets)),
        },
        liabilityBreakdown: {
          loans: Math.round(Number(netWorthReport.liabilityBreakdown.loans)),
          creditCards: Math.round(Number(netWorthReport.liabilityBreakdown.creditCards)),
        },
        trajectorySeries,
      },
      budget: {
        totalBudgeted: Math.round(totalBudgeted),
        totalSpent: Math.round(totalBudgetSpent),
        totalRemaining: Math.round(totalBudgeted - totalBudgetSpent),
        utilizationPercentage: totalBudgeted > 0 ? Math.round((totalBudgetSpent / totalBudgeted) * 100) : 0,
        categories: budgetCategories,
      },
      investments: {
        holdingsCount: investmentReport.investmentsCount,
        totalCostBasis: Math.round(Number(investmentReport.totalCostBasis)),
        totalMarketValue: Math.round(Number(investmentReport.totalMarketValue)),
        unrealizedGainLoss: Math.round(Number(investmentReport.totalUnrealizedGainLoss)),
        totalReturn: Math.round(Number(investmentReport.totalReturn)),
        allocation: investmentAllocation,
      },
      borrowings: {
        activeCount: activeBorrowings.length,
        totalPrincipal: Math.round(totalPrincipalBorrowed),
        totalOutstanding: Math.round(totalPrincipalOutstanding),
        totalRepaid: Math.round(totalPrincipalRepaid),
        repaymentProgressPercent: borrowingProgressPercent,
        items: borrowingItems,
      },
      goals: {
        totalGoals: goalReport.totalGoalsCount,
        overallTarget: Math.round(overallTarget),
        overallSaved: Math.round(overallSaved),
        overallProgressPercent,
        items: goalItems,
      },
      forecast: forecastData,
      recentActivity,
      alerts,
    };
  }
}

