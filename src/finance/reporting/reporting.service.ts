import { Prisma, PrismaClient } from "@prisma/client";

export interface ReportDateFilter {
  from?: Date;
  to?: Date;
  period?: "MONTH" | "QUARTER" | "YEAR" | "CUSTOM";
}

export interface ReportFilters extends ReportDateFilter {
  accountId?: string;
  categoryId?: string;
  currency?: string;
}

export class FinancialReportingService {
  /**
   * Helper to parse date bounds based on filter inputs.
   */
  private static parseDateBounds(filter?: ReportDateFilter): { fromDate: Date; toDate: Date } {
    const now = new Date();
    let fromDate = filter?.from ? new Date(filter.from) : new Date(now.getFullYear(), 0, 1); // Default to start of current year
    let toDate = filter?.to ? new Date(filter.to) : new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    if (filter?.period === "MONTH") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (filter?.period === "QUARTER") {
      const currentQuarterMonth = Math.floor(now.getMonth() / 3) * 3;
      fromDate = new Date(now.getFullYear(), currentQuarterMonth, 1);
      toDate = new Date(now.getFullYear(), currentQuarterMonth + 3, 0, 23, 59, 59);
    } else if (filter?.period === "YEAR") {
      fromDate = new Date(now.getFullYear(), 0, 1);
      toDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    return { fromDate, toDate };
  }

  /**
   * 1. Net Worth Report
   * Total Assets - Total Liabilities = Net Worth
   */
  static async getNetWorthReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ) {
    // 1. Liquid Accounts (Bank, Cash)
    const bankAccounts = await db.account.findMany({
      where: { householdId, isArchived: false, type: { in: ["BANK", "CASH"] } },
    });
    const liquidBalance = bankAccounts.reduce(
      (acc, a) => acc.add(a.balance),
      new Prisma.Decimal(0)
    );

    // 2. Active Investments Market Value
    const investments = await db.investment.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } },
    });
    const investmentValue = investments.reduce(
      (acc, inv) => acc.add(inv.currentMarketValue),
      new Prisma.Decimal(0)
    );

    // 3. Physical Assets (Property, Land, Vehicles, Gold, Equipment, Livestock)
    const assets = await db.asset.findMany({
      where: { householdId, status: "ACTIVE" },
    });
    const assetValue = assets.reduce(
      (acc, asset) => acc.add(asset.currentValue),
      new Prisma.Decimal(0)
    );

    const totalAssets = liquidBalance.add(investmentValue).add(assetValue);

    // 4. Liabilities & Borrowings (Single Authoritative Source: Borrowings + Unmigrated Liabilities)
    // Strictly exclude DRAFT status from reported obligations
    const borrowings = await db.borrowing.findMany({
      where: { householdId, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
    });
    const borrowingOutstanding = borrowings.reduce(
      (acc, b) => acc.add(b.outstandingPrincipal),
      new Prisma.Decimal(0)
    );

    const legacyLiabilities = await db.liability.findMany({
      where: { householdId, borrowing: null, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
    });
    const legacyOutstanding = legacyLiabilities.reduce(
      (acc, l) => acc.add(l.outstandingAmount),
      new Prisma.Decimal(0)
    );

    const totalLoans = borrowingOutstanding.add(legacyOutstanding);

    // 5. Credit Cards & Unlinked Loan Accounts
    // Collect liability account IDs already accounted for in borrowings/liabilities
    const linkedLoanAccountIds = new Set<string>();
    borrowings.forEach((b) => {
      if (b.liabilityAccountId) linkedLoanAccountIds.add(b.liabilityAccountId);
    });
    legacyLiabilities.forEach((l) => {
      if (l.liabilityAccountId) linkedLoanAccountIds.add(l.liabilityAccountId);
    });

    const debtAccounts = await db.account.findMany({
      where: { householdId, isArchived: false, type: { in: ["CREDIT", "LOAN"] } },
    });

    let creditCardDebt = new Prisma.Decimal(0);
    let unlinkedLoanDebt = new Prisma.Decimal(0);

    for (const a of debtAccounts) {
      if (a.type === "CREDIT") {
        // Credit cards in debt have negative balance under normal debit-asset balance semantics
        if (a.balance.lt(0)) {
          creditCardDebt = creditCardDebt.add(a.balance.abs());
        }
      } else if (a.type === "LOAN" && !linkedLoanAccountIds.has(a.id)) {
        // Standalone loan accounts not already tracked by a Borrowing or Liability record
        unlinkedLoanDebt = unlinkedLoanDebt.add(a.balance.abs());
      }
    }

    const finalTotalLoans = totalLoans.add(unlinkedLoanDebt);
    const totalLiabilities = finalTotalLoans.add(creditCardDebt);
    const netWorth = totalAssets.sub(totalLiabilities);

    return {
      householdId,
      totalAssets,
      totalLiabilities,
      netWorth,
      assetBreakdown: {
        liquidCash: liquidBalance,
        investments: investmentValue,
        physicalAssets: assetValue,
      },
      liabilityBreakdown: {
        loans: finalTotalLoans,
        creditCards: creditCardDebt,
      },
    };
  }

  /**
   * 2. Income Statement Report
   * Gross Income - Total Expenses = Net Income
   */
  static async getIncomeStatementReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    filter?: ReportDateFilter
  ) {
    const { fromDate, toDate } = this.parseDateBounds(filter);

    // Fetch Credited Income Occurrences within date range
    const incomeOccurrences = await db.incomeOccurrence.findMany({
      where: {
        householdId,
        status: { in: ["CREDITED", "RECONCILED"] },
        creditedAt: { gte: fromDate, lte: toDate },
      },
      include: { incomeSource: true },
    });

    const incomeByCategory: Record<string, Prisma.Decimal> = {
      SALARY: new Prisma.Decimal(0),
      BUSINESS: new Prisma.Decimal(0),
      AGRICULTURE: new Prisma.Decimal(0),
      SERICULTURE: new Prisma.Decimal(0),
      LIVESTOCK: new Prisma.Decimal(0),
      RENTAL: new Prisma.Decimal(0),
      FREELANCE: new Prisma.Decimal(0),
      INTEREST: new Prisma.Decimal(0),
      DIVIDEND: new Prisma.Decimal(0),
      OTHER: new Prisma.Decimal(0),
    };

    let totalGrossIncome = new Prisma.Decimal(0);
    let totalTaxWithheld = new Prisma.Decimal(0);
    let totalDeductions = new Prisma.Decimal(0);
    let totalNetIncomeCredited = new Prisma.Decimal(0);

    for (const inc of incomeOccurrences) {
      const cat = (inc.incomeSource.category || "OTHER").toUpperCase();
      const gross = inc.grossAmount || inc.expectedAmount;
      const net = inc.netAmount || inc.receivedAmount;
      const tax = inc.taxWithheld || new Prisma.Decimal(0);
      const ded = inc.deductionsAmount || new Prisma.Decimal(0);

      const key = incomeByCategory[cat] ? cat : "OTHER";
      incomeByCategory[key] = incomeByCategory[key].add(gross);

      totalGrossIncome = totalGrossIncome.add(gross);
      totalTaxWithheld = totalTaxWithheld.add(tax);
      totalDeductions = totalDeductions.add(ded);
      totalNetIncomeCredited = totalNetIncomeCredited.add(net);
    }

    // Fetch Posted Expenses within date range
    const expenseTransactions = await db.transaction.findMany({
      where: {
        householdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        date: { gte: fromDate, lte: toDate },
      },
      include: { category: true },
    });

    const expensesByCategory: Record<string, Prisma.Decimal> = {};
    let totalExpenses = new Prisma.Decimal(0);

    for (const exp of expenseTransactions) {
      const catName = exp.category?.name || "General Expenses";
      if (!expensesByCategory[catName]) {
        expensesByCategory[catName] = new Prisma.Decimal(0);
      }
      const netAmount = exp.amount.sub(exp.refundedAmount || 0);
      const effectiveAmount = netAmount.gt(0) ? netAmount : new Prisma.Decimal(0);
      expensesByCategory[catName] = expensesByCategory[catName].add(effectiveAmount);
      totalExpenses = totalExpenses.add(effectiveAmount);
    }

    const netSavings = totalGrossIncome.sub(totalExpenses);

    return {
      householdId,
      period: filter?.period || "CUSTOM",
      fromDate,
      toDate,
      totalGrossIncome,
      totalTaxWithheld,
      totalDeductions,
      totalNetIncomeCredited,
      totalExpenses,
      netSavings,
      incomeByCategory,
      expensesByCategory,
    };
  }

  /**
   * 3. Expense Analysis Report
   * Multi-dimensional expense analysis by category, period, and account.
   */
  static async getExpenseAnalysisReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    filter?: ReportFilters
  ) {
    const { fromDate, toDate } = this.parseDateBounds(filter);

    const transactions = await db.transaction.findMany({
      where: {
        householdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        date: { gte: fromDate, lte: toDate },
        ...(filter?.accountId ? { accountId: filter.accountId } : {}),
        ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
      },
      include: { category: true, account: true },
    });

    let totalExpenses = new Prisma.Decimal(0);
    const categoryTotals: Record<string, { name: string; amount: Prisma.Decimal }> = {};
    const accountTotals: Record<string, { name: string; amount: Prisma.Decimal }> = {};

    for (const tx of transactions) {
      const catId = tx.categoryId || "UNCATEGORIZED";
      const catName = tx.category?.name || "Uncategorized";
      const accId = tx.accountId;
      const accName = tx.account?.name || "Unknown Account";

      const netAmount = tx.amount.sub(tx.refundedAmount || 0);
      const effectiveAmount = netAmount.gt(0) ? netAmount : new Prisma.Decimal(0);

      totalExpenses = totalExpenses.add(effectiveAmount);

      if (!categoryTotals[catId]) categoryTotals[catId] = { name: catName, amount: new Prisma.Decimal(0) };
      categoryTotals[catId].amount = categoryTotals[catId].amount.add(effectiveAmount);

      if (!accountTotals[accId]) accountTotals[accId] = { name: accName, amount: new Prisma.Decimal(0) };
      accountTotals[accId].amount = accountTotals[accId].amount.add(effectiveAmount);
    }

    return {
      householdId,
      fromDate,
      toDate,
      totalExpenses,
      categoryTotals: Object.values(categoryTotals),
      accountTotals: Object.values(accountTotals),
      transactionCount: transactions.length,
    };
  }

  /**
   * 4. Cash Flow Report
   * Operating, Investing, Financing. TRANSFERS strictly EXCLUDED.
   */
  static async getCashFlowReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    filter?: ReportDateFilter
  ) {
    const { fromDate, toDate } = this.parseDateBounds(filter);

    // 1. Operating Cash Inflows (Income occurrences credited)
    const incomeCredited = await db.incomeOccurrence.findMany({
      where: { householdId, status: { in: ["CREDITED", "RECONCILED"] }, creditedAt: { gte: fromDate, lte: toDate } },
    });
    const operatingInflows = incomeCredited.reduce(
      (acc, inc) => acc.add(inc.receivedAmount),
      new Prisma.Decimal(0)
    );

    // Operating Cash Outflows (Posted expenses)
    const operatingExpenses = await db.transaction.findMany({
      where: { householdId, type: "EXPENSE", status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] }, date: { gte: fromDate, lte: toDate } },
    });
    const operatingOutflows = operatingExpenses.reduce(
      (acc, exp) => {
        const netAmount = exp.amount.sub(exp.refundedAmount || 0);
        return acc.add(netAmount.gt(0) ? netAmount : new Prisma.Decimal(0));
      },
      new Prisma.Decimal(0)
    );

    const netOperatingCashFlow = operatingInflows.sub(operatingOutflows);

    // 2. Investing Cash Flow (Asset Sale Proceeds, Investment Sales/Buys, Dividends)
    const assetEvents = await db.assetFinancialEvent.findMany({
      where: { householdId, effectiveDate: { gte: fromDate, lte: toDate } },
    });
    let investingInflows = new Prisma.Decimal(0);
    let investingOutflows = new Prisma.Decimal(0);

    for (const evt of assetEvents) {
      if (evt.eventType === "DISPOSAL" || evt.eventType === "SALE") investingInflows = investingInflows.add(evt.amount);
      if (evt.eventType === "ACQUISITION") investingOutflows = investingOutflows.add(evt.amount);
    }

    const invEvents = await db.investmentFinancialEvent.findMany({
      where: { householdId, isReversed: false, effectiveDate: { gte: fromDate, lte: toDate } },
    });
    for (const evt of invEvents) {
      if (evt.eventType === "SELL" || evt.eventType === "DIVIDEND" || evt.eventType === "INTEREST") {
        investingInflows = investingInflows.add(evt.amount);
      }
      if (evt.eventType === "BUY") investingOutflows = investingOutflows.add(evt.amount);
    }

    const netInvestingCashFlow = investingInflows.sub(investingOutflows);

    // 3. Financing Cash Flow (Borrowing inflows, Repayments outflows)
    let financingInflows = new Prisma.Decimal(0);
    let financingOutflows = new Prisma.Decimal(0);

    const borrowingEvents = await db.borrowingFinancialEvent.findMany({
      where: { householdId, isReversed: false, effectiveDate: { gte: fromDate, lte: toDate } },
    });
    for (const evt of borrowingEvents) {
      if (evt.eventType === "DISBURSEMENT") {
        financingInflows = financingInflows.add(evt.principalAmount);
      }
      if (evt.eventType === "REPAYMENT" || evt.eventType === "EMI_PAYMENT") {
        financingOutflows = financingOutflows.add(evt.totalAmount.gt(0) ? evt.totalAmount : evt.principalAmount.add(evt.interestAmount));
      }
    }

    const legacyEvents = await db.liabilityFinancialEvent.findMany({
      where: {
        householdId,
        liability: { borrowing: null },
        effectiveDate: { gte: fromDate, lte: toDate },
      },
    });

    for (const evt of legacyEvents) {
      if (evt.eventType === "BORROW") financingInflows = financingInflows.add(evt.totalAmount.gt(0) ? evt.totalAmount : evt.principalAmount);
      if (evt.eventType === "REPAYMENT" || evt.eventType === "INTEREST_PAID" || evt.eventType === "SETTLEMENT") {
        financingOutflows = financingOutflows.add(evt.totalAmount.gt(0) ? evt.totalAmount : evt.principalAmount.add(evt.interestAmount));
      }
    }

    const netFinancingCashFlow = financingInflows.sub(financingOutflows);

    const totalNetCashFlow = netOperatingCashFlow.add(netInvestingCashFlow).add(netFinancingCashFlow);

    return {
      householdId,
      fromDate,
      toDate,
      operating: { inflows: operatingInflows, outflows: operatingOutflows, net: netOperatingCashFlow },
      investing: { inflows: investingInflows, outflows: investingOutflows, net: netInvestingCashFlow },
      financing: { inflows: financingInflows, outflows: financingOutflows, net: netFinancingCashFlow },
      totalNetCashFlow,
      note: "Internal Transfers move funds between accounts and are strictly excluded from cash inflows/outflows.",
    };
  }

  /**
   * 5. Investment Report
   */
  static async getInvestmentReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ) {
    const investments = await db.investment.findMany({
      where: { householdId, status: { notIn: ["ARCHIVED", "DRAFT"] } },
      include: {
        financialEvents: {
          where: { isReversed: false },
        },
      },
    });

    let totalCostBasis = new Prisma.Decimal(0);
    let totalMarketValue = new Prisma.Decimal(0);
    let totalRealizedGainLoss = new Prisma.Decimal(0);
    let totalDividends = new Prisma.Decimal(0);
    let totalInterest = new Prisma.Decimal(0);
    let totalFees = new Prisma.Decimal(0);

    for (const inv of investments) {
      totalCostBasis = totalCostBasis.add(inv.totalCostBasis);
      totalMarketValue = totalMarketValue.add(inv.currentMarketValue);
      totalRealizedGainLoss = totalRealizedGainLoss.add(inv.realizedGainLoss);

      for (const evt of inv.financialEvents) {
        if (evt.eventType === "DIVIDEND") totalDividends = totalDividends.add(evt.amount);
        if (evt.eventType === "INTEREST") totalInterest = totalInterest.add(evt.amount);
        if (evt.eventType === "FEE") totalFees = totalFees.add(evt.amount);
      }
    }

    const totalIncome = totalDividends.add(totalInterest);
    const totalUnrealizedGainLoss = totalMarketValue.sub(totalCostBasis);
    const totalReturn = totalRealizedGainLoss.add(totalUnrealizedGainLoss).add(totalIncome).sub(totalFees);

    return {
      householdId,
      totalCostBasis,
      totalMarketValue,
      totalRealizedGainLoss,
      totalUnrealizedGainLoss,
      totalDividends,
      totalInterest,
      totalIncome,
      totalFees,
      totalReturn,
      investmentsCount: investments.length,
    };
  }

  /**
   * 6. Asset Report
   */
  static async getAssetReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ) {
    const assets = await db.asset.findMany({
      where: { householdId, status: { not: "ARCHIVED" } },
      include: { financialEvents: true },
    });

    let totalInitialValue = new Prisma.Decimal(0);
    let totalCurrentValue = new Prisma.Decimal(0);
    let totalDisposalProceeds = new Prisma.Decimal(0);

    for (const asset of assets) {
      totalInitialValue = totalInitialValue.add(asset.initialValue);
      totalCurrentValue = totalCurrentValue.add(asset.currentValue);
      if (asset.disposalProceeds) totalDisposalProceeds = totalDisposalProceeds.add(asset.disposalProceeds);
    }

    return {
      householdId,
      totalInitialValue,
      totalCurrentValue,
      totalDisposalProceeds,
      assetsCount: assets.length,
      assets,
    };
  }

  /**
   * 7. Liability Report
   */
  static async getLiabilityReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ) {
    const borrowings = await db.borrowing.findMany({
      where: { householdId, status: { not: "ARCHIVED" } },
      include: { financialEvents: { where: { isReversed: false } }, lender: true },
    });

    const liabilities = await db.liability.findMany({
      where: { householdId, borrowing: null, status: { not: "ARCHIVED" } },
      include: { financialEvents: true },
    });

    let totalPrincipal = new Prisma.Decimal(0);
    let totalOutstanding = new Prisma.Decimal(0);
    let totalInterestAccrued = new Prisma.Decimal(0);
    let totalRepayments = new Prisma.Decimal(0);

    for (const b of borrowings) {
      if (b.status !== "DRAFT" && b.status !== "CANCELLED") {
        totalPrincipal = totalPrincipal.add(b.principalAmount);
        totalOutstanding = totalOutstanding.add(b.outstandingPrincipal);
      }
      for (const evt of b.financialEvents) {
        if (evt.eventType === "INTEREST_ACCRUED") totalInterestAccrued = totalInterestAccrued.add(evt.interestAmount);
        if (evt.eventType === "REPAYMENT" || evt.eventType === "EMI_PAYMENT") totalRepayments = totalRepayments.add(evt.principalAmount);
      }
    }

    for (const l of liabilities) {
      if (l.status !== "DRAFT") {
        totalPrincipal = totalPrincipal.add(l.principalAmount);
        totalOutstanding = totalOutstanding.add(l.outstandingAmount);
      }
      for (const evt of l.financialEvents) {
        if (evt.eventType === "INTEREST_ACCRUED") totalInterestAccrued = totalInterestAccrued.add(evt.interestAmount);
        if (evt.eventType === "REPAYMENT" || evt.eventType === "SETTLEMENT") totalRepayments = totalRepayments.add(evt.principalAmount);
      }
    }

    return {
      householdId,
      totalPrincipal,
      totalOutstanding,
      totalInterestAccrued,
      totalRepayments,
      liabilitiesCount: borrowings.length + liabilities.length,
      borrowings,
      liabilities,
    };
  }

  /**
   * 8. Goal Progress Report
   */
  static async getGoalReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ) {
    const goals = await db.goal.findMany({
      where: { householdId, status: { not: "ARCHIVED" } },
    });

    const now = new Date();

    const reportGoals = goals.map((goal) => {
      const target = goal.targetAmount;
      const current = goal.currentAmount;
      const remaining = target.sub(current).gte(0) ? target.sub(current) : new Prisma.Decimal(0);
      const completionPercentage = target.gt(0) ? current.div(target).mul(100).toNumber() : 0;

      // Calculate remaining months
      const targetDate = new Date(goal.targetDate);
      const monthsDiff = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
      const remainingMonths = Math.max(1, monthsDiff);
      const requiredMonthlyContribution = remaining.div(remainingMonths);

      return {
        id: goal.id,
        name: goal.name,
        targetAmount: target,
        currentAmount: current,
        remainingAmount: remaining,
        completionPercentage: Number(completionPercentage.toFixed(2)),
        targetDate: goal.targetDate,
        requiredMonthlyContribution,
        status: goal.status,
      };
    });

    return {
      householdId,
      goals: reportGoals,
      totalGoalsCount: goals.length,
    };
  }

  /**
   * 9. Summary Dashboard Report
   */
  static async getSummaryReport(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string,
    filter?: ReportDateFilter
  ) {
    const netWorth = await this.getNetWorthReport(db, householdId);
    const incomeStatement = await this.getIncomeStatementReport(db, householdId, filter);
    const cashFlow = await this.getCashFlowReport(db, householdId, filter);
    const investments = await this.getInvestmentReport(db, householdId);
    const goals = await this.getGoalReport(db, householdId);

    return {
      householdId,
      netWorth: netWorth.netWorth,
      totalAssets: netWorth.totalAssets,
      totalLiabilities: netWorth.totalLiabilities,
      grossIncome: incomeStatement.totalGrossIncome,
      totalExpenses: incomeStatement.totalExpenses,
      netSavings: incomeStatement.netSavings,
      netCashFlow: cashFlow.totalNetCashFlow,
      totalInvestmentReturn: investments.totalReturn,
      activeGoalsCount: goals.totalGoalsCount,
    };
  }

  /**
   * 10. Ledger Equality Invariant Verification
   * Ledger-derived balance === Account.balance === Report-derived balance
   */
  static async validateLedgerEquality(
    db: Prisma.TransactionClient | PrismaClient,
    householdId: string
  ): Promise<{ valid: boolean; accounts: { id: string; name: string; accountBalance: number; ledgerBalance: number; diff: number }[] }> {
    const accounts = await db.account.findMany({
      where: { householdId, isArchived: false },
    });

    const results = [];
    let allValid = true;

    for (const acc of accounts) {
      const journalEntries = await db.journalEntry.findMany({
        where: { accountId: acc.id, journal: { status: "POSTED" } },
      });

      const totalDebits = journalEntries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const totalCredits = journalEntries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));

      const isAsset = ["BANK", "CASH", "INVESTMENT"].includes(acc.type.toUpperCase());
      const ledgerDerivedBalance = isAsset ? totalDebits.sub(totalCredits) : totalCredits.sub(totalDebits);

      const diff = acc.balance.sub(ledgerDerivedBalance).abs().toNumber();
      const isAccountValid = diff < 0.01;

      if (!isAccountValid) allValid = false;

      results.push({
        id: acc.id,
        name: acc.name,
        accountBalance: acc.balance.toNumber(),
        ledgerBalance: ledgerDerivedBalance.toNumber(),
        diff,
      });
    }

    return {
      valid: allValid,
      accounts: results,
    };
  }
}
