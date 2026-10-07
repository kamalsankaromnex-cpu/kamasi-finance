import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const scenarios = await prisma.forecastScenario.findMany({
      where: { householdId: session.householdId },
      include: { milestones: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(scenarios);
  } catch (error) {
    console.error("Failed to fetch scenarios:", error);
    return NextResponse.json({ error: "Failed to fetch forecast scenarios" }, { status: 500 });
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
    const {
      name,
      type = "CUSTOM",
      isDefault = false,
      incomeGrowthRate = 5.0,
      expenseInflationRate = 6.0,
      investmentReturnRate = 10.0,
      assetGrowthRate = 5.0,
      horizonMonths = 12,
      notes,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Scenario name is required" }, { status: 400 });
    }

    if (isDefault) {
      await prisma.forecastScenario.updateMany({
        where: { householdId: session.householdId },
        data: { isDefault: false },
      });
    }

    const scenario = await prisma.forecastScenario.create({
      data: {
        householdId: session.householdId,
        name,
        type: type.toUpperCase(),
        isDefault: Boolean(isDefault),
        incomeGrowthRate: new Prisma.Decimal(incomeGrowthRate),
        expenseInflationRate: new Prisma.Decimal(expenseInflationRate),
        investmentReturnRate: new Prisma.Decimal(investmentReturnRate),
        assetGrowthRate: new Prisma.Decimal(assetGrowthRate),
        horizonMonths: Number(horizonMonths),
        notes,
      },
    });

    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    console.error("Failed to create forecast scenario:", error);
    return NextResponse.json({ error: "Failed to create forecast scenario" }, { status: 500 });
  }
}
