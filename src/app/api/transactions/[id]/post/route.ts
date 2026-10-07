import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { FinancialCommand } from "@/finance/financial-command";
import { hideIdempotencyKey } from "@/lib/financial-validation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existingTxn = await prisma.transaction.findFirst({
      where: {
        id,
        householdId: session.householdId,
      },
    });

    if (!existingTxn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (existingTxn.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT transactions can be posted" }, { status: 400 });
    }

    const idempotencyKey = existingTxn.idempotencyKey || `POST_DRAFT_${existingTxn.id}`;

    const postedTxn = await prisma.$transaction(async (tx) => {
      if (existingTxn.type === "EXPENSE") {
        await FinancialCommand.postExpense(tx, {
          householdId: session.householdId,
          accountId: existingTxn.accountId,
          amount: existingTxn.amount,
          description: existingTxn.description,
          categoryId: existingTxn.categoryId || undefined,
          date: existingTxn.date,
          idempotencyKey,
        });
      } else if (existingTxn.type === "INCOME") {
        await FinancialCommand.postIncome(tx, {
          householdId: session.householdId,
          accountId: existingTxn.accountId,
          amount: existingTxn.amount,
          description: existingTxn.description,
          categoryId: existingTxn.categoryId || undefined,
          date: existingTxn.date,
          idempotencyKey,
        });
      }

      return tx.transaction.update({
        where: { id: existingTxn.id },
        data: {
          status: "POSTED",
          postedAt: new Date(),
        },
      });
    });

    return NextResponse.json(hideIdempotencyKey(postedTxn));
  } catch (error) {
    console.error("Failed to post draft transaction:", error);
    return NextResponse.json({ error: "Failed to post draft transaction" }, { status: 500 });
  }
}
