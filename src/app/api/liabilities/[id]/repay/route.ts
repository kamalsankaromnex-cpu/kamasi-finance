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
    const { principalAmount, interestAmount, payingAccountId, effectiveDate, reason, idempotencyKey } = body;

    if (!principalAmount && !interestAmount) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Principal or interest amount is required" }, { status: 400 });
    }

    const principalDecimal = principalAmount ? new Prisma.Decimal(principalAmount) : new Prisma.Decimal(0);
    const interestDecimal = interestAmount ? new Prisma.Decimal(interestAmount) : new Prisma.Decimal(0);
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.repayLiability(tx, {
        liabilityId,
        householdId: session.householdId,
        userId: session.id,
        principalAmount: principalDecimal,
        interestAmount: interestDecimal,
        payingAccountId,
        effectiveDate: effDate,
        reason,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Repay liability error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("CANNOT") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to repay liability" }, { status });
  }
}
