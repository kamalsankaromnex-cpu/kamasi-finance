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
      startingNetWorth: forecast.summary.startingNetWorth,
      endingNetWorth: forecast.summary.endingNetWorth,
      netWorth3Month: forecast.summary.netWorth3Month,
      netWorth6Month: forecast.summary.netWorth6Month,
      netWorth12Month: forecast.summary.netWorth12Month,
      trajectory: forecast.netWorthTrajectory,
    });
  } catch (error) {
    console.error("Failed to fetch forecast net worth:", error);
    return NextResponse.json({ error: "Failed to fetch forecast net worth" }, { status: 500 });
  }
}
