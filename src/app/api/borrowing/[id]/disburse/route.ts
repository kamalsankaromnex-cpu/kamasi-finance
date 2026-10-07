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

    const borrowing = await BorrowingService.disburseBorrowing(prisma, {
      householdId: session.householdId,
      borrowingId: id,
      receivingAccountId: body.receivingAccountId,
      disbursementDate: body.disbursementDate,
      referenceNo: body.referenceNo,
      notes: body.notes,
      idempotencyKey: body.idempotencyKey || req.headers.get("x-idempotency-key") || null,
      userId: session.id,
    });

    return NextResponse.json(borrowing);
  } catch (error: any) {
    console.error("POST /api/borrowing/[id]/disburse error:", error);
    const status = error.message?.includes("VALIDATION_ERROR") ||
      error.message?.includes("ACCOUNT_UNAVAILABLE") ||
      error.message?.includes("INVALID_BORROWING_LIFECYCLE_TRANSITION")
      ? 400
      : error.message?.includes("BORROWING_NOT_FOUND")
      ? 404
      : 500;
    return NextResponse.json({ error: error.message || "Failed to disburse loan" }, { status });
  }
}
