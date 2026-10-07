import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const household = await prisma.household.findUnique({
      where: { id: session.householdId },
      select: { id: true, name: true, currency: true, createdAt: true },
    });

    if (!household) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }

    return NextResponse.json({ household });
  } catch (error) {
    console.error("Failed to fetch household details:", error);
    return NextResponse.json({ error: "Failed to fetch household details" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only household OWNER can update household details" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "A valid household name (1-100 characters) is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.household.findUnique({
        where: { id: session.householdId },
        select: { id: true, name: true },
      });

      if (!existing) throw new Error("HOUSEHOLD_NOT_FOUND");

      const res = await tx.household.update({
        where: { id: session.householdId },
        data: { name },
        select: { id: true, name: true, currency: true, updatedAt: true },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: session.householdId,
        action: "UPDATE",
        fromState: existing.name,
        toState: name,
        actorUserId: session.id,
        reason: "Owner updated household name",
        metadata: { updatedField: "name" },
      });

      return res;
    });

    return NextResponse.json({ household: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "HOUSEHOLD_NOT_FOUND") {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }
    console.error("Failed to update household details:", error);
    return NextResponse.json({ error: "Failed to update household details" }, { status: 500 });
  }
}
