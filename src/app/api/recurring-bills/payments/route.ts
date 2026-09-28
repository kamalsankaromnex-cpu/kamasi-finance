import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { hideIdempotencyKey, isValidIdempotencyKey, parsePositiveMoney } from "@/lib/financial-validation";
import { debitAccountWithinLimit } from "@/lib/ledger";

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || "";
  let requestSession: { id: string; householdId: string } | null = null;
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    requestSession = session;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const {
      occurrenceId,
      accountId,
      amount,
      date,
      merchant,
      notes,
      liabilityId,
      principalAmount,
    } = body;

    const decAmount = parsePositiveMoney(amount);
    if (!isValidIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    if (!occurrenceId || !accountId || !decAmount) {
      return NextResponse.json({ error: "Invalid or non-positive payment amount" }, { status: 400 });
    }

    // IDOR Check: Verify occurrence belongs to user's household
    const occurrence = await prisma.recurringBillOccurrence.findFirst({
      where: { id: occurrenceId, householdId: session.householdId },
      include: { recurringRule: true },
    });

    if (!occurrence) {
      return NextResponse.json({ error: "Bill occurrence not found" }, { status: 404 });
    }

    const prior = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const matches = prior.householdId === session.householdId && prior.userId === session.id && prior.accountId === accountId && prior.recurringOccurrenceId === occurrenceId && prior.amount.equals(decAmount);
      return matches ? NextResponse.json(hideIdempotencyKey(prior), { status: 200 }) : NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
    }
    let decPrincipal: Prisma.Decimal | null = null;
    try {
      decPrincipal = principalAmount !== undefined && principalAmount !== null && principalAmount !== ""
        ? new Prisma.Decimal(principalAmount)
        : null;
    } catch { return NextResponse.json({ error: "Invalid principal amount" }, { status: 400 }); }
    if (liabilityId && (!decPrincipal || !decPrincipal.greaterThan(0) || decPrincipal.greaterThan(decAmount))) {
      return NextResponse.json({ error: "Principal reduction must be positive and no greater than the payment" }, { status: 400 });
    }
    if (!liabilityId && decPrincipal) {
      return NextResponse.json({ error: "A liability is required for principal reduction" }, { status: 400 });
    }

    // IDOR Check: Verify receiving/paying account belongs to user's household
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });

    if (!account || (!account.isShared && account.userId !== session.id) || account.isArchived) {
      return NextResponse.json({ error: "Account does not belong to user's household" }, { status: 403 });
    }

    const payDate = date ? new Date(date) : new Date();
    if (Number.isNaN(payDate.getTime())) return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });

    // Single Atomic Transaction updating Ledger, Account Balance (EXACTLY ONCE), and Bill Occurrence
    const result = await prisma.$transaction(async (tx) => {
      // Conditional decrement makes the outstanding amount the concurrency guard.
      const applied = await tx.recurringBillOccurrence.updateMany({
        where: {
          id: occurrence.id,
          householdId: session.householdId,
          outstandingAmount: { gte: decAmount },
        },
        data: {
          paidAmount: { increment: decAmount },
          outstandingAmount: { decrement: decAmount },
        },
      });
      if (applied.count !== 1) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING");

      if (liabilityId && decPrincipal) {
        const changed = await tx.liability.updateMany({
          where: { id: liabilityId, householdId: session.householdId, amount: { gte: decPrincipal } },
          data: { amount: { decrement: decPrincipal } },
        });
        if (changed.count !== 1) throw new Error("INVALID_LIABILITY_OR_PRINCIPAL");
      }

      // 1. Create Canonical Expense Transaction
      const transaction = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId,
          categoryId: occurrence.recurringRule.categoryId,
          userId: session.id,
          idempotencyKey,
          date: payDate,
          amount: decAmount,
          type: "EXPENSE",
          recurringRuleId: occurrence.recurringRuleId,
          recurringOccurrenceId: occurrence.id,
          merchant: merchant || null,
          description: `Bill Payment: ${occurrence.name}`,
          notes: notes || null,
        },
      });

      // 2. Canonical Single Balance Decrement (DECREMENTED ONCE AND ONLY ONCE)
      const updatedAccount = await debitAccountWithinLimit(tx, { accountId, householdId: session.householdId, amount: decAmount });

      const currentOccurrence = await tx.recurringBillOccurrence.findUniqueOrThrow({ where: { id: occurrence.id } });
      const status = currentOccurrence.outstandingAmount.equals(0) ? "PAID" : "PARTIALLY_PAID";
      const updatedOccurrence = await tx.recurringBillOccurrence.update({
        where: { id: occurrence.id }, data: { status },
      });

      return {
        transaction,
        accountBalance: updatedAccount.balance,
        occurrence: updatedOccurrence,
      };
    });

    return NextResponse.json({ ...result, transaction: hideIdempotencyKey(result.transaction) }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const prior = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (prior && requestSession && prior.householdId === requestSession.householdId && prior.userId === requestSession.id) return NextResponse.json(hideIdempotencyKey(prior), { status: 200 });
    }
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_OUTSTANDING") {
      return NextResponse.json({ error: "Payment amount exceeds the remaining bill amount" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "Insufficient available balance or credit" }, { status: 409 });
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") return NextResponse.json({ error: "Account is unavailable" }, { status: 400 });
    if (error instanceof Error && error.message === "INVALID_LIABILITY_OR_PRINCIPAL") {
      return NextResponse.json({ error: "Liability does not belong to this household or principal exceeds its balance" }, { status: 400 });
    }
    console.error("Failed to record bill payment:", error);
    return NextResponse.json({ error: "Failed to record bill payment" }, { status: 500 });
  }
}
