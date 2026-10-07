import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { validateClassificationCombination } from "@/lib/services/classification-service";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const statusParam = searchParams.get("status");
    const scopeIdParam = searchParams.get("scopeId");
    const categoryIdParam = searchParams.get("categoryId");
    const subcategoryIdParam = searchParams.get("subcategoryId");
    const costCenterIdParam = searchParams.get("costCenterId");
    const periodTypeParam = searchParams.get("periodType");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    const whereClause: Prisma.BudgetWhereInput = {
      householdId: session.householdId,
      ...(includeArchived ? {} : statusParam ? { status: statusParam } : { status: { not: "ARCHIVED" } }),
      ...(scopeIdParam ? { scopeId: scopeIdParam } : {}),
      ...(categoryIdParam ? { categoryId: categoryIdParam } : {}),
      ...(subcategoryIdParam ? { subcategoryId: subcategoryIdParam } : {}),
      ...(costCenterIdParam ? { costCenterId: costCenterIdParam } : {}),
      ...(periodTypeParam ? { periodType: periodTypeParam } : {}),
      ...(monthParam ? { month: parseInt(monthParam) } : {}),
      ...(yearParam ? { year: parseInt(yearParam) } : {}),
    };

    const budgets = await prisma.budget.findMany({
      where: whereClause,
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        scope: { select: { id: true, name: true, color: true, icon: true } },
        subcategory: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });

    // Authoritative expense transactions for calculating actuals
    const transactions = await prisma.transaction.findMany({
      where: {
        householdId: session.householdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
      },
      select: {
        id: true,
        amount: true,
        refundedAmount: true,
        date: true,
        scopeId: true,
        categoryId: true,
        subcategoryId: true,
        costCenterId: true,
      },
    });

    const enrichedBudgets = budgets.map((b) => {
      const bStart = new Date(b.startDate);
      const bEnd = new Date(b.endDate);

      // Filter transactions matching period bounds and classification
      const matchingTxns = transactions.filter((t) => {
        const txDate = new Date(t.date);
        if (txDate < bStart || txDate > bEnd) return false;

        if (b.scopeId && t.scopeId !== b.scopeId) return false;
        if (b.categoryId && t.categoryId !== b.categoryId) return false;
        if (b.subcategoryId && t.subcategoryId !== b.subcategoryId) return false;
        if (b.costCenterId && t.costCenterId !== b.costCenterId) return false;

        return true;
      });

      const actualSpent = matchingTxns.reduce((acc, t) => {
        const effective = Number(t.amount) - Number(t.refundedAmount || 0);
        return acc + (effective > 0 ? effective : 0);
      }, 0);

      const limit = Number(b.amount);
      const remaining = limit - actualSpent;
      const isOverBudget = actualSpent > limit;
      const overBudgetAmount = isOverBudget ? actualSpent - limit : 0;
      const utilizationPct = limit > 0 ? Number(((actualSpent / limit) * 100).toFixed(2)) : 0;

      return {
        ...b,
        actualSpent,
        remaining,
        isOverBudget,
        overBudgetAmount,
        utilizationPct,
        matchingTransactionCount: matchingTxns.length,
      };
    });

    return NextResponse.json(enrichedBudgets);
  } catch (error) {
    console.error("Failed to fetch budgets:", error);
    return NextResponse.json({ error: "Failed to fetch budgets" }, { status: 500 });
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
    const {
      name,
      amount,
      periodType = "MONTHLY",
      startDate,
      endDate,
      month,
      year,
      scopeId,
      categoryId,
      subcategoryId,
      costCenterId,
      notes,
      status = "ACTIVE",
    } = body;

    if (amount === undefined || amount === null || amount === "") {
      return NextResponse.json({ error: "Budget amount is required" }, { status: 400 });
    }

    let budgetAmount: Prisma.Decimal;
    try {
      budgetAmount = new Prisma.Decimal(amount);
    } catch {
      return NextResponse.json({ error: "Budget amount must be a valid non-negative number" }, { status: 400 });
    }
    if (!budgetAmount.isFinite() || budgetAmount.isNegative()) {
      return NextResponse.json({ error: "Budget amount must be a valid non-negative number" }, { status: 400 });
    }

    const validPeriodTypes = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "CUSTOM"];
    const pType = validPeriodTypes.includes(String(periodType).toUpperCase())
      ? String(periodType).toUpperCase()
      : "MONTHLY";

    const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
    const bStatus = validStatuses.includes(String(status).toUpperCase())
      ? String(status).toUpperCase()
      : "ACTIVE";

    // Validate classification combination
    const classValidation = await validateClassificationCombination({
      householdId: session.householdId,
      scopeId: typeof scopeId === "string" && scopeId.trim() ? scopeId.trim() : null,
      categoryId: typeof categoryId === "string" && categoryId.trim() ? categoryId.trim() : null,
      subcategoryId: typeof subcategoryId === "string" && subcategoryId.trim() ? subcategoryId.trim() : null,
      costCenterId: typeof costCenterId === "string" && costCenterId.trim() ? costCenterId.trim() : null,
      isNewRecord: true,
    });

    if (!classValidation.valid) {
      return NextResponse.json({ error: classValidation.error }, { status: 400 });
    }

    // Verify category is EXPENSE if categoryId is provided
    if (categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: categoryId, householdId: session.householdId, type: "EXPENSE" },
        select: { id: true },
      });
      if (!cat) {
        return NextResponse.json({ error: "Expense category not found in this household" }, { status: 400 });
      }
    }

    // Determine normalized start and end dates
    let computedStart: Date;
    let computedEnd: Date;
    let computedMonth: number | null = null;
    let computedYear: number | null = null;

    if (startDate && endDate) {
      computedStart = new Date(startDate);
      computedEnd = new Date(endDate);
      if (isNaN(computedStart.getTime()) || isNaN(computedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid startDate or endDate provided" }, { status: 400 });
      }
      if (computedStart > computedEnd) {
        return NextResponse.json({ error: "startDate cannot be after endDate" }, { status: 400 });
      }
      computedMonth = computedStart.getUTCMonth() + 1;
      computedYear = computedStart.getUTCFullYear();
    } else {
      const now = new Date();
      const m = month === undefined || month === null || month === "" ? now.getMonth() + 1 : Number(month);
      const y = year === undefined || year === null || year === "" ? now.getFullYear() : Number(year);

      if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 9999) {
        return NextResponse.json({ error: "Budget month or year is invalid" }, { status: 400 });
      }

      computedMonth = m;
      computedYear = y;

      if (pType === "MONTHLY") {
        computedStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        computedEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      } else if (pType === "QUARTERLY") {
        const qStartMonth = Math.floor((m - 1) / 3) * 3;
        computedStart = new Date(Date.UTC(y, qStartMonth, 1, 0, 0, 0));
        computedEnd = new Date(Date.UTC(y, qStartMonth + 3, 0, 23, 59, 59, 999));
      } else if (pType === "HALF_YEARLY") {
        const hStartMonth = m <= 6 ? 0 : 6;
        computedStart = new Date(Date.UTC(y, hStartMonth, 1, 0, 0, 0));
        computedEnd = new Date(Date.UTC(y, hStartMonth + 6, 0, 23, 59, 59, 999));
      } else if (pType === "YEARLY") {
        // Indian Financial Year: 01 Apr -> 31 Mar
        computedStart = new Date(Date.UTC(y, 3, 1, 0, 0, 0));
        computedEnd = new Date(Date.UTC(y + 1, 2, 31, 23, 59, 59, 999));
      } else {
        computedStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        computedEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      }
    }

    const cleanScopeId = typeof scopeId === "string" && scopeId.trim() ? scopeId.trim() : null;
    const cleanCategoryId = typeof categoryId === "string" && categoryId.trim() ? categoryId.trim() : null;
    const cleanSubcategoryId = typeof subcategoryId === "string" && subcategoryId.trim() ? subcategoryId.trim() : null;
    const cleanCostCenterId = typeof costCenterId === "string" && costCenterId.trim() ? costCenterId.trim() : null;

    // Safe multi-scope uniqueness check: check for existing non-archived budget for exact classification & dates
    const existingBudget = await prisma.budget.findFirst({
      where: {
        householdId: session.householdId,
        status: { not: "ARCHIVED" },
        startDate: computedStart,
        endDate: computedEnd,
        scopeId: cleanScopeId,
        categoryId: cleanCategoryId,
        subcategoryId: cleanSubcategoryId,
        costCenterId: cleanCostCenterId,
      },
    });

    const savedBudget = await prisma.$transaction(async (tx) => {
      if (existingBudget) {
        const updated = await tx.budget.update({
          where: { id: existingBudget.id },
          data: {
            amount: budgetAmount,
            name: name !== undefined ? (typeof name === "string" && name.trim() ? name.trim() : null) : existingBudget.name,
            periodType: pType,
            month: computedMonth,
            year: computedYear,
            notes: notes !== undefined ? (typeof notes === "string" && notes.trim() ? notes.trim() : null) : existingBudget.notes,
            status: bStatus,
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
          entityId: updated.id,
          action: "UPDATE",
          fromState: existingBudget.status,
          toState: bStatus,
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
            },
            after: {
              amount: Number(budgetAmount),
              name: updated.name,
              status: bStatus,
              periodType: pType,
              scopeId: cleanScopeId,
              categoryId: cleanCategoryId,
              subcategoryId: cleanSubcategoryId,
              costCenterId: cleanCostCenterId,
            },
          },
        });

        return updated;
      } else {
        const created = await tx.budget.create({
          data: {
            householdId: session.householdId,
            name: typeof name === "string" && name.trim() ? name.trim() : null,
            amount: budgetAmount,
            periodType: pType,
            startDate: computedStart,
            endDate: computedEnd,
            month: computedMonth,
            year: computedYear,
            scopeId: cleanScopeId,
            categoryId: cleanCategoryId,
            subcategoryId: cleanSubcategoryId,
            costCenterId: cleanCostCenterId,
            notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
            status: bStatus,
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
          entityId: created.id,
          action: "CREATE",
          fromState: null,
          toState: bStatus,
          actorUserId: session.id,
          metadata: {
            after: {
              amount: Number(budgetAmount),
              name: created.name,
              status: bStatus,
              periodType: pType,
              scopeId: cleanScopeId,
              categoryId: cleanCategoryId,
              subcategoryId: cleanSubcategoryId,
              costCenterId: cleanCostCenterId,
              startDate: computedStart.toISOString(),
              endDate: computedEnd.toISOString(),
            },
          },
        });

        return created;
      }
    });

    return NextResponse.json(savedBudget, { status: existingBudget ? 200 : 201 });
  } catch (error) {
    console.error("Failed to set budget:", error);
    return NextResponse.json({ error: "Failed to set budget" }, { status: 500 });
  }
}
