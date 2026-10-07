import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { validateClassificationCombination } from "@/lib/services/classification-service";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { id } = await params;

    const budget = await prisma.budget.findFirst({
      where: { id, householdId: session.householdId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        scope: { select: { id: true, name: true, color: true, icon: true } },
        subcategory: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const bStart = new Date(budget.startDate);
    const bEnd = new Date(budget.endDate);

    const matchingTxns = await prisma.transaction.findMany({
      where: {
        householdId: session.householdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        date: { gte: bStart, lte: bEnd },
        ...(budget.scopeId ? { scopeId: budget.scopeId } : {}),
        ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
        ...(budget.subcategoryId ? { subcategoryId: budget.subcategoryId } : {}),
        ...(budget.costCenterId ? { costCenterId: budget.costCenterId } : {}),
      },
      select: {
        id: true,
        amount: true,
        refundedAmount: true,
        date: true,
        description: true,
        merchant: true,
        scopeId: true,
        categoryId: true,
        subcategoryId: true,
        costCenterId: true,
      },
      orderBy: { date: "desc" },
    });

    const actualSpent = matchingTxns.reduce((acc, t) => {
      const effective = Number(t.amount) - Number(t.refundedAmount || 0);
      return acc + (effective > 0 ? effective : 0);
    }, 0);

    const limit = Number(budget.amount);
    const remaining = limit - actualSpent;
    const isOverBudget = actualSpent > limit;
    const overBudgetAmount = isOverBudget ? actualSpent - limit : 0;
    const utilizationPct = limit > 0 ? Number(((actualSpent / limit) * 100).toFixed(2)) : 0;

    return NextResponse.json({
      ...budget,
      actualSpent,
      remaining,
      isOverBudget,
      overBudgetAmount,
      utilizationPct,
      matchingTransactions: matchingTxns,
    });
  } catch (error) {
    console.error("Failed to fetch budget:", error);
    return NextResponse.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

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

    const existingBudget = await prisma.budget.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existingBudget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      name,
      amount,
      status,
      notes,
      periodType,
      startDate,
      endDate,
      scopeId,
      categoryId,
      subcategoryId,
      costCenterId,
    } = body;

    let budgetAmount: Prisma.Decimal | undefined = undefined;
    if (amount !== undefined && amount !== null && amount !== "") {
      try {
        budgetAmount = new Prisma.Decimal(amount);
        if (!budgetAmount.isFinite() || budgetAmount.isNegative()) {
          return NextResponse.json({ error: "Budget amount must be a valid non-negative number" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Budget amount must be a valid non-negative number" }, { status: 400 });
      }
    }

    const targetScopeId = scopeId !== undefined ? (typeof scopeId === "string" && scopeId.trim() ? scopeId.trim() : null) : existingBudget.scopeId;
    const targetCategoryId = categoryId !== undefined ? (typeof categoryId === "string" && categoryId.trim() ? categoryId.trim() : null) : existingBudget.categoryId;
    const targetSubcategoryId = subcategoryId !== undefined ? (typeof subcategoryId === "string" && subcategoryId.trim() ? subcategoryId.trim() : null) : existingBudget.subcategoryId;
    const targetCostCenterId = costCenterId !== undefined ? (typeof costCenterId === "string" && costCenterId.trim() ? costCenterId.trim() : null) : existingBudget.costCenterId;

    if (scopeId !== undefined || categoryId !== undefined || subcategoryId !== undefined || costCenterId !== undefined) {
      const classValidation = await validateClassificationCombination({
        householdId: session.householdId,
        scopeId: targetScopeId,
        categoryId: targetCategoryId,
        subcategoryId: targetSubcategoryId,
        costCenterId: targetCostCenterId,
        isNewRecord: false,
      });

      if (!classValidation.valid) {
        return NextResponse.json({ error: classValidation.error }, { status: 400 });
      }
    }

    let parsedStart = existingBudget.startDate;
    let parsedEnd = existingBudget.endDate;
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) parsedStart = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      if (!isNaN(d.getTime())) parsedEnd = d;
    }
    if (parsedStart > parsedEnd) {
      return NextResponse.json({ error: "startDate cannot be after endDate" }, { status: 400 });
    }

    const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
    let newStatus = existingBudget.status;
    if (status !== undefined) {
      const s = String(status).toUpperCase();
      if (validStatuses.includes(s)) newStatus = s;
    }

    let action: AuditActionType = "UPDATE";
    if (newStatus !== existingBudget.status) {
      if (newStatus === "PAUSED") action = "PAUSE";
      else if (newStatus === "ACTIVE" && existingBudget.status === "PAUSED") action = "RESUME";
      else if (newStatus === "ARCHIVED") action = "ARCHIVE";
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.budget.update({
        where: { id: existingBudget.id },
        data: {
          ...(budgetAmount !== undefined ? { amount: budgetAmount } : {}),
          ...(name !== undefined ? { name: typeof name === "string" && name.trim() ? name.trim() : null } : {}),
          ...(status !== undefined ? { status: newStatus } : {}),
          ...(notes !== undefined ? { notes: typeof notes === "string" && notes.trim() ? notes.trim() : null } : {}),
          ...(periodType !== undefined ? { periodType: String(periodType).toUpperCase() } : {}),
          startDate: parsedStart,
          endDate: parsedEnd,
          month: parsedStart.getUTCMonth() + 1,
          year: parsedStart.getUTCFullYear(),
          scopeId: targetScopeId,
          categoryId: targetCategoryId,
          subcategoryId: targetSubcategoryId,
          costCenterId: targetCostCenterId,
        },
        include: {
          category: { select: { id: true, name: true, color: true, icon: true } },
          scope: { select: { id: true, name: true, color: true, icon: true } },
          subcategory: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "BUDGET",
        entityId: res.id,
        action,
        fromState: existingBudget.status,
        toState: res.status,
        actorUserId: session.id,
        metadata: {
          before: {
            amount: Number(existingBudget.amount),
            name: existingBudget.name,
            status: existingBudget.status,
            periodType: existingBudget.periodType,
            scopeId: existingBudget.scopeId,
            categoryId: existingBudget.categoryId,
            subcategoryId: existingBudget.subcategoryId,
            costCenterId: existingBudget.costCenterId,
            startDate: existingBudget.startDate.toISOString(),
            endDate: existingBudget.endDate.toISOString(),
          },
          after: {
            amount: Number(res.amount),
            name: res.name,
            status: res.status,
            periodType: res.periodType,
            scopeId: res.scopeId,
            categoryId: res.categoryId,
            subcategoryId: res.subcategoryId,
            costCenterId: res.costCenterId,
            startDate: res.startDate.toISOString(),
            endDate: res.endDate.toISOString(),
          },
        },
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update budget:", error);
    return NextResponse.json({ error: "Failed to update budget" }, { status: 500 });
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

    const existingBudget = await prisma.budget.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existingBudget) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    // Soft-archive to preserve historical financial planning records
    const archived = await prisma.$transaction(async (tx) => {
      const res = await tx.budget.update({
        where: { id: existingBudget.id },
        data: { status: "ARCHIVED" },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "BUDGET",
        entityId: res.id,
        action: "ARCHIVE",
        fromState: existingBudget.status,
        toState: "ARCHIVED",
        actorUserId: session.id,
        metadata: {
          before: {
            amount: Number(existingBudget.amount),
            name: existingBudget.name,
            status: existingBudget.status,
          },
          after: {
            status: "ARCHIVED",
          },
        },
      });

      return res;
    });

    return NextResponse.json({ success: true, id: archived.id, status: "ARCHIVED" });
  } catch (error) {
    console.error("Failed to archive budget:", error);
    return NextResponse.json({ error: "Failed to archive budget" }, { status: 500 });
  }
}
