import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { id } = await params;

    const schedule = await prisma.repaymentSchedule.findFirst({
      where: { borrowingId: id, householdId: session.householdId, status: "ACTIVE" },
      include: {
        installments: {
          orderBy: { installmentNumber: "asc" },
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ schedule: null, installments: [] });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("GET /api/borrowing/[id]/schedule error:", error);
    return NextResponse.json({ error: "Failed to fetch repayment schedule" }, { status: 500 });
  }
}

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

    const schedule = await BorrowingService.generateSchedule(prisma, {
      householdId: session.householdId,
      borrowingId: id,
      frequency: body.frequency,
      startDate: body.startDate,
      tenureMonths: body.tenureMonths ? parseInt(body.tenureMonths) : undefined,
      principalAmount: body.principalAmount,
      interestRate: body.interestRate,
      userId: session.id,
    });

    return NextResponse.json(schedule);
  } catch (error: any) {
    console.error("POST /api/borrowing/[id]/schedule error:", error);
    const status = error.message?.includes("SCHEDULE_LOCKED_AFTER_PAYMENTS") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to generate schedule" }, { status });
  }
}
