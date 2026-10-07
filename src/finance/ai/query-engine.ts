import { prisma } from "@/lib/prisma";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { FinancialForecastingService, ScenarioType } from "@/finance/forecasting/forecasting.service";
import crypto from "crypto";

export interface FinancialQueryResult<T> {
  queryId: string;
  generatedAt: string;
  period?: { from: string; to: string };
  currency: string;
  data: T;
  source: "ledger" | "reporting" | "forecast";
}

export class FinancialQueryEngine {
  private static generateQueryId(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
  }

  /**
   * 1. Spending Analysis Query
   */
  public static async getSpendingAnalysis(
    householdId: string,
    params: { from?: string; to?: string; period?: string }
  ): Promise<FinancialQueryResult<any>> {
    const reportFilter = {
      ...(params.from ? { from: new Date(params.from) } : {}),
      ...(params.to ? { to: new Date(params.to) } : {}),
      ...(params.period ? { period: params.period as any } : {}),
    };
    const report = await FinancialReportingService.getExpenseAnalysisReport(prisma, householdId, reportFilter);
    return {
      queryId: this.generateQueryId("qry_exp"),
      generatedAt: new Date().toISOString(),
      period: params.from && params.to ? { from: params.from, to: params.to } : undefined,
      currency: "INR",
      data: report,
      source: "reporting",
    };
  }

  /**
   * 2. Income Summary Query
   */
  public static async getIncomeSummary(
    householdId: string,
    params: { from?: string; to?: string }
  ): Promise<FinancialQueryResult<any>> {
    const reportFilter = {
      ...(params.from ? { from: new Date(params.from) } : {}),
      ...(params.to ? { to: new Date(params.to) } : {}),
    };
    const report = await FinancialReportingService.getIncomeStatementReport(prisma, householdId, reportFilter);
    return {
      queryId: this.generateQueryId("qry_inc"),
      generatedAt: new Date().toISOString(),
      period: params.from && params.to ? { from: params.from, to: params.to } : undefined,
      currency: "INR",
      data: {
        totalIncome: report.totalGrossIncome,
        incomeByCategory: report.incomeByCategory,
        incomeStreamCount: Object.keys(report.incomeByCategory || {}).length,
      },
      source: "reporting",
    };
  }

  /**
   * 3. Goal Status Query
   */
  public static async getGoalStatus(householdId: string): Promise<FinancialQueryResult<any>> {
    const report = await FinancialReportingService.getGoalReport(prisma, householdId);
    return {
      queryId: this.generateQueryId("qry_goal"),
      generatedAt: new Date().toISOString(),
      currency: "INR",
      data: report,
      source: "reporting",
    };
  }

  /**
   * 4. Liability Summary Query
   */
  public static async getLiabilitySummary(householdId: string): Promise<FinancialQueryResult<any>> {
    const report = await FinancialReportingService.getLiabilityReport(prisma, householdId);
    return {
      queryId: this.generateQueryId("qry_liab"),
      generatedAt: new Date().toISOString(),
      currency: "INR",
      data: report,
      source: "reporting",
    };
  }

  /**
   * 5. Investment Performance Query
   */
  public static async getInvestmentPerformance(householdId: string): Promise<FinancialQueryResult<any>> {
    const report = await FinancialReportingService.getInvestmentReport(prisma, householdId);
    return {
      queryId: this.generateQueryId("qry_inv"),
      generatedAt: new Date().toISOString(),
      currency: "INR",
      data: report,
      source: "reporting",
    };
  }

  /**
   * 6. Net Worth Analysis Query
   */
  public static async getNetWorthAnalysis(
    householdId: string,
    params: { scenarioType?: string }
  ): Promise<FinancialQueryResult<any>> {
    const netWorthReport = await FinancialReportingService.getNetWorthReport(prisma, householdId);
    const scenarioType = (params.scenarioType || "BASELINE").toUpperCase() as ScenarioType;
    const scenarioConfig = FinancialForecastingService.getPresetScenario(householdId, scenarioType);

    const forecast = await FinancialForecastingService.runForecast({
      householdId,
      startDate: new Date().toISOString().split("T")[0],
      horizonMonths: 12,
      scenario: scenarioConfig,
    });

    return {
      queryId: this.generateQueryId("qry_nw"),
      generatedAt: new Date().toISOString(),
      currency: "INR",
      data: {
        currentNetWorth: netWorthReport.netWorth,
        totalCurrentAssets: netWorthReport.totalAssets,
        totalCurrentLiabilities: netWorthReport.totalLiabilities,
        projected3MonthNetWorth: forecast.summary.netWorth3Month,
        projected6MonthNetWorth: forecast.summary.netWorth6Month,
        projected12MonthNetWorth: forecast.summary.netWorth12Month,
        scenarioType,
      },
      source: "forecast",
    };
  }

  /**
   * 7. Scenario Simulation Query (Reuses Phase 3.6 Forecasting Engine)
   */
  public static async runScenarioSimulation(
    householdId: string,
    params: { salaryGrowth?: number; inflation?: number; horizonMonths?: number }
  ): Promise<FinancialQueryResult<any>> {
    const scenario = FinancialForecastingService.getPresetScenario(householdId, "CUSTOM");
    if (params.salaryGrowth !== undefined) scenario.incomeGrowthRate = params.salaryGrowth;
    if (params.inflation !== undefined) scenario.expenseInflationRate = params.inflation;

    const horizonMonths = params.horizonMonths || 12;
    const forecast = await FinancialForecastingService.runForecast({
      householdId,
      startDate: new Date().toISOString().split("T")[0],
      horizonMonths,
      scenario,
    });

    return {
      queryId: this.generateQueryId("qry_sim"),
      generatedAt: new Date().toISOString(),
      currency: "INR",
      data: {
        simulationParameters: {
          salaryGrowth: scenario.incomeGrowthRate,
          expenseInflation: scenario.expenseInflationRate,
          horizonMonths,
        },
        projectedEndingNetWorth: forecast.summary.endingNetWorth,
        projectedSurplus: forecast.summary.netProjectedSurplus,
        monthlyCashFlows: forecast.cashFlows.map((c) => ({
          date: c.date,
          income: c.totalIncome,
          expenses: c.totalExpenses,
          closingCash: c.closingCash,
        })),
      },
      source: "forecast",
    };
  }
}
