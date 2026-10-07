import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();
    const { name, icon, color, type, isActive, scopeIds } = body;

    const existing = await prisma.category.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (name && name.trim() !== existing.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          householdId: session.householdId,
          name: name.trim(),
          id: { not: id },
        },
      });
      if (duplicate) {
        return NextResponse.json({ error: `Category "${name.trim()}" already exists` }, { status: 400 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cat = await tx.category.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(icon !== undefined && { icon: icon || "tag" }),
          ...(color !== undefined && { color: color || "#64748b" }),
          ...(type !== undefined && { type: type || "EXPENSE" }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      if (Array.isArray(scopeIds)) {
        // Delete previous mappings
        await tx.scopeCategory.deleteMany({
          where: { categoryId: id },
        });

        // Insert new mappings
        for (const scopeId of scopeIds) {
          const scope = await tx.financialScope.findFirst({
            where: { id: scopeId, householdId: session.householdId },
          });
          if (scope) {
            await tx.scopeCategory.create({
              data: {
                scopeId: scope.id,
                categoryId: id,
              },
            });
          }
        }
      }

      return cat;
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: updated.id,
      reason: "User updated category",
      metadata: {
        action: "CATEGORY_UPDATED",
        categoryId: updated.id,
        name: updated.name,
        isActive: updated.isActive,
      },
    });

    const fullCategory = await prisma.category.findUnique({
      where: { id: updated.id },
      include: {
        scopeCategories: {
          include: {
            scope: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });

    return NextResponse.json(fullCategory);
  } catch (error) {
    console.error("Failed to update category:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return PUT(req, { params });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.category.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Check usage across transactions, budgets, subcategories
    const [txCount, budgetCount, subcatCount] = await Promise.all([
      prisma.transaction.count({ where: { categoryId: id } }),
      prisma.budget.count({ where: { categoryId: id } }),
      prisma.categorySubcategory.count({ where: { categoryId: id } }),
    ]);

    const totalUsage = txCount + budgetCount + subcatCount;

    if (totalUsage > 0 || existing.isDefault) {
      // Soft deactivation to preserve financial history
      const deactivated = await prisma.category.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await AuditService.record(prisma, {
        householdId: session.householdId,
        actorUserId: session.id,
        action: "UPDATE",
        entityType: "HOUSEHOLD",
        entityId: id,
        reason: "Category deactivated to preserve historical references",
        metadata: {
          action: "CATEGORY_DEACTIVATED",
          categoryId: id,
          name: existing.name,
          usageCount: totalUsage,
        },
      });

      return NextResponse.json({
        message: "Category deactivated to preserve historical references",
        category: deactivated,
      });
    }

    // Completely unused non-default category: safely delete
    await prisma.$transaction(async (tx) => {
      await tx.scopeCategory.deleteMany({ where: { categoryId: id } });
      await tx.category.delete({ where: { id: existing.id } });
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: id,
      reason: "User safely deleted unused category",
      metadata: {
        action: "CATEGORY_DELETED",
        categoryId: id,
        name: existing.name,
      },
    });

    return NextResponse.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
