import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;

    // Verify transaction exists and belongs to user's household (IDOR Prevention)
    const existingTxn = await prisma.transaction.findFirst({
      where: {
        id,
        householdId: session.householdId,
        account: { is: { OR: [{ isShared: true }, { userId: session.id }] } },
        AND: [{ OR: [{ transferAccountId: null }, { transferAccount: { is: { OR: [{ isShared: true }, { userId: session.id }] } } }] }],
      },
    });

    if (!existingTxn) {
      return NextResponse.json({ error: "Transaction not found or access denied" }, { status: 404 });
    }
    if (existingTxn.isVoided || existingTxn.type === "VOIDED") return NextResponse.json({ success: true, alreadyVoided: true });
    if (existingTxn.refundedAmount.greaterThan(0)) return NextResponse.json({ error: "Transactions with recorded refunds cannot be voided" }, { status: 409 });
    const payslipLink = await prisma.payslipRecord.findFirst({ where: { transactionId: id }, select: { id: true } });
    if (existingTxn.occurrenceId || existingTxn.recurringOccurrenceId || payslipLink || existingTxn.tags?.includes("savings-goal")) {
      return NextResponse.json({ error: "This transaction is linked to an income, bill, salary, or goal workflow and cannot be voided here" }, { status: 409 });
    }

    // Atomic Database Transaction for deletion & balance reversal
    await prisma.$transaction(async (tx) => {
      if (existingTxn.type === "INCOME") {
        await tx.account.update({
          where: { id: existingTxn.accountId },
          data: { balance: { decrement: existingTxn.amount } },
        });
      } else if (existingTxn.type === "EXPENSE") {
        await tx.account.update({
          where: { id: existingTxn.accountId },
          data: { balance: { increment: existingTxn.amount } },
        });
      } else if (existingTxn.type === "TRANSFER") {
        await tx.account.update({
          where: { id: existingTxn.accountId },
          data: { balance: { increment: existingTxn.amount } },
        });
        if (existingTxn.transferAccountId) {
          await tx.account.update({
            where: { id: existingTxn.transferAccountId },
            data: { balance: { decrement: existingTxn.amount } },
          });
        }
      } else if (existingTxn.type === "ADJUSTMENT_INCREASE") {
        await tx.account.update({ where: { id: existingTxn.accountId }, data: { balance: { decrement: existingTxn.amount } } });
      } else if (existingTxn.type === "ADJUSTMENT_DECREASE") {
        await tx.account.update({ where: { id: existingTxn.accountId }, data: { balance: { increment: existingTxn.amount } } });
      }

      await tx.transaction.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidedByUserId: session.id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete transaction:", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
