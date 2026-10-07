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

    if (!body.eventId) {
      return NextResponse.json({ error: "eventId is required for reversal" }, { status: 400 });
    }

    const updated = await BorrowingService.reverseEvent(prisma, {
      householdId: session.householdId,
      borrowingId: id,
      eventId: body.eventId,
      reason: body.reason,
      userId: session.id,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("POST /api/borrowing/[id]/reverse error:", error);
    const status = error.message?.includes("DISBURSEMENT_REVERSAL_BLOCKED") ||
      error.message?.includes("EVENT_ALREADY_REVERSED") ||
      error.message?.includes("UNSUPPORTED_EVENT_REVERSAL")
      ? 400
      : error.message?.includes("BORROWING_NOT_FOUND") || error.message?.includes("EVENT_NOT_FOUND")
      ? 404
      : 500;
    return NextResponse.json({ error: error.message || "Failed to reverse borrowing event" }, { status });
  }
}
