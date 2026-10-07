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
    const { name, icon, color, sortOrder, isActive } = body;

    const scope = await prisma.financialScope.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
    }

    if (name && name.trim() !== scope.name) {
      const existing = await prisma.financialScope.findUnique({
        where: {
          householdId_name: {
            householdId: session.householdId,
            name: name.trim(),
          },
        },
      });
      if (existing) {
        return NextResponse.json({ error: `Scope name "${name.trim()}" is already in use` }, { status: 400 });
      }
    }

    const updated = await prisma.financialScope.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
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
      reason: "User updated financial scope",
      metadata: {
        action: "FINANCIAL_SCOPE_UPDATED",
        scopeId: updated.id,
        name: updated.name,
        isActive: updated.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update financial scope:", error);
    return NextResponse.json({ error: "Failed to update financial scope" }, { status: 500 });
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

    const scope = await prisma.financialScope.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!scope) {
      return NextResponse.json({ error: "Financial scope not found" }, { status: 404 });
    }

    // Check usage across financial records
    const [txCount, incomeCount, assetCount, investCount, liabCount, ccCount] = await Promise.all([
      prisma.transaction.count({ where: { scopeId: id } }),
      prisma.incomeSource.count({ where: { scopeId: id } }),
      prisma.asset.count({ where: { scopeId: id } }),
      prisma.investment.count({ where: { scopeId: id } }),
      prisma.liability.count({ where: { scopeId: id } }),
      prisma.costCenter.count({ where: { scopeId: id } }),
    ]);

    const totalReferences = txCount + incomeCount + assetCount + investCount + liabCount + ccCount;

    if (totalReferences > 0 || scope.isSystem) {
      // Soft deactivation rule: do not physically delete referenced or system scopes
      const deactivated = await prisma.financialScope.update({
        where: { id },
        data: { isActive: false },
      });

      await AuditService.record(prisma, {
        householdId: session.householdId,
        actorUserId: session.id,
        action: "UPDATE",
        entityType: "HOUSEHOLD",
        entityId: id,
        reason: "Scope deactivated to preserve historical references",
        metadata: {
          action: "FINANCIAL_SCOPE_DEACTIVATED",
          scopeId: id,
          name: scope.name,
          usageCount: totalReferences,
        },
      });

      return NextResponse.json({ message: "Scope deactivated to preserve historical references", scope: deactivated });
    }

    await prisma.financialScope.delete({ where: { id } });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "HOUSEHOLD",
      entityId: id,
      reason: "User safely deleted unused financial scope",
      metadata: {
        action: "FINANCIAL_SCOPE_DELETED",
        scopeId: id,
        name: scope.name,
      },
    });

    return NextResponse.json({ message: "Scope deleted successfully" });
  } catch (error) {
    console.error("Failed to delete financial scope:", error);
    return NextResponse.json({ error: "Failed to delete financial scope" }, { status: 500 });
  }
}
