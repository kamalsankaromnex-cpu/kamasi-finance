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

    const { id: categoryId } = await params;
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const category = await prisma.category.findFirst({
      where: { id: categoryId, householdId: session.householdId },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const subcategories = await prisma.categorySubcategory.findMany({
      where: {
        categoryId,
        householdId: session.householdId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(subcategories);
  } catch (error) {
    console.error("Failed to fetch subcategories:", error);
    return NextResponse.json({ error: "Failed to fetch subcategories" }, { status: 500 });
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

    const { id: categoryId } = await params;
    const body = await req.json();
    const { name, sortOrder } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Subcategory name is required" }, { status: 400 });
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, householdId: session.householdId },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const trimmedName = name.trim();

    const existing = await prisma.categorySubcategory.findUnique({
      where: {
        householdId_categoryId_name: {
          householdId: session.householdId,
          categoryId,
          name: trimmedName,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: `Subcategory "${trimmedName}" already exists for this category` }, { status: 400 });
    }

    const subcategory = await prisma.categorySubcategory.create({
      data: {
        categoryId,
        householdId: session.householdId,
        name: trimmedName,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isActive: true,
      },
    });

    return NextResponse.json(subcategory, { status: 201 });
  } catch (error) {
    console.error("Failed to create subcategory:", error);
    return NextResponse.json({ error: "Failed to create subcategory" }, { status: 500 });
  }
}
