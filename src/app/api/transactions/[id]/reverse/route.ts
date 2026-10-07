import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { reverseLedgerTransaction } from "@/lib/ledger";
import { hideIdempotencyKey } from "@/lib/financial-validation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const voidedTxn = await prisma.$transaction(async (tx) => {
      return await reverseLedgerTransaction(tx, {
        transactionId: id,
        householdId: session.householdId,
        voidedByUserId: session.id,
      });
    });

    return NextResponse.json(hideIdempotencyKey(voidedTxn), { status: 200 });
  } catch (error: any) {
    if (error?.message === "TRANSACTION_NOT_FOUND") {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (error?.message === "TRANSACTION_ALREADY_VOIDED") {
      return NextResponse.json({ error: "Transaction has already been voided" }, { status: 400 });
    }
    console.error("Failed to reverse transaction:", error);
    return NextResponse.json({ error: "Failed to reverse transaction" }, { status: 500 });
  }
}
