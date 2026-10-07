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

    const updated = await BorrowingService.archiveBorrowing(prisma, {
      householdId: session.householdId,
      borrowingId: id,
      userId: session.id,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("POST /api/borrowing/[id]/archive error:", error);
    const status = error.message?.includes("BORROWING_NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: error.message || "Failed to archive borrowing" }, { status });
  }
}
