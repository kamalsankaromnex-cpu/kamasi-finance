import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parsePositiveMoney, isValidTransactionType } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const rules = await prisma.recurringTransaction.findMany({
      where: {
        householdId: session.householdId,
        account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
      },
      include: {
        account: { select: { id: true, name: true, type: true, balance: true, currency: true } },
        category: true,
        occurrences: {
          orderBy: { dueDate: "asc" },
        },
      },
      orderBy: { nextDueDate: "asc" },
    });

    const occurrences = await prisma.recurringBillOccurrence.findMany({
      where: {
        householdId: session.householdId,
        recurringRule: { is: { account: { is: { OR: [{ isShared: true }, { userId: session.id }] } } } },
      },
      include: {
        recurringRule: true,
        transactions: {
          include: { account: { select: { id: true, name: true, type: true, balance: true, currency: true } } },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ rules, occurrences });
  } catch (error) {
    console.error("Failed to fetch recurring bills:", error);
    return NextResponse.json({ error: "Failed to fetch recurring bills" }, { status: 500 });
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
    const { name, accountId, categoryId, amount, type, frequency, startDate, nextDueDate, endDate, notes } = body;

    if (typeof name !== "string" || !name.trim() || !accountId || amount === undefined || amount === null || amount === "") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const decAmount = parsePositiveMoney(amount);
    if (!decAmount) return NextResponse.json({ error: "Recurring amount must be finite and positive" }, { status: 400 });
    const normalizedType = type ?? "EXPENSE";
    const normalizedFrequency = frequency ?? "MONTHLY";
    if (!isValidTransactionType(normalizedType)) return NextResponse.json({ error: "Invalid recurring transaction type" }, { status: 400 });
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(normalizedFrequency)) {
      return NextResponse.json({ error: "Invalid recurring frequency" }, { status: 400 });
    }

    // IDOR Check
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });

    if (!account || (!account.isShared && account.userId !== session.id) || account.isArchived) {
      return NextResponse.json({ error: "Account is unavailable" }, { status: 403 });
    }
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId } });
      if (!category || (normalizedType === "TRANSFER" ? category.type !== "TRANSFER" : category.type !== normalizedType)) {
        return NextResponse.json({ error: "Category is invalid for this recurring transaction" }, { status: 400 });
      }
    }

    const start = startDate ? new Date(startDate) : new Date();
    const due = nextDueDate ? new Date(nextDueDate) : start;
    const end = endDate ? new Date(endDate) : null;
    if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime()) || (end && Number.isNaN(end.getTime())) || (end && end < due)) {
      return NextResponse.json({ error: "Recurring schedule dates are invalid" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const rule = await tx.recurringTransaction.create({
        data: {
          householdId: session.householdId,
          accountId,
          categoryId: categoryId || null,
          name: name.trim(),
          amount: decAmount,
          type: normalizedType,
          frequency: normalizedFrequency,
          startDate: start,
          endDate: end,
          nextDueDate: due,
          isActive: true,
        },
      });

      // Safely generate initial occurrence with unique constraint (recurringRuleId + dueDate)
      const occurrence = await tx.recurringBillOccurrence.upsert({
        where: {
          recurringRuleId_dueDate: {
            recurringRuleId: rule.id,
            dueDate: due,
          },
        },
        update: {},
        create: {
          householdId: session.householdId,
          recurringRuleId: rule.id,
          name: `${rule.name} - ${due.toLocaleString("default", { month: "short" })} ${due.getFullYear()}`,
          dueDate: due,
          expectedAmount: decAmount,
          paidAmount: new Prisma.Decimal(0),
          outstandingAmount: decAmount,
          status: "UPCOMING",
          notes: notes || null,
        },
      });

      return { rule, occurrence };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create recurring bill rule:", error);
    return NextResponse.json({ error: "Failed to create recurring bill rule" }, { status: 500 });
  }
}
