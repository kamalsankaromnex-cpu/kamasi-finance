import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { hideIdempotencyKey, isValidIdempotencyKey, parsePositiveMoney } from "@/lib/financial-validation";
import { FinancialCommand } from "@/finance/financial-command";

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
      incomeSourceId,
      occurrenceId,
      accountId,
      amount,
      date,
      paymentMethod,
      referenceNo,
      description,
      notes,
    } = body;

    if (!accountId || !amount || (!incomeSourceId && !occurrenceId)) {
      return NextResponse.json({ error: "Missing required receipt fields" }, { status: 400 });
    }
    if (!isValidIdempotencyKey(idempotencyKey)) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

    // IDOR check: Verify target account belongs to user's household
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });

    if (!account || (!account.isShared && account.userId !== session.id) || account.isArchived) {
      return NextResponse.json({ error: "Account does not belong to user's household" }, { status: 403 });
    }

    let sourceId = incomeSourceId;
    let categoryIdToUse: string | null = null;
    let sourceName = "Income Stream";

    if (occurrenceId) {
      const occurrence = await prisma.incomeOccurrence.findFirst({
        where: { id: occurrenceId, householdId: session.householdId },
        include: { incomeSource: true },
      });
      if (!occurrence) {
        return NextResponse.json({ error: "Income occurrence not found" }, { status: 404 });
      }
      sourceId = occurrence.incomeSourceId;
      sourceName = occurrence.incomeSource.name;
      categoryIdToUse = occurrence.incomeSource.categoryId;
    } else if (incomeSourceId) {
      const source = await prisma.incomeSource.findFirst({
        where: { id: incomeSourceId, householdId: session.householdId },
      });
      if (!source) {
        return NextResponse.json({ error: "Income source not found" }, { status: 404 });
      }
      sourceName = source.name;
      categoryIdToUse = source.categoryId;
    }

    const decAmount = parsePositiveMoney(amount);
    if (!decAmount) return NextResponse.json({ error: "Receipt amount must be finite and positive" }, { status: 400 });
    const prior = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (prior) {
      if (prior.householdId === session.householdId && prior.userId === session.id && prior.accountId === accountId && prior.incomeSourceId === sourceId && prior.occurrenceId === (occurrenceId || null) && prior.type === "INCOME" && prior.amount.equals(decAmount)) {
        return NextResponse.json(hideIdempotencyKey(prior), { status: 200 });
      }
      return NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
    }
    const receiptDate = date ? new Date(date) : new Date();
    if (Number.isNaN(receiptDate.getTime())) return NextResponse.json({ error: "Invalid receipt date" }, { status: 400 });

    // Single Atomic Transaction updating Transaction Ledger, Account Balance (EXACTLY ONCE), and Occurrence Status
    const result = await prisma.$transaction(async (tx) => {
      // 1. Post Financial Command (posts double-entry journal & credits account balance ONCE)
      await FinancialCommand.postIncome(tx, {
        householdId: session.householdId,
        accountId,
        amount: decAmount,
        description: description || `Actual Income Received: ${sourceName}`,
        categoryId: categoryIdToUse,
        date: receiptDate,
        idempotencyKey,
      });

      // 2. Create Immutable Ledger Transaction
      const transaction = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId,
          categoryId: categoryIdToUse,
          userId: session.id,
          idempotencyKey,
          date: receiptDate,
          amount: decAmount,
          type: "INCOME",
          incomeSourceId: sourceId,
          occurrenceId: occurrenceId || null,
          paymentMethod: paymentMethod || "BANK_TRANSFER",
          referenceNo: referenceNo || null,
          description: description || `Actual Income Received: ${sourceName}`,
          notes: notes || null,
        },
      });

      const updatedAccount = await tx.account.findUniqueOrThrow({ where: { id: accountId } });

      // 3. Update IncomeOccurrence Totals & Status (if applicable)
      let updatedOccurrence = null;
      if (occurrenceId) {
        const applied = await tx.incomeOccurrence.updateMany({
          where: { id: occurrenceId, householdId: session.householdId, outstandingAmount: { gte: decAmount } },
          data: { receivedAmount: { increment: decAmount }, outstandingAmount: { decrement: decAmount } },
        });
        if (applied.count !== 1) throw new Error("RECEIPT_EXCEEDS_OUTSTANDING");
        const occ = await tx.incomeOccurrence.findFirst({
          where: { id: occurrenceId, householdId: session.householdId },
        });

        if (occ) {
          const status = occ.outstandingAmount.equals(0) ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";

          updatedOccurrence = await tx.incomeOccurrence.update({
            where: { id: occurrenceId },
            data: {
              status,
            },
          });
        }
      }

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
    if (error instanceof Error && error.message === "RECEIPT_EXCEEDS_OUTSTANDING") {
      return NextResponse.json({ error: "Receipt exceeds the outstanding income amount" }, { status: 400 });
    }
    console.error("Failed to process income receipt:", error);
    return NextResponse.json({ error: "Failed to process income receipt" }, { status: 500 });
  }
}
