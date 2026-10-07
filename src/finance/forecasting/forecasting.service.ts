import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export type ScenarioType = "BASELINE" | "CONSERVATIVE" | "OPTIMISTIC" | "CUSTOM";

export interface ForecastScenarioConfig {
  id?: string;
  householdId: string;
  name: string;
  type: ScenarioType;
  isDefault: boolean;
  startYear: number;
  endYear: number;
  horizonMonths: number;
  incomeGrowthRate: number;     // e.g. 5.0 (%)
  expenseInflationRate: number; // e.g. 6.0 (%)
  investmentReturnRate: number; // e.g. 10.0 (%)
  assetGrowthRate: number;      // e.g. 5.0 (%)
  assumptionsVersion: number;
  notes?: string;
}

export interface ForecastInput {
  householdId: string;
  startDate: string; // ISO YYYY-MM-DD
  horizonMonths: number;
  scenario: ForecastScenarioConfig;
  customMilestones?: Array<{
    name: string;
    targetYear: number;
    estimatedCost: number;
    type: "EXPENSE" | "INCOME_BOOST" | "RETIREMENT";
  }>;
}

export interface ForecastMonthCashFlow {
  monthIndex: number;
  date: string; // YYYY-MM
  actualIncome: number;
  plannedIncome: number;
  forecastIncome: number;
  totalIncome: number;

  actualExpenses: number;
  plannedExpenses: number;
  forecastExpenses: number;
  totalExpenses: number;

  liabilityPayments: number;
  investmentCashFlow: number;
  netCashFlow: number;
  openingCash: number;
  closingCash: number;
}

export interface ForecastGoalResult {
  goalId: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  targetDate: string;
  status: string;
  expectedPlannedContributions: number;
  projectedShortfall: number;
  requiredMonthlyContribution: number;
  isAchieved: boolean;
  isPastTargetDate: boolean;
  projectedCompletionDate?: string;
}

export interface ForecastLiabilityResult {
  liabilityId: string;
  name: string;
  category: string;
  initialOutstanding: number;
  projectedClosingOutstanding: number;
  monthlyEmi: number;
  totalSimulatedInterest: number;
  totalSimulatedPrincipalPaid: number;
  projectedSettlementMonth?: string;
}

export interface ForecastInvestmentResult {
  investmentId: string;
  name: string;
  type: string;
  currentMarketValue: number;
  costBasis: number;
  unrealizedGainLoss: number;
  realizedGainLoss: number;
  forecastReturnRate: number;
  forecastValuation: number;
  forecastGainLoss: number;
}

export interface ForecastNetWorthMonth {
  monthIndex: number;
  date: string;
  projectedCash: number;
  projectedPhysicalAssets: number;
  projectedInvestments: number;
  totalProjectedAssets: number;
  projectedLiabilities: number;
  projectedNetWorth: number;
}

export interface ForecastResult {
  calculationId: string;
  householdId: string;
  scenarioType: ScenarioType;
  assumptionsVersion: number;
  startDate: string;
  horizonMonths: number;
  cashFlows: ForecastMonthCashFlow[];
  goals: ForecastGoalResult[];
  liabilities: ForecastLiabilityResult[];
  investments: ForecastInvestmentResult[];
  netWorthTrajectory: ForecastNetWorthMonth[];
  summary: {
    startingNetWorth: number;
    endingNetWorth: number;
    netWorthChange: number;
    totalProjectedIncome: number;
    totalProjectedExpenses: number;
    netProjectedSurplus: number;
    netWorth3Month: number;
    netWorth6Month: number;
    netWorth12Month: number;
  };
}

export interface GoalFundingInput {
  targetAmount: number;
  currentAvailable: number;
  monthlyContribution: number;
  targetDate: string | Date;
  startDate?: string | Date; // Defaults to now
}

export interface GoalFundingOptions {
  saveMore: {
    additionalMonthlySaving: number;
    totalMonthlySavingNeeded: number;
    monthsRemaining: number;
    message: string;
  };
  considerInvesting: {
    message: string;
    disclaimer: string;
  };
  extendDate: {
    monthsToExtend: number | null;
    projectedTargetDate: string | null;
    message: string;
  };
  considerBorrowing: {
    message: string;
    obligationWarning: string;
  };
}

export interface GoalFundingResult {
  targetAmount: number;
  currentAvailable: number;
  monthlyContribution: number;
  targetDate: string;
  startDate: string;
  monthsRemaining: number;
  initialGap: number;
  projectedOwnFunding: number;
  projectedGap: number;
  projectedSurplus: number;
  status: "ON_TRACK" | "FUNDING_GAP";
  isAchievable: boolean;
  decisionMessage: string;
  options?: GoalFundingOptions;
}

export class FinancialForecastingService {
  /**
   * 1. Deterministic Calculation ID Generator (SHA-256)
   */
  public static generateCalculationId(input: ForecastInput): string {
    const canonicalPayload = JSON.stringify({
      householdId: input.householdId,
      startDate: input.startDate,
      horizonMonths: input.horizonMonths,
      scenario: {
        type: input.scenario.type,
        incomeGrowthRate: input.scenario.incomeGrowthRate,
        expenseInflationRate: input.scenario.expenseInflationRate,
        investmentReturnRate: input.scenario.investmentReturnRate,
        assetGrowthRate: input.scenario.assetGrowthRate,
        assumptionsVersion: input.scenario.assumptionsVersion,
      },
      customMilestones: (input.customMilestones || []).map((m) => ({
        name: m.name,
        targetYear: m.targetYear,
        estimatedCost: m.estimatedCost,
        type: m.type,
      })),
    });

    return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
  }

  /**
   * Default Preset Scenarios Generator
   */
  public static getPresetScenario(householdId: string, type: ScenarioType): ForecastScenarioConfig {
    switch (type) {
      case "CONSERVATIVE":
        return {
          householdId,
          name: "Conservative Scenario",
          type: "CONSERVATIVE",
          isDefault: false,
          startYear: 2026,
          endYear: 2050,
          horizonMonths: 12,
          incomeGrowthRate: 0.0,
          expenseInflationRate: 8.0,
          investmentReturnRate: 5.0,
          assetGrowthRate: 3.0,
          assumptionsVersion: 1,
        };
      case "OPTIMISTIC":
        return {
          householdId,
          name: "Optimistic Scenario",
          type: "OPTIMISTIC",
          isDefault: false,
          startYear: 2026,
          endYear: 2050,
          horizonMonths: 12,
          incomeGrowthRate: 8.0,
          expenseInflationRate: 4.0,
          investmentReturnRate: 12.0,
          assetGrowthRate: 7.0,
          assumptionsVersion: 1,
        };
      case "CUSTOM":
        return {
          householdId,
          name: "Custom Scenario",
          type: "CUSTOM",
          isDefault: false,
          startYear: 2026,
          endYear: 2050,
          horizonMonths: 12,
          incomeGrowthRate: 5.0,
          expenseInflationRate: 6.0,
          investmentReturnRate: 10.0,
          assetGrowthRate: 5.0,
          assumptionsVersion: 1,
        };
      case "BASELINE":
      default:
        return {
          householdId,
          name: "Baseline Scenario",
          type: "BASELINE",
          isDefault: true,
          startYear: 2026,
          endYear: 2050,
          horizonMonths: 12,
          incomeGrowthRate: 5.0,
          expenseInflationRate: 6.0,
          investmentReturnRate: 10.0,
          assetGrowthRate: 5.0,
          assumptionsVersion: 1,
        };
    }
  }

  /**
   * 2. Core Forecast Engine Execution (Strictly Read-Only)
   */
  public static async runForecast(input: ForecastInput): Promise<ForecastResult> {
    const calculationId = this.generateCalculationId(input);
    const horizonMonths = Math.max(1, Math.min(120, input.horizonMonths || 12));
    const startDate = new Date(input.startDate || new Date().toISOString().split("T")[0]);

    // Read initial accounts balance (cash liquid)
    const accounts = await prisma.account.findMany({
      where: { householdId: input.householdId },
      select: { id: true, balance: true, type: true, isArchived: true },
    });

    const activeAccounts = accounts.filter((a) => !a.isArchived);
    const liquidOpeningCash = activeAccounts
      .filter((a) => ["BANK", "CASH", "SAVINGS", "CHECKING"].includes(a.type.toUpperCase()))
      .reduce((sum, a) => sum + Number(a.balance), 0);

    // Read income sources (PLANNED / FORECAST)
    const incomeSources = await prisma.incomeSource.findMany({
      where: { householdId: input.householdId, isActive: true },
      select: { id: true, expectedAmount: true, behavior: true, frequency: true },
    });

    const monthlyBaselineIncome = incomeSources.reduce((sum, s) => {
      const amt = Number(s.expectedAmount || 0);
      const freq = (s.frequency || "MONTHLY").toUpperCase();
      if (freq === "WEEKLY") return sum + amt * 4.33;
      if (freq === "QUARTERLY") return sum + amt / 3;
      if (freq === "YEARLY") return sum + amt / 12;
      return sum + amt; // MONTHLY or default
    }, 0);

    // Read recurring expenses (PLANNED / FORECAST)
    const recurringBills = await prisma.recurringTransaction.findMany({
      where: { householdId: input.householdId, isActive: true },
      select: { id: true, amount: true, frequency: true, type: true },
    });

    const monthlyBaselineExpense = recurringBills
      .filter((r) => r.type === "EXPENSE")
      .reduce((sum, r) => {
        const amt = Number(r.amount || 0);
        const freq = (r.frequency || "MONTHLY").toUpperCase();
        if (freq === "WEEKLY") return sum + amt * 4.33;
        if (freq === "QUARTERLY") return sum + amt / 3;
        if (freq === "YEARLY") return sum + amt / 12;
        return sum + amt;
      }, 0);

    // Read Goals
    const goals = await prisma.goal.findMany({
      where: { householdId: input.householdId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        currentAmount: true,
        targetDate: true,
        status: true,
      },
    });

    // Read Borrowings & Liabilities (Single authoritative source: active borrowings + unmigrated liabilities)
    const borrowings = await prisma.borrowing.findMany({
      where: { householdId: input.householdId, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
      select: {
        id: true,
        name: true,
        borrowingType: true,
        outstandingPrincipal: true,
        principalAmount: true,
        interestRate: true,
      },
    });

    const legacyLiabilities = await prisma.liability.findMany({
      where: { householdId: input.householdId, borrowing: null, status: { in: ["ACTIVE", "PARTIALLY_SETTLED"] } },
      select: {
        id: true,
        name: true,
        category: true,
        outstandingAmount: true,
        principalAmount: true,
        interestRate: true,
      },
    });

    const allDebts = [
      ...borrowings.map((b) => ({
        id: b.id,
        name: b.name,
        category: b.borrowingType,
        outstandingAmount: b.outstandingPrincipal,
        principalAmount: b.principalAmount,
        interestRate: b.interestRate,
      })),
      ...legacyLiabilities.map((l) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        outstandingAmount: l.outstandingAmount,
        principalAmount: l.principalAmount,
        interestRate: l.interestRate,
      })),
    ];

    // Read Assets
    const assets = await prisma.asset.findMany({
      where: { householdId: input.householdId, status: "ACTIVE" },
      select: { id: true, name: true, category: true, initialValue: true, currentValue: true },
    });

    // Read Investments
    const investments = await prisma.investment.findMany({
      where: { householdId: input.householdId, status: { in: ["ACTIVE", "PARTIALLY_SOLD"] } },
      select: {
        id: true,
        name: true,
        type: true,
        currentMarketValue: true,
        totalCostBasis: true,
        realizedGainLoss: true,
      },
    });

    // Monthly Growth Factors (compounded)
    const monthlyIncomeGrowth = Math.pow(1 + input.scenario.incomeGrowthRate / 100, 1 / 12) - 1;
    const monthlyExpenseInflation = Math.pow(1 + input.scenario.expenseInflationRate / 100, 1 / 12) - 1;
    const monthlyReturnRate = Math.pow(1 + input.scenario.investmentReturnRate / 100, 1 / 12) - 1;
    const monthlyAssetGrowth = Math.pow(1 + input.scenario.assetGrowthRate / 100, 1 / 12) - 1;

    let currentCash = liquidOpeningCash;
    let currentPhysicalAssetsVal = assets.reduce((sum, a) => sum + Number(a.currentValue ?? a.initialValue ?? 0), 0);
    let currentInvestmentsVal = investments.reduce((sum, inv) => sum + Number(inv.currentMarketValue), 0);

    const cashFlows: ForecastMonthCashFlow[] = [];
    const netWorthTrajectory: ForecastNetWorthMonth[] = [];

    // Simulate Liabilities in memory
    const simulatedLiabilities = allDebts.map((l) => {
      const outstanding = Number(l.outstandingAmount);
      const rate = Number(l.interestRate) / 100;
      // Approximate 20-year EMI or 5% monthly principal paydown
      const emi = Math.max(1000, Math.round((outstanding * (1 + rate)) / 120));
      return {
        id: l.id,
        name: l.name,
        category: l.category,
        initialOutstanding: outstanding,
        currentOutstanding: outstanding,
        rate,
        emi,
        totalSimulatedInterest: 0,
        totalSimulatedPrincipalPaid: 0,
        settlementMonth: undefined as string | undefined,
      };
    });

    for (let m = 0; m < horizonMonths; m++) {
      const mDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
      const dateStr = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, "0")}`;

      const projectedInc = Math.round(monthlyBaselineIncome * Math.pow(1 + monthlyIncomeGrowth, m));
      const projectedExp = Math.round(monthlyBaselineExpense * Math.pow(1 + monthlyExpenseInflation, m));

      // Calculate simulated liability EMI payments for the month
      let monthLiabilityPayments = 0;
      simulatedLiabilities.forEach((sl) => {
        if (sl.currentOutstanding > 0) {
          const monthlyInterest = sl.currentOutstanding * (sl.rate / 12);
          const payment = Math.min(sl.emi, sl.currentOutstanding + monthlyInterest);
          const principalPaid = Math.max(0, payment - monthlyInterest);

          sl.totalSimulatedInterest += monthlyInterest;
          sl.totalSimulatedPrincipalPaid += principalPaid;
          sl.currentOutstanding = Math.max(0, sl.currentOutstanding - principalPaid);
          monthLiabilityPayments += payment;

          if (sl.currentOutstanding === 0 && !sl.settlementMonth) {
            sl.settlementMonth = dateStr;
          }
        }
      });

      const netCash = projectedInc - projectedExp - monthLiabilityPayments;
      const openingCash = currentCash;
      currentCash = Math.max(0, currentCash + netCash);

      // Appreciate physical assets and investments
      currentPhysicalAssetsVal = Math.round(currentPhysicalAssetsVal * (1 + monthlyAssetGrowth));
      currentInvestmentsVal = Math.round(currentInvestmentsVal * (1 + monthlyReturnRate));

      const totalSimulatedLiabilities = simulatedLiabilities.reduce((sum, sl) => sum + sl.currentOutstanding, 0);
      const totalProjectedAssets = currentCash + currentPhysicalAssetsVal + currentInvestmentsVal;
      const projectedNetWorth = totalProjectedAssets - totalSimulatedLiabilities;

      cashFlows.push({
        monthIndex: m + 1,
        date: dateStr,
        actualIncome: m === 0 ? projectedInc * 0.2 : 0,
        plannedIncome: m === 0 ? projectedInc * 0.8 : projectedInc,
        forecastIncome: m > 0 ? projectedInc : 0,
        totalIncome: projectedInc,
        actualExpenses: m === 0 ? projectedExp * 0.2 : 0,
        plannedExpenses: m === 0 ? projectedExp * 0.8 : projectedExp,
        forecastExpenses: m > 0 ? projectedExp : 0,
        totalExpenses: projectedExp,
        liabilityPayments: monthLiabilityPayments,
        investmentCashFlow: 0,
        netCashFlow: netCash,
        openingCash,
        closingCash: currentCash,
      });

      netWorthTrajectory.push({
        monthIndex: m + 1,
        date: dateStr,
        projectedCash: currentCash,
        projectedPhysicalAssets: currentPhysicalAssetsVal,
        projectedInvestments: currentInvestmentsVal,
        totalProjectedAssets,
        projectedLiabilities: totalSimulatedLiabilities,
        projectedNetWorth,
      });
    }

    // Goal Projections Analysis
    const goalResults: ForecastGoalResult[] = goals.map((g) => {
      const target = Number(g.targetAmount);
      const current = Number(g.currentAmount);
      const remaining = Math.max(0, target - current);

      const targetDateObj = new Date(g.targetDate);
      const now = new Date();
      const monthsLeft = Math.max(1, Math.ceil((targetDateObj.getTime() - now.getTime()) / (1000 * 3600 * 24 * 30.44)));

      const requiredMonthlyContribution = remaining > 0 ? Math.ceil(remaining / monthsLeft) : 0;
      const expectedPlannedContributions = requiredMonthlyContribution * monthsLeft;
      const projectedShortfall = Math.max(0, remaining - expectedPlannedContributions);

      const isAchieved = remaining === 0 || g.status === "COMPLETED";
      const isPastTargetDate = targetDateObj < now;

      let projectedCompletionDate: string | undefined = undefined;
      if (requiredMonthlyContribution > 0 && remaining > 0) {
        const monthsNeeded = Math.ceil(remaining / requiredMonthlyContribution);
        const compDate = new Date(now.getFullYear(), now.getMonth() + monthsNeeded, 1);
        projectedCompletionDate = compDate.toISOString().split("T")[0];
      }

      return {
        goalId: g.id,
        goalName: g.name,
        targetAmount: target,
        currentAmount: current,
        remainingAmount: remaining,
        targetDate: g.targetDate.toISOString().split("T")[0],
        status: g.status,
        expectedPlannedContributions,
        projectedShortfall,
        requiredMonthlyContribution,
        isAchieved,
        isPastTargetDate,
        projectedCompletionDate,
      };
    });

    // Liability Projections Output
    const liabilityResults: ForecastLiabilityResult[] = simulatedLiabilities.map((sl) => ({
      liabilityId: sl.id,
      name: sl.name,
      category: sl.category,
      initialOutstanding: sl.initialOutstanding,
      projectedClosingOutstanding: Math.round(sl.currentOutstanding),
      monthlyEmi: sl.emi,
      totalSimulatedInterest: Math.round(sl.totalSimulatedInterest),
      totalSimulatedPrincipalPaid: Math.round(sl.totalSimulatedPrincipalPaid),
      projectedSettlementMonth: sl.settlementMonth,
    }));

    // Investment Projections Output
    const investmentResults: ForecastInvestmentResult[] = investments.map((inv) => {
      const currentVal = Number(inv.currentMarketValue);
      const costBasis = Number(inv.totalCostBasis);
      const unrealized = currentVal - costBasis;
      const realized = Number(inv.realizedGainLoss || 0);
      const forecastValuation = Math.round(currentVal * Math.pow(1 + input.scenario.investmentReturnRate / 100, horizonMonths / 12));
      const forecastGainLoss = forecastValuation - currentVal;

      return {
        investmentId: inv.id,
        name: inv.name,
        type: inv.type,
        currentMarketValue: currentVal,
        costBasis,
        unrealizedGainLoss: unrealized,
        realizedGainLoss: realized,
        forecastReturnRate: input.scenario.investmentReturnRate,
        forecastValuation,
        forecastGainLoss,
      };
    });

    const startNW = netWorthTrajectory.length > 0 ? netWorthTrajectory[0].projectedNetWorth : 0;
    const endNW = netWorthTrajectory.length > 0 ? netWorthTrajectory[netWorthTrajectory.length - 1].projectedNetWorth : 0;

    const nw3 = netWorthTrajectory.length >= 3 ? netWorthTrajectory[2].projectedNetWorth : endNW;
    const nw6 = netWorthTrajectory.length >= 6 ? netWorthTrajectory[5].projectedNetWorth : endNW;
    const nw12 = netWorthTrajectory.length >= 12 ? netWorthTrajectory[11].projectedNetWorth : endNW;

    const totalInc = cashFlows.reduce((sum, c) => sum + c.totalIncome, 0);
    const totalExp = cashFlows.reduce((sum, c) => sum + c.totalExpenses, 0);

    return {
      calculationId,
      householdId: input.householdId,
      scenarioType: input.scenario.type,
      assumptionsVersion: input.scenario.assumptionsVersion,
      startDate: startDate.toISOString().split("T")[0],
      horizonMonths,
      cashFlows,
      goals: goalResults,
      liabilities: liabilityResults,
      investments: investmentResults,
      netWorthTrajectory,
      summary: {
        startingNetWorth: startNW,
        endingNetWorth: endNW,
        netWorthChange: endNW - startNW,
        totalProjectedIncome: totalInc,
        totalProjectedExpenses: totalExp,
        netProjectedSurplus: totalInc - totalExp,
        netWorth3Month: nw3,
        netWorth6Month: nw6,
        netWorth12Month: nw12,
      },
    };
  }

  /**
   * Save Forecast Snapshot to Database
   */
  public static async saveSnapshot(result: ForecastResult, scenarioId: string): Promise<any> {
    return prisma.forecastSnapshot.upsert({
      where: { calculationId: result.calculationId },
      update: {
        resultJson: JSON.stringify(result),
        generatedAt: new Date(),
      },
      create: {
        householdId: result.householdId,
        scenarioId,
        calculationId: result.calculationId,
        startDate: new Date(result.startDate),
        horizonMonths: result.horizonMonths,
        assumptionsVersion: result.assumptionsVersion,
        resultJson: JSON.stringify(result),
      },
    });
  }

  /**
   * Verification Test Helper: Assert Zero Database Ledger Mutations
   */
  public static async assertLedgerImmutability(householdId: string, runAction: () => Promise<any>): Promise<boolean> {
    const beforeAccounts = await prisma.account.findMany({ where: { householdId } });
    const beforeJournalsCount = await prisma.journal.count({ where: { householdId } });
    const beforeJournalEntriesCount = await prisma.journalEntry.count({
      where: { journal: { householdId } },
    });
    const beforeTransactionsCount = await prisma.transaction.count({ where: { householdId } });

    await runAction();

    const afterAccounts = await prisma.account.findMany({ where: { householdId } });
    const afterJournalsCount = await prisma.journal.count({ where: { householdId } });
    const afterJournalEntriesCount = await prisma.journalEntry.count({
      where: { journal: { householdId } },
    });
    const afterTransactionsCount = await prisma.transaction.count({ where: { householdId } });

    if (beforeJournalsCount !== afterJournalsCount) {
      throw new Error(`LEAK DETECTED: Journal count changed from ${beforeJournalsCount} to ${afterJournalsCount}`);
    }
    if (beforeJournalEntriesCount !== afterJournalEntriesCount) {
      throw new Error(`LEAK DETECTED: JournalEntry count changed from ${beforeJournalEntriesCount} to ${afterJournalEntriesCount}`);
    }
    if (beforeTransactionsCount !== afterTransactionsCount) {
      throw new Error(`LEAK DETECTED: Transaction count changed from ${beforeTransactionsCount} to ${afterTransactionsCount}`);
    }

    // Compare account balances
    for (const bAcc of beforeAccounts) {
      const aAcc = afterAccounts.find((a) => a.id === bAcc.id);
      if (!aAcc || Number(aAcc.balance) !== Number(bAcc.balance)) {
        throw new Error(`LEAK DETECTED: Account ${bAcc.id} balance mutated from ${bAcc.balance} to ${aAcc?.balance}`);
      }
    }

    return true;
  }

  /**
   * Goal Funding v1: Lightweight, deterministic funding planning engine.
   * Answers: "Can I reach this Goal with the money I already have and what I can save each month?"
   * Strict Read-Only: No mutations to Ledger, Accounts, Journals, Investments, or Borrowings.
   */
  public static calculateGoalFundingPlan(input: GoalFundingInput): GoalFundingResult {
    const targetAmount = Math.max(0, Number(input.targetAmount) || 0);
    const currentAvailable = Math.max(0, Number(input.currentAvailable) || 0);
    const monthlyContribution = Math.max(0, Number(input.monthlyContribution) || 0);

    const start = input.startDate ? new Date(input.startDate) : new Date();
    const target = new Date(input.targetDate);

    const startYear = start.getFullYear();
    const startMonth = start.getMonth(); // 0-indexed
    const targetYear = target.getFullYear();
    const targetMonth = target.getMonth(); // 0-indexed

    const diffMonths = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    const monthsRemaining = Math.max(1, diffMonths);

    const initialGap = Math.max(0, targetAmount - currentAvailable);
    const projectedOwnFunding = currentAvailable + (monthlyContribution * monthsRemaining);
    const projectedGap = Math.max(0, targetAmount - projectedOwnFunding);
    const projectedSurplus = Math.max(0, projectedOwnFunding - targetAmount);

    const isAchievable = projectedOwnFunding >= targetAmount;

    let options: GoalFundingOptions | undefined = undefined;

    if (!isAchievable) {
      // 1. Save More
      const additionalMonthlySaving = Math.ceil(projectedGap / monthsRemaining);
      const totalMonthlySavingNeeded = monthlyContribution + additionalMonthlySaving;

      // 3. Extend Goal Date
      let monthsToExtend: number | null = null;
      let projectedTargetDate: string | null = null;
      let extendMessage = "Start contributing monthly to project a completion date.";

      if (monthlyContribution > 0) {
        monthsToExtend = Math.ceil(projectedGap / monthlyContribution);
        const extendedDate = new Date(target);
        extendedDate.setMonth(extendedDate.getMonth() + monthsToExtend);
        projectedTargetDate = extendedDate.toISOString().split("T")[0];
        extendMessage = `Extending the goal target date by ${monthsToExtend} month${monthsToExtend === 1 ? "" : "s"} at your current contribution of ₹${monthlyContribution.toLocaleString("en-IN")}/month reaches the goal.`;
      }

      options = {
        saveMore: {
          additionalMonthlySaving,
          totalMonthlySavingNeeded,
          monthsRemaining,
          message: `Save an additional ₹${additionalMonthlySaving.toLocaleString("en-IN")}/month (total ₹${totalMonthlySavingNeeded.toLocaleString("en-IN")}/month for ${monthsRemaining} months) to close the funding gap.`,
        },
        considerInvesting: {
          message: `Your current saving plan has a projected gap of ₹${projectedGap.toLocaleString("en-IN")}. An investment-based funding strategy may help bridge this gap over time.`,
          disclaimer: "Investment returns are subject to market risks and are not guaranteed. Past performance is not indicative of future returns.",
        },
        extendDate: {
          monthsToExtend,
          projectedTargetDate,
          message: extendMessage,
        },
        considerBorrowing: {
          message: `Borrowing can bridge the ₹${projectedGap.toLocaleString("en-IN")} funding gap immediately or as milestone payments come due.`,
          obligationWarning: "Borrowing creates a fixed repayment obligation (EMI) and interest costs. Evaluate your debt service capacity before taking a loan.",
        },
      };
    }

    return {
      targetAmount,
      currentAvailable,
      monthlyContribution,
      targetDate: target.toISOString().split("T")[0],
      startDate: start.toISOString().split("T")[0],
      monthsRemaining,
      initialGap,
      projectedOwnFunding,
      projectedGap,
      projectedSurplus,
      status: isAchievable ? "ON_TRACK" : "FUNDING_GAP",
      isAchievable,
      decisionMessage: isAchievable
        ? "Goal is on track. Your current saving plan may be sufficient. No additional funding strategy is required."
        : `Funding gap of ₹${projectedGap.toLocaleString("en-IN")} projected. Consider the simple funding options below to reach your target.`,
      options,
    };
  }
}

