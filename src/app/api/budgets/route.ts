import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const budgets = await prisma.budget.findMany({
      where: { householdId: session.householdId },
      include: { category: true },
    });
    return NextResponse.json(budgets);
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
    const { categoryId, amount, month, year } = body;

    if (typeof categoryId !== "string" || !categoryId || amount === undefined || amount === null || amount === "") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
    const m = month === undefined || month === null || month === "" ? new Date().getMonth() + 1 : Number(month);
    const y = year === undefined || year === null || year === "" ? new Date().getFullYear() : Number(year);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1900 || y > 9999) {
      return NextResponse.json({ error: "Budget month or year is invalid" }, { status: 400 });
    }
    const category = await prisma.category.findFirst({
      where: { id: categoryId, householdId: session.householdId, type: "EXPENSE" },
      select: { id: true },
    });
    if (!category) return NextResponse.json({ error: "Expense category not found in this household" }, { status: 400 });

    const budget = await prisma.budget.upsert({
      where: {
        householdId_categoryId_month_year: {
          householdId: session.householdId,
          categoryId,
          month: m,
          year: y,
        },
      },
      update: {
        amount: budgetAmount,
      },
      create: {
        householdId: session.householdId,
        categoryId,
        month: m,
        year: y,
        amount: budgetAmount,
      },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("Failed to set budget:", error);
    return NextResponse.json({ error: "Failed to set budget" }, { status: 500 });
  }
}
