import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";

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
    const body = await req.json();

    const updated = await BorrowingService.repayBorrowing(prisma, {
      householdId: session.householdId,
      borrowingId: id,
      payingAccountId: body.payingAccountId,
      principalAmount: body.principalAmount,
      interestAmount: body.interestAmount,
      paymentDate: body.paymentDate,
      referenceNo: body.referenceNo,
      notes: body.notes,
      installmentId: body.installmentId,
      idempotencyKey: body.idempotencyKey || req.headers.get("x-idempotency-key") || null,
      userId: session.id,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("POST /api/borrowing/[id]/repay error:", error);
    const status = error.message?.includes("VALIDATION_ERROR") ||
      error.message?.includes("OVER_REPAYMENT_ERROR") ||
      error.message?.includes("ACCOUNT_UNAVAILABLE") ||
      error.message?.includes("INVALID_STATE")
      ? 400
      : error.message?.includes("BORROWING_NOT_FOUND")
      ? 404
      : 500;
    return NextResponse.json({ error: error.message || "Failed to record repayment" }, { status });
  }
}
