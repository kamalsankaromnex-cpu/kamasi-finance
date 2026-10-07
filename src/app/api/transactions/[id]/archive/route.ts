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

    const archivedTxn = await prisma.transaction.update({
      where: { id: existingTxn.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: session.id,
      },
    });

    return NextResponse.json(hideIdempotencyKey(archivedTxn));
  } catch (error) {
    console.error("Failed to archive transaction:", error);
    return NextResponse.json({ error: "Failed to archive transaction" }, { status: 500 });
  }
}
