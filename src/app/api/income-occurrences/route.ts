import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const sourceIdFilter = searchParams.get("sourceId");

    const occurrences = await prisma.incomeOccurrence.findMany({
      where: {
        householdId: session.householdId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(sourceIdFilter ? { incomeSourceId: sourceIdFilter } : {}),
      },
      orderBy: { dueDate: "asc" },
      include: {
        incomeSource: true,
        transactions: {
          where: {
            account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
          },
          select: {
            id: true,
            date: true,
            amount: true,
            type: true,
            description: true,
            categoryId: true,
            account: { select: { id: true, name: true, type: true, currency: true } },
          },
        },
      },
    });

    return NextResponse.json(occurrences);
  } catch (error) {
    console.error("Failed to fetch income occurrences:", error);
    return NextResponse.json({ error: "Failed to fetch income occurrences" }, { status: 500 });
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
    const { incomeSourceId, name, periodStart, periodEnd, dueDate, expectedAmount, notes } = body;

    if (typeof incomeSourceId !== "string" || !incomeSourceId || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Missing required occurrence fields" }, { status: 400 });
    }

    const decExpected = parsePositiveMoney(expectedAmount);
    if (!decExpected) return NextResponse.json({ error: "Expected amount must be finite and positive" }, { status: 400 });
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return NextResponse.json({ error: "Notes must be text" }, { status: 400 });
    }

    const suppliedDue = dueDate === undefined || dueDate === null || dueDate === "" ? null : parseIsoDate(dueDate);
    const suppliedStart = periodStart === undefined || periodStart === null || periodStart === "" ? null : parseIsoDate(periodStart);
    const suppliedEnd = periodEnd === undefined || periodEnd === null || periodEnd === "" ? null : parseIsoDate(periodEnd);
    if ((dueDate !== undefined && dueDate !== null && dueDate !== "" && !suppliedDue) ||
        (periodStart !== undefined && periodStart !== null && periodStart !== "" && !suppliedStart) ||
        (periodEnd !== undefined && periodEnd !== null && periodEnd !== "" && !suppliedEnd)) {
      return NextResponse.json({ error: "Occurrence dates must be valid ISO dates or timestamps" }, { status: 400 });
    }

    const source = await prisma.incomeSource.findFirst({
      where: { id: incomeSourceId, householdId: session.householdId },
    });

    if (!source) {
      return NextResponse.json({ error: "Income source not found" }, { status: 404 });
    }

    const due = suppliedDue ?? new Date();
    const start = suppliedStart ?? due;
    const end = suppliedEnd ?? due;
    if (start > end) return NextResponse.json({ error: "Occurrence period start must not be after its end" }, { status: 400 });

    const occurrence = await prisma.incomeOccurrence.create({
      data: {
        householdId: session.householdId,
        incomeSourceId,
        name: name.trim(),
        periodStart: start,
        periodEnd: end,
        dueDate: due,
        expectedAmount: decExpected,
        receivedAmount: new Prisma.Decimal(0),
        outstandingAmount: decExpected,
        status: "EXPECTED",
        notes: notes || null,
      },
    });

    return NextResponse.json(occurrence, { status: 201 });
  } catch (error) {
    console.error("Failed to create income occurrence:", error);
    return NextResponse.json({ error: "Failed to create income occurrence" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { occurrenceId, action, accountId, date, amount, idempotencyKey } = body;

    if (typeof occurrenceId !== "string" || !occurrenceId || typeof action !== "string" || !action) {
      return NextResponse.json({ error: "Missing occurrenceId or action" }, { status: 400 });
    }

    const { IncomeDomainService } = await import("@/modules/income/income.service");

    const result = await prisma.$transaction(async (tx) => {
      if (action === "CONFIRM") {
        return await IncomeDomainService.confirm(tx, {
          incomeOccurrenceId: occurrenceId,
          householdId: session.householdId,
          userId: session.id,
        });
      }

      if (action === "CREDIT") {
        if (typeof accountId !== "string" || !accountId) {
          throw new Error("ACCOUNT_REQUIRED");
        }

        // Verify account belongs to household and user has access
        const targetAccount = await tx.account.findFirst({
          where: {
            id: accountId,
            householdId: session.householdId,
            isArchived: false,
            OR: [{ isShared: true }, { userId: session.id }],
          },
        });
        if (!targetAccount) {
          throw new Error("INVALID_ACCOUNT");
        }

        const decAmount = amount ? parsePositiveMoney(amount) : undefined;
        if (amount && !decAmount) {
          throw new Error("INVALID_AMOUNT");
        }

        return await IncomeDomainService.credit(tx, {
          incomeOccurrenceId: occurrenceId,
          householdId: session.householdId,
          accountId,
          amount: decAmount || undefined,
          userId: session.id,
          idempotencyKey: idempotencyKey || undefined,
        });
      }

      if (action === "RECONCILE") {
        return await IncomeDomainService.reconcile(tx, {
          incomeOccurrenceId: occurrenceId,
          householdId: session.householdId,
          userId: session.id,
        });
      }

      if (action === "ARCHIVE") {
        return await IncomeDomainService.archive(tx, {
          incomeOccurrenceId: occurrenceId,
          householdId: session.householdId,
          userId: session.id,
        });
      }

      throw new Error("INVALID_ACTION");
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Failed to update income occurrence lifecycle state:", error);
    if (error.message === "ACCOUNT_REQUIRED") {
      return NextResponse.json({ error: "Please select a receiving bank account" }, { status: 400 });
    }
    if (error.message === "INVALID_ACCOUNT") {
      return NextResponse.json({ error: "The selected receiving account is invalid or unavailable" }, { status: 400 });
    }
    if (error.message === "INVALID_AMOUNT") {
      return NextResponse.json({ error: "Please enter a valid positive amount" }, { status: 400 });
    }
    if (error.message === "INCOME_ALREADY_CREDITED") {
      return NextResponse.json({ error: "This income occurrence has already been credited to an account" }, { status: 400 });
    }
    if (error.message === "INVALID_ACTION") {
      return NextResponse.json({ error: "Invalid lifecycle transition action" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Failed to update income occurrence" }, { status: 400 });
  }
}
