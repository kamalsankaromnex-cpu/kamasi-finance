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
    const { name, type, description, icon, color, sortOrder, isActive } = body;

    const costCenter = await prisma.costCenter.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!costCenter) {
      return NextResponse.json({ error: "Location / Cost center not found" }, { status: 404 });
    }

    if (name && name.trim() !== costCenter.name) {
      const existing = await prisma.costCenter.findUnique({
        where: {
          householdId_scopeId_name: {
            householdId: session.householdId,
            scopeId: costCenter.scopeId,
            name: name.trim(),
          },
        },
      });
      if (existing) {
        return NextResponse.json({ error: `Location / Cost center "${name.trim()}" already exists` }, { status: 400 });
      }
    }

    const updated = await prisma.costCenter.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(color !== undefined ? { color } : {}),
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
      reason: "User updated location / cost center",
      metadata: {
        action: "COST_CENTER_UPDATED",
        costCenterId: updated.id,
        name: updated.name,
        isActive: updated.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update cost center:", error);
    return NextResponse.json({ error: "Failed to update cost center" }, { status: 500 });
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

    const costCenter = await prisma.costCenter.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!costCenter) {
      return NextResponse.json({ error: "Location / Cost center not found" }, { status: 404 });
    }

    const [txCount, assetCount, liabCount] = await Promise.all([
      prisma.transaction.count({ where: { costCenterId: id } }),
      prisma.asset.count({ where: { costCenterId: id } }),
      prisma.liability.count({ where: { costCenterId: id } }),
    ]);

    const totalReferences = txCount + assetCount + liabCount;

    if (totalReferences > 0 || costCenter.isSystem) {
      const deactivated = await prisma.costCenter.update({
        where: { id },
        data: { isActive: false },
      });

      await AuditService.record(prisma, {
        householdId: session.householdId,
        actorUserId: session.id,
        action: "UPDATE",
        entityType: "HOUSEHOLD",
        entityId: id,
        reason: "Cost center deactivated to preserve historical references",
        metadata: {
          action: "COST_CENTER_DEACTIVATED",
          costCenterId: id,
          name: costCenter.name,
          usageCount: totalReferences,
        },
      });

      return NextResponse.json({ message: "Location / Cost center deactivated to preserve historical references", costCenter: deactivated });
    }

    await prisma.costCenter.delete({ where: { id } });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: id,
      reason: "User safely deleted unused cost center",
      metadata: {
        action: "COST_CENTER_DELETED",
        costCenterId: id,
        name: costCenter.name,
      },
    });

    return NextResponse.json({ message: "Location / Cost center deleted successfully" });
  } catch (error) {
    console.error("Failed to delete cost center:", error);
    return NextResponse.json({ error: "Failed to delete cost center" }, { status: 500 });
  }
}
