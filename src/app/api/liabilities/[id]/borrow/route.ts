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
    const { principalAmount, receivingAccountId, liabilityAccountId, effectiveDate, idempotencyKey } = body;

    const principalDecimal = principalAmount ? new Prisma.Decimal(principalAmount) : undefined;
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.borrowLiability(tx, {
        liabilityId,
        householdId: session.householdId,
        userId: session.id,
        principalAmount: principalDecimal,
        receivingAccountId,
        liabilityAccountId,
        effectiveDate: effDate,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Borrow liability error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to borrow liability" }, { status });
  }
}
