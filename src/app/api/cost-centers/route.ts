import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const scopeId = searchParams.get("scopeId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const costCenters = await prisma.costCenter.findMany({
      where: {
        householdId: session.householdId,
        ...(scopeId ? { scopeId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        scope: {
          select: { id: true, name: true, color: true, isSystem: true },
        },
        _count: {
          select: {
            transactions: true,
            assets: true,
            liabilities: true,
            budgets: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(costCenters);
  } catch (error) {
    console.error("Failed to fetch cost centers / facilities:", error);
    return NextResponse.json({ error: "Failed to fetch cost centers / facilities" }, { status: 500 });
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
    const { scopeId, name, type, description, icon, color, sortOrder } = body;

    if (!scopeId || typeof scopeId !== "string") {
      return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Location / Cost center name is required" }, { status: 400 });
    }

    const scope = await prisma.financialScope.findFirst({
      where: { id: scopeId, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found in this household" }, { status: 404 });
    }

    const trimmedName = name.trim();

    const existing = await prisma.costCenter.findUnique({
      where: {
        householdId_scopeId_name: {
          householdId: session.householdId,
          scopeId,
          name: trimmedName,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Location / Cost center "${trimmedName}" already exists for this scope` },
        { status: 400 }
      );
    }

    const costCenter = await prisma.costCenter.create({
      data: {
        householdId: session.householdId,
        scopeId,
        name: trimmedName,
        type: type || null,
        description: description || null,
        icon: icon || "map-pin",
        color: color || "#64748b",
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isSystem: false,
        isActive: true,
      },
      include: {
        scope: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "CREATE",
      entityType: "HOUSEHOLD",
      entityId: costCenter.id,
      reason: "User created new cost center / facility",
      metadata: {
        action: "COST_CENTER_CREATED",
        costCenterId: costCenter.id,
        name: costCenter.name,
        scopeId: costCenter.scopeId,
        scopeName: scope.name,
      },
    });

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    console.error("Failed to create cost center / facility:", error);
    return NextResponse.json({ error: "Failed to create cost center / facility" }, { status: 500 });
  }
}
