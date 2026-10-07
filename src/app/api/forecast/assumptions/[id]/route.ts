import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;
    const { id } = await params;

    const existing = await prisma.forecastMilestone.findFirst({
      where: { id, scenario: { householdId: session.householdId } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Forecast assumption milestone not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, targetYear, estimatedCost, type } = body;

    const updated = await prisma.forecastMilestone.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(targetYear !== undefined && { targetYear: Number(targetYear) }),
        ...(estimatedCost !== undefined && { estimatedCost: new Prisma.Decimal(estimatedCost) }),
        ...(type && { type }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update forecast assumption:", error);
    return NextResponse.json({ error: "Failed to update forecast assumption" }, { status: 500 });
  }
}
