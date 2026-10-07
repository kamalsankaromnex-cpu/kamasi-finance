import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { FinancialForecastingService, ScenarioType } from "@/finance/forecasting/forecasting.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const scenarioType = (searchParams.get("scenarioType") || "BASELINE").toUpperCase() as ScenarioType;
    const horizonMonths = Number(searchParams.get("horizonMonths") || "12");

    const scenarioConfig = FinancialForecastingService.getPresetScenario(session.householdId, scenarioType);
    const forecast = await FinancialForecastingService.runForecast({
      householdId: session.householdId,
      startDate: new Date().toISOString().split("T")[0],
      horizonMonths,
      scenario: scenarioConfig,
    });

    return NextResponse.json({
      scenarioType: forecast.scenarioType,
      calculationId: forecast.calculationId,
      cashFlows: forecast.cashFlows,
      summary: {
        totalProjectedIncome: forecast.summary.totalProjectedIncome,
        totalProjectedExpenses: forecast.summary.totalProjectedExpenses,
        netProjectedSurplus: forecast.summary.netProjectedSurplus,
      },
    });
  } catch (error) {
    console.error("Failed to fetch forecast cash flow:", error);
    return NextResponse.json({ error: "Failed to fetch forecast cash flow" }, { status: 500 });
  }
}
