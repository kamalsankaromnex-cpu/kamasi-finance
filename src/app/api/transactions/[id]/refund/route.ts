import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { isValidIdempotencyKey, parsePositiveMoney, hideIdempotencyKey } from "@/lib/financial-validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let idempotencyKey: string | null = null;
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();
    const { amount, description, notes } = body;

    idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || null;
    if (!idempotencyKey || !isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }

    const refundAmount = parsePositiveMoney(amount);
    if (!refundAmount) {
      return NextResponse.json({ error: "Refund amount must be a finite positive number" }, { status: 400 });
    }

    // Check for previously posted idempotency key
    const previouslyPosted = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (previouslyPosted) {
      if (previouslyPosted.householdId !== session.householdId || previouslyPosted.userId !== session.id) {
        return NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
      }
      return NextResponse.json(hideIdempotencyKey(previouslyPosted), { status: 200 });
    }

    // Verify original transaction exists, is accessible, is EXPENSE, and is not voided
    const originalTxn = await prisma.transaction.findFirst({
      where: {
        id,
        householdId: session.householdId,
        account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
      },
    });

    if (!originalTxn) {
      return NextResponse.json({ error: "Original transaction not found or access denied" }, { status: 404 });
    }

    if (originalTxn.isVoided) {
      return NextResponse.json({ error: "Cannot refund a voided transaction" }, { status: 400 });
    }

    if (originalTxn.type !== "EXPENSE") {
      return NextResponse.json({ error: "Only EXPENSE transactions can be refunded" }, { status: 400 });
    }

    // Calculate maximum allowable refund
    const currentRefunded = originalTxn.refundedAmount;
    const maxRefundAllowed = originalTxn.amount.minus(currentRefunded);

    if (refundAmount.greaterThan(maxRefundAllowed)) {
      return NextResponse.json(
        {
          error: `Refund amount (${refundAmount}) exceeds maximum allowable refund (${maxRefundAllowed})`,
        },
        { status: 400 }
      );
    }

    // Perform atomic refund transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create linked refund transaction
      const refundTxn = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId: originalTxn.accountId,
          categoryId: originalTxn.categoryId,
          userId: session.id,
          idempotencyKey,
          date: new Date(),
          amount: refundAmount,
          type: "EXPENSE", // Linked via refundOfId; net spending logic deducts refundOfId transactions
          refundOfId: originalTxn.id,
          description: description?.trim() || `Refund for: ${originalTxn.description}`,
          notes: notes || null,
        },
      });

      // 2. Update cumulative refunded amount on original transaction
      await tx.transaction.update({
        where: { id: originalTxn.id },
        data: {
          refundedAmount: { increment: refundAmount },
        },
      });

      // 3. Credit account balance
      await tx.account.update({
        where: { id: originalTxn.accountId },
        data: { balance: { increment: refundAmount } },
      });

      return refundTxn;
    });

    return NextResponse.json(hideIdempotencyKey(result), { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002" && idempotencyKey) {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return NextResponse.json(hideIdempotencyKey(existing), { status: 200 });
      }
    }
    console.error("Failed to process refund:", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}
