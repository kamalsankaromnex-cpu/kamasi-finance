import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    let dbScenario = await prisma.forecastScenario.findFirst({
      where: { householdId: session.householdId, type: scenarioType },
      include: { milestones: true },
    });

    if (!dbScenario) {
      dbScenario = await prisma.forecastScenario.findFirst({
        where: { householdId: session.householdId, isDefault: true },
        include: { milestones: true },
      });
    }

    const scenarioConfig = dbScenario
      ? {
          id: dbScenario.id,
          householdId: session.householdId,
          name: dbScenario.name,
          type: (dbScenario.type || "BASELINE") as ScenarioType,
          isDefault: dbScenario.isDefault,
          startYear: dbScenario.startYear,
          endYear: dbScenario.endYear,
          horizonMonths: dbScenario.horizonMonths,
          incomeGrowthRate: Number(dbScenario.incomeGrowthRate),
          expenseInflationRate: Number(dbScenario.expenseInflationRate),
          investmentReturnRate: Number(dbScenario.investmentReturnRate),
          assetGrowthRate: Number(dbScenario.assetGrowthRate),
          assumptionsVersion: dbScenario.assumptionsVersion,
        }
      : FinancialForecastingService.getPresetScenario(session.householdId, scenarioType);

    const forecastResult = await FinancialForecastingService.runForecast({
      householdId: session.householdId,
      startDate: new Date().toISOString().split("T")[0],
      horizonMonths,
      scenario: scenarioConfig,
      customMilestones: (dbScenario?.milestones || []).map((m) => ({
        name: m.name,
        targetYear: m.targetYear,
        estimatedCost: Number(m.estimatedCost),
        type: m.type as "EXPENSE" | "INCOME_BOOST" | "RETIREMENT",
      })),
    });

    return NextResponse.json({
      scenario: scenarioConfig,
      forecast: forecastResult,
    });
  } catch (error) {
    console.error("Failed to calculate forecast:", error);
    return NextResponse.json({ error: "Failed to calculate forecast" }, { status: 500 });
  }
}
