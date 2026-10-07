import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { scenarioId, name, targetYear, estimatedCost, type = "EXPENSE" } = body;

    if (!name || !targetYear || estimatedCost === undefined) {
      return NextResponse.json({ error: "Missing required milestone assumption fields" }, { status: 400 });
    }

    let targetScenarioId = scenarioId;
    if (!targetScenarioId) {
      const scenario = await prisma.forecastScenario.findFirst({
        where: { householdId: session.householdId, isDefault: true },
      });
      targetScenarioId = scenario?.id;
    }

    if (!targetScenarioId) {
      return NextResponse.json({ error: "No forecast scenario found" }, { status: 404 });
    }

    const milestone = await prisma.forecastMilestone.create({
      data: {
        scenarioId: targetScenarioId,
        name,
        targetYear: Number(targetYear),
        estimatedCost: new Prisma.Decimal(estimatedCost),
        type,
      },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error("Failed to create forecast assumption:", error);
    return NextResponse.json({ error: "Failed to create forecast assumption" }, { status: 500 });
  }
}
