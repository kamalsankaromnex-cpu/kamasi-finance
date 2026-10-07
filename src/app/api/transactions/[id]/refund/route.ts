import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { isValidIdempotencyKey, parsePositiveMoney, hideIdempotencyKey } from "@/lib/financial-validation";
import { FinancialCommand } from "@/finance/financial-command";

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

    // Perform atomic refund transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-query original transaction inside transaction lock
      const targetTxn = await tx.transaction.findFirst({
        where: { id, householdId: session.householdId },
      });
      if (!targetTxn || targetTxn.isVoided || targetTxn.type !== "EXPENSE") {
        throw new Error("INVALID_REFUND_TARGET");
      }

      const currentRefunded = targetTxn.refundedAmount;
      const maxRefundAllowed = targetTxn.amount.minus(currentRefunded);

      if (refundAmount.greaterThan(maxRefundAllowed)) {
        throw new Error(`REFUND_EXCEEDS_MAX:${maxRefundAllowed}`);
      }

      // 2. Post Financial Command (posts double-entry journal & credits account balance ONCE)
      const journal = await FinancialCommand.postRefund(tx, {
        householdId: session.householdId,
        accountId: targetTxn.accountId,
        amount: refundAmount,
        description: description?.trim() || `Refund for: ${targetTxn.description}`,
        refundOfId: targetTxn.id,
        idempotencyKey,
      });

      // 3. Create linked refund transaction record with journalId link
      const refundTxn = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId: targetTxn.accountId,
          categoryId: targetTxn.categoryId,
          userId: session.id,
          idempotencyKey,
          date: new Date(),
          amount: refundAmount,
          type: "INCOME",
          refundOfId: targetTxn.id,
          description: description?.trim() || `Refund for: ${targetTxn.description}`,
          notes: notes || null,
          journalId: journal.id,
        },
      });

      // 4. Update cumulative refunded amount on original transaction
      await tx.transaction.update({
        where: { id: targetTxn.id },
        data: {
          refundedAmount: { increment: refundAmount },
        },
      });

      return refundTxn;
    });

    return NextResponse.json(hideIdempotencyKey(result), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REFUND_EXCEEDS_MAX:")) {
      const max = error.message.split(":")[1];
      return NextResponse.json({ error: `Refund amount exceeds maximum allowable refund (${max})` }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_REFUND_TARGET") {
      return NextResponse.json({ error: "Original transaction not found or access denied" }, { status: 404 });
    }
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
