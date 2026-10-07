import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const scenario = await prisma.forecastScenario.findFirst({
      where: { id, householdId: session.householdId },
      include: { milestones: true, snapshots: true },
    });

    if (!scenario) {
      return NextResponse.json({ error: "Forecast scenario not found" }, { status: 404 });
    }

    return NextResponse.json(scenario);
  } catch (error) {
    console.error("Failed to fetch scenario:", error);
    return NextResponse.json({ error: "Failed to fetch scenario" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    const existing = await prisma.forecastScenario.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Forecast scenario not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, incomeGrowthRate, expenseInflationRate, investmentReturnRate, assetGrowthRate, horizonMonths, notes, isDefault } = body;

    if (isDefault) {
      await prisma.forecastScenario.updateMany({
        where: { householdId: session.householdId },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.forecastScenario.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(incomeGrowthRate !== undefined && { incomeGrowthRate: new Prisma.Decimal(incomeGrowthRate) }),
        ...(expenseInflationRate !== undefined && { expenseInflationRate: new Prisma.Decimal(expenseInflationRate) }),
        ...(investmentReturnRate !== undefined && { investmentReturnRate: new Prisma.Decimal(investmentReturnRate) }),
        ...(assetGrowthRate !== undefined && { assetGrowthRate: new Prisma.Decimal(assetGrowthRate) }),
        ...(horizonMonths !== undefined && { horizonMonths: Number(horizonMonths) }),
        ...(notes !== undefined && { notes }),
        ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
        assumptionsVersion: { increment: 1 },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update scenario:", error);
    return NextResponse.json({ error: "Failed to update scenario" }, { status: 500 });
  }
}
