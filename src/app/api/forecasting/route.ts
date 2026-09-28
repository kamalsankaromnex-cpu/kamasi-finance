import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const scenario = await prisma.forecastScenario.findFirst({
      where: { householdId: session.householdId, isDefault: true },
      include: { milestones: true },
    });
    return NextResponse.json(scenario);
  } catch (error) {
    console.error("Failed to fetch forecast scenario:", error);
    return NextResponse.json({ error: "Failed to fetch forecast scenario" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { scenarioId, name, targetYear, estimatedCost, type } = body;

    if (!name || !targetYear || estimatedCost === undefined) {
      return NextResponse.json({ error: "Missing required milestone fields" }, { status: 400 });
    }

    let defaultScenarioId = scenarioId;
    if (!defaultScenarioId) {
      const scenario = await prisma.forecastScenario.findFirst({
        where: { householdId: session.householdId },
      });
      defaultScenarioId = scenario?.id;
    }

    if (!defaultScenarioId) {
      return NextResponse.json({ error: "No forecast scenario found for household" }, { status: 404 });
    }

    const scenario = await prisma.forecastScenario.findFirst({
      where: { id: defaultScenarioId, householdId: session.householdId },
      select: { id: true },
    });
    if (!scenario) {
      return NextResponse.json({ error: "Forecast scenario not found" }, { status: 404 });
    }

    const milestone = await prisma.forecastMilestone.create({
      data: {
        scenarioId: scenario.id,
        name,
        targetYear: Number(targetYear),
        estimatedCost: new Prisma.Decimal(estimatedCost),
        type: type || "EXPENSE",
      },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error("Failed to create milestone:", error);
    return NextResponse.json({ error: "Failed to create milestone" }, { status: 500 });
  }
}
