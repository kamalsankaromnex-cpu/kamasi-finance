import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { id: scopeId } = await params;
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const scope = await prisma.financialScope.findFirst({
      where: { id: scopeId, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
    }

    const costCenters = await prisma.costCenter.findMany({
      where: {
        scopeId,
        householdId: session.householdId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(costCenters);
  } catch (error) {
    console.error("Failed to fetch cost centers:", error);
    return NextResponse.json({ error: "Failed to fetch cost centers" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id: scopeId } = await params;
    const body = await req.json();
    const { name, type, description, icon, color, sortOrder, externalSystem, externalEntityId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Location / Cost center name is required" }, { status: 400 });
    }

    const scope = await prisma.financialScope.findFirst({
      where: { id: scopeId, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
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
      return NextResponse.json({ error: `Location / Cost center "${trimmedName}" already exists for this scope` }, { status: 400 });
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
        externalSystem: externalSystem || null,
        externalEntityId: externalEntityId || null,
      },
    });

    return NextResponse.json(costCenter, { status: 201 });
  } catch (error) {
    console.error("Failed to create cost center:", error);
    return NextResponse.json({ error: "Failed to create cost center" }, { status: 500 });
  }
}
