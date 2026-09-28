import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const sources = await prisma.incomeSource.findMany({
      where: { householdId: session.householdId, isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        defaultAccount: {
          select: { id: true, name: true, type: true, currency: true, isShared: true, userId: true },
        },
        categoryRef: true,
        occurrences: {
          orderBy: { dueDate: "asc" },
        },
      },
    });

    const visibleSources = sources.map((source) => {
      const account = source.defaultAccount;
      const canViewAccount = !account || account.isShared || account.userId === session.id;
      const { userId: _userId, ...safeAccount } = account ?? {};
      return {
        ...source,
        defaultAccountId: canViewAccount ? source.defaultAccountId : null,
        defaultAccount: canViewAccount && account ? safeAccount : null,
      };
    });
    return NextResponse.json(visibleSources);
  } catch (error) {
    console.error("Failed to fetch income sources:", error);
    return NextResponse.json({ error: "Failed to fetch income sources" }, { status: 500 });
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
      category,
      categoryId,
      description,
      defaultAccountId,
      expectedAmount,
      currency,
      behavior,
      frequency,
      expectedDay,
      startDate,
      endDate,
    } = body;

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Income source name is required" }, { status: 400 });
    }

    const normalizedBehavior = behavior ?? "RECURRING";
    const normalizedFrequency = frequency;
    if (!["RECURRING", "SEASONAL", "IRREGULAR", "ONE_TIME"].includes(normalizedBehavior)) {
      return NextResponse.json({ error: "Invalid income behavior" }, { status: 400 });
    }
    if (!["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM_SEASONAL"].includes(normalizedFrequency)) {
      return NextResponse.json({ error: "A valid income frequency is required" }, { status: 400 });
    }
    const decExpected = expectedAmount === undefined || expectedAmount === null || expectedAmount === ""
      ? null
      : parsePositiveMoney(expectedAmount);
    if (expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== "" && !decExpected) {
      return NextResponse.json({ error: "Expected income must be a finite positive amount" }, { status: 400 });
    }
    const day = expectedDay === undefined || expectedDay === null || expectedDay === "" ? 1 : Number(expectedDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return NextResponse.json({ error: "Expected day must be an integer from 1 to 31" }, { status: 400 });
    }
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : null;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())) || (end && end < start)) {
      return NextResponse.json({ error: "Income source dates are invalid" }, { status: 400 });
    }
    if (categoryId) {
      const categoryRecord = await prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId } });
      if (!categoryRecord || categoryRecord.type !== "INCOME") {
        return NextResponse.json({ error: "Income category is invalid for this household" }, { status: 400 });
      }
    }
    if (defaultAccountId) {
      const account = await prisma.account.findFirst({ where: { id: defaultAccountId, householdId: session.householdId } });
      if (!account || (!account.isShared && account.userId !== session.id) || account.isArchived) {
        return NextResponse.json({ error: "Income account is unavailable" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const source = await tx.incomeSource.create({
        data: {
          householdId: session.householdId,
          name: name.trim(),
          category: category || "Other",
          categoryId: categoryId || null,
          description: description || null,
          defaultAccountId: defaultAccountId || null,
          expectedAmount: decExpected,
          currency: currency || "INR",
          behavior: normalizedBehavior,
          frequency: normalizedFrequency,
          expectedDay: day,
          startDate: start,
          endDate: end,
          isActive: true,
        },
      });

      // Auto-generate initial occurrence for RECURRING or SEASONAL streams with an expected amount
      if (decExpected && (normalizedBehavior === "RECURRING" || normalizedBehavior === "SEASONAL")) {
        const dueDate = new Date(start.getFullYear(), start.getMonth(), day);
        const periodEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);

        await tx.incomeOccurrence.create({
          data: {
            householdId: session.householdId,
            incomeSourceId: source.id,
            name: `${source.name} - ${dueDate.toLocaleString("default", { month: "short" })} ${dueDate.getFullYear()}`,
            periodStart: start,
            periodEnd: periodEnd,
            dueDate: dueDate,
            expectedAmount: decExpected,
            receivedAmount: new Prisma.Decimal(0),
            outstandingAmount: decExpected,
            status: "PENDING",
          },
        });
      }

      return source;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create income source:", error);
    return NextResponse.json({ error: "Failed to create income source" }, { status: 500 });
  }
}
