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
    const categoryId = searchParams.get("categoryId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const subcategories = await prisma.categorySubcategory.findMany({
      where: {
        householdId: session.householdId,
        ...(categoryId ? { categoryId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        category: {
          select: { id: true, name: true, type: true, color: true, isDefault: true },
        },
        _count: {
          select: {
            transactions: true,
            budgets: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(subcategories);
  } catch (error) {
    console.error("Failed to fetch subcategories:", error);
    return NextResponse.json({ error: "Failed to fetch subcategories" }, { status: 500 });
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
    const { categoryId, name, sortOrder } = body;

    if (!categoryId || typeof categoryId !== "string") {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Subcategory name is required" }, { status: 400 });
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, householdId: session.householdId },
    });

    if (!category) {
      return NextResponse.json({ error: "Category not found in this household" }, { status: 404 });
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
      return NextResponse.json(
        { error: `Subcategory "${trimmedName}" already exists for this category` },
        { status: 400 }
      );
    }

    const subcategory = await prisma.categorySubcategory.create({
      data: {
        householdId: session.householdId,
        categoryId,
        name: trimmedName,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isActive: true,
      },
      include: {
        category: {
          select: { id: true, name: true, type: true, color: true },
        },
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "CREATE",
      entityType: "HOUSEHOLD",
      entityId: subcategory.id,
      reason: "User created new subcategory",
      metadata: {
        action: "SUBCATEGORY_CREATED",
        subcategoryId: subcategory.id,
        name: subcategory.name,
        categoryId: subcategory.categoryId,
        categoryName: category.name,
      },
    });

    return NextResponse.json(subcategory, { status: 201 });
  } catch (error) {
    console.error("Failed to create subcategory:", error);
    return NextResponse.json({ error: "Failed to create subcategory" }, { status: 500 });
  }
}
