import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
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

    if (existingTxn.status !== "POSTED" && existingTxn.status !== "PARTIALLY_REFUNDED") {
      return NextResponse.json({ error: "Only POSTED or PARTIALLY_REFUNDED transactions can be reconciled" }, { status: 400 });
    }

    const reconciledTxn = await prisma.transaction.update({
      where: { id: existingTxn.id },
      data: {
        status: "RECONCILED",
        reconciledAt: new Date(),
      },
    });

    return NextResponse.json(hideIdempotencyKey(reconciledTxn));
  } catch (error) {
    console.error("Failed to reconcile transaction:", error);
    return NextResponse.json({ error: "Failed to reconcile transaction" }, { status: 500 });
  }
}
