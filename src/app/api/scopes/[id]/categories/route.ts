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

    const scope = await prisma.financialScope.findFirst({
      where: { id: scopeId, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
    }

    const mappings = await prisma.scopeCategory.findMany({
      where: { scopeId },
      include: { category: true },
    });

    return NextResponse.json(mappings.map((m) => m.category));
  } catch (error) {
    console.error("Failed to fetch scope categories:", error);
    return NextResponse.json({ error: "Failed to fetch scope categories" }, { status: 500 });
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
    const { categoryId } = body;

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    const [scope, category] = await Promise.all([
      prisma.financialScope.findFirst({ where: { id: scopeId, householdId: session.householdId } }),
      prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId } }),
    ]);

    if (!scope) return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
    if (!category) return NextResponse.json({ error: "Category not found in household" }, { status: 404 });

    const mapping = await prisma.scopeCategory.upsert({
      where: {
        scopeId_categoryId: {
          scopeId,
          categoryId,
        },
      },
      update: {},
      create: {
        scopeId,
        categoryId,
      },
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (error) {
    console.error("Failed to map category to scope:", error);
    return NextResponse.json({ error: "Failed to map category to scope" }, { status: 500 });
  }
}

export async function DELETE(
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
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return NextResponse.json({ error: "categoryId query parameter is required" }, { status: 400 });
    }

    await prisma.scopeCategory.deleteMany({
      where: {
        scopeId,
        categoryId,
      },
    });

    return NextResponse.json({ message: "Category unmapped from scope" });
  } catch (error) {
    console.error("Failed to unmap category from scope:", error);
    return NextResponse.json({ error: "Failed to unmap category from scope" }, { status: 500 });
  }
}
