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

    const scenarioConfig = FinancialForecastingService.getPresetScenario(session.householdId, scenarioType);
    const forecast = await FinancialForecastingService.runForecast({
      householdId: session.householdId,
      startDate: new Date().toISOString().split("T")[0],
      horizonMonths: 12,
      scenario: scenarioConfig,
    });

    return NextResponse.json({
      scenarioType: forecast.scenarioType,
      calculationId: forecast.calculationId,
      goals: forecast.goals,
    });
  } catch (error) {
    console.error("Failed to fetch forecast goals:", error);
    return NextResponse.json({ error: "Failed to fetch forecast goals" }, { status: 500 });
  }
}
