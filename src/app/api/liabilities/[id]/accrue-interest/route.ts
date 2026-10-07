import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";
import { Prisma } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: liabilityId } = await params;

    const body = await req.json().catch(() => ({}));
    const { interestAmount, expenseAccountId, effectiveDate, reason, idempotencyKey } = body;

    if (!interestAmount) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Interest amount is required" }, { status: 400 });
    }

    const interestDecimal = new Prisma.Decimal(interestAmount);
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.accrueInterest(tx, {
        liabilityId,
        householdId: session.householdId,
        userId: session.id,
        interestAmount: interestDecimal,
        expenseAccountId,
        effectiveDate: effDate,
        reason,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Accrue interest error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("CANNOT") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to accrue interest" }, { status });
  }
}
