import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();
    const { name, sortOrder, isActive } = body;

    const subcategory = await prisma.categorySubcategory.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!subcategory) {
      return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
    }

    if (name && name.trim() !== subcategory.name) {
      const existing = await prisma.categorySubcategory.findUnique({
        where: {
          householdId_categoryId_name: {
            householdId: session.householdId,
            categoryId: subcategory.categoryId,
            name: name.trim(),
          },
        },
      });
      if (existing) {
        return NextResponse.json({ error: `Subcategory "${name.trim()}" already exists` }, { status: 400 });
      }
    }

    const updated = await prisma.categorySubcategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: updated.id,
      reason: "User updated subcategory",
      metadata: {
        action: "SUBCATEGORY_UPDATED",
        subcategoryId: updated.id,
        name: updated.name,
        isActive: updated.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update subcategory:", error);
    return NextResponse.json({ error: "Failed to update subcategory" }, { status: 500 });
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

    const { id } = await params;

    const subcategory = await prisma.categorySubcategory.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!subcategory) {
      return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
    }

    const txCount = await prisma.transaction.count({ where: { subcategoryId: id } });

    if (txCount > 0) {
      const deactivated = await prisma.categorySubcategory.update({
        where: { id },
        data: { isActive: false },
      });

      await AuditService.record(prisma, {
        householdId: session.householdId,
        actorUserId: session.id,
        action: "UPDATE",
        entityType: "HOUSEHOLD",
        entityId: id,
        reason: "Subcategory deactivated to preserve historical references",
        metadata: {
          action: "SUBCATEGORY_DEACTIVATED",
          subcategoryId: id,
          name: subcategory.name,
          usageCount: txCount,
        },
      });

      return NextResponse.json({ message: "Subcategory deactivated to preserve historical references", subcategory: deactivated });
    }

    await prisma.categorySubcategory.delete({ where: { id } });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: id,
      reason: "User safely deleted unused subcategory",
      metadata: {
        action: "SUBCATEGORY_DELETED",
        subcategoryId: id,
        name: subcategory.name,
      },
    });

    return NextResponse.json({ message: "Subcategory deleted successfully" });
  } catch (error) {
    console.error("Failed to delete subcategory:", error);
    return NextResponse.json({ error: "Failed to delete subcategory" }, { status: 500 });
  }
}
