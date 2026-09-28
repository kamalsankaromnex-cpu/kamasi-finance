import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { hideIdempotencyKey, isValidIdempotencyKey, isValidTransactionType, parsePositiveMoney } from "@/lib/financial-validation";
import { debitAccountWithinLimit } from "@/lib/ledger";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const transactions = await prisma.transaction.findMany({
      where: {
        householdId: session.householdId,
        account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
        AND: [{ OR: [{ transferAccountId: null }, { transferAccount: { is: { OR: [{ isShared: true }, { userId: session.id }] } } }] }],
      },
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true, type: true, balance: true, currency: true, isShared: true, userId: true } },
        transferAccount: { select: { id: true, name: true, type: true, balance: true, currency: true, isShared: true, userId: true } },
        category: true,
        user: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(transactions.map(hideIdempotencyKey));
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let idempotencyKey: string | null = null;
  let requestSession: { id: string; householdId: string } | null = null;
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    requestSession = session;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { accountId, categoryId, date, amount, type, transferAccountId, description, notes, tags } = body;

    if (!accountId || amount === undefined || amount === null || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || null;
    if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }

    const normalizedType = type ?? "EXPENSE";
    if (!isValidTransactionType(normalizedType)) {
      return NextResponse.json({ error: "Transaction type must be INCOME, EXPENSE, or TRANSFER" }, { status: 400 });
    }
    const decAmount = parsePositiveMoney(amount);
    if (!decAmount) {
      return NextResponse.json({ error: "Amount must be a finite positive number" }, { status: 400 });
    }
    const txnDate = date === undefined ? new Date() : new Date(date);
    if (Number.isNaN(txnDate.getTime())) return NextResponse.json({ error: "Invalid transaction date" }, { status: 400 });
    const previouslyPosted = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (previouslyPosted) {
      if (previouslyPosted.householdId !== session.householdId || previouslyPosted.userId !== session.id) {
        return NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
      }
      const sameRequest = previouslyPosted.accountId === accountId &&
        previouslyPosted.transferAccountId === (normalizedType === "TRANSFER" ? transferAccountId : null) &&
        previouslyPosted.categoryId === (categoryId || null) && previouslyPosted.type === normalizedType &&
        previouslyPosted.description === description.trim() && previouslyPosted.amount.equals(decAmount) &&
        previouslyPosted.date.getTime() === txnDate.getTime() && (previouslyPosted.notes || null) === (notes || null) &&
        (previouslyPosted.tags || null) === (tags || null);
      return sameRequest
        ? NextResponse.json(hideIdempotencyKey(previouslyPosted), { status: 200 })
        : NextResponse.json({ error: "Idempotency key was reused with different transaction data" }, { status: 409 });
    }

    // Verify account belongs to user's household (IDOR Prevention)
    const sourceAccount = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });

    if (!sourceAccount) {
      return NextResponse.json(
        { error: "Forbidden: Account does not belong to user's household" },
        { status: 403 }
      );
    }
    if (!sourceAccount.isShared && sourceAccount.userId !== session.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (sourceAccount.isArchived) return NextResponse.json({ error: "Archived accounts cannot receive transactions" }, { status: 400 });

    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId } });
      if (!category || (normalizedType === "TRANSFER" ? category.type !== "TRANSFER" : category.type !== normalizedType)) {
        return NextResponse.json({ error: "Category is invalid for this transaction" }, { status: 400 });
      }
    }

    if (normalizedType === "TRANSFER") {
      if (!transferAccountId || transferAccountId === accountId) {
        return NextResponse.json({ error: "A distinct destination account is required for a transfer" }, { status: 400 });
      }
      const destAccount = await prisma.account.findFirst({
        where: { id: transferAccountId, householdId: session.householdId },
      });

      if (!destAccount) {
        return NextResponse.json(
          { error: "Forbidden: Destination account does not belong to user's household" },
          { status: 403 }
        );
      }
      if ((!destAccount.isShared && destAccount.userId !== session.id) || destAccount.isArchived) {
        return NextResponse.json({ error: "Destination account is unavailable" }, { status: 400 });
      }
    }

    // Atomic Double-Entry Database Transaction Scoped to Session Household
    const result = await prisma.$transaction(async (tx) => {
      const createdTxn = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId,
          categoryId: categoryId || null,
          userId: session.id,
          idempotencyKey,
          date: txnDate,
          amount: decAmount,
          type: normalizedType,
          transferAccountId: normalizedType === "TRANSFER" ? transferAccountId : null,
          description: description.trim(),
          notes: notes || null,
          tags: tags || null,
        },
      });

      if (normalizedType === "INCOME") {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: decAmount } },
        });
      } else if (normalizedType === "EXPENSE") {
        await debitAccountWithinLimit(tx, { accountId, householdId: session.householdId, amount: decAmount });
      } else if (normalizedType === "TRANSFER") {
        await debitAccountWithinLimit(tx, { accountId, householdId: session.householdId, amount: decAmount });
        await tx.account.update({ where: { id: transferAccountId }, data: { balance: { increment: decAmount } } });
      }

      return createdTxn;
    });

    return NextResponse.json(hideIdempotencyKey(result), { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && idempotencyKey && requestSession) {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (existing && existing.householdId === requestSession.householdId && existing.userId === requestSession.id) {
        return NextResponse.json(hideIdempotencyKey(existing), { status: 200 });
      }
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") return NextResponse.json({ error: "Insufficient available balance or credit" }, { status: 409 });
    if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") return NextResponse.json({ error: "Account is unavailable" }, { status: 400 });
    console.error("Failed to create transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
