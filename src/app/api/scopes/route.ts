import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { seedSystemScopes } from "@/lib/services/classification-service";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    // Ensure system scopes are seeded
    await seedSystemScopes(session.householdId);

    const scopes = await prisma.financialScope.findMany({
      where: {
        householdId: session.householdId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        scopeCategories: {
          include: { category: true },
        },
        costCenters: true,
        _count: {
          select: {
            transactions: true,
            costCenters: true,
            scopeCategories: true,
            budgets: true,
            assets: true,
            investments: true,
            liabilities: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(scopes);
  } catch (error) {
    console.error("Failed to fetch financial scopes:", error);
    return NextResponse.json({ error: "Failed to fetch financial scopes" }, { status: 500 });
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
    const { name, icon, color, sortOrder, externalSystem, externalEntityId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Scope name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Check duplicate
    const existing = await prisma.financialScope.findUnique({
      where: {
        householdId_name: {
          householdId: session.householdId,
          name: trimmedName,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: `Scope "${trimmedName}" already exists in this household` }, { status: 400 });
    }

    const scope = await prisma.financialScope.create({
      data: {
        householdId: session.householdId,
        name: trimmedName,
        icon: icon || "layers",
        color: color || "#64748b",
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isSystem: false,
        isActive: true,
        externalSystem: externalSystem || null,
        externalEntityId: externalEntityId || null,
      },
      include: {
        scopeCategories: { include: { category: true } },
        costCenters: true,
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "CREATE",
      entityType: "HOUSEHOLD",
      entityId: scope.id,
      reason: "User created new financial scope",
      metadata: {
        action: "FINANCIAL_SCOPE_CREATED",
        scopeId: scope.id,
        name: scope.name,
      },
    });

    return NextResponse.json(scope, { status: 201 });
  } catch (error) {
    console.error("Failed to create financial scope:", error);
    return NextResponse.json({ error: "Failed to create financial scope" }, { status: 500 });
  }
}
