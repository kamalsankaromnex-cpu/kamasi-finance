import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { Prisma } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: investmentId } = await params;

    const mutateForbidden = assertCanMutate(session.role);
    if (mutateForbidden) return mutateForbidden;

    const body = await req.json().catch(() => ({}));
    const { incomeType, amount, receivingAccountId, incomeAccountId, effectiveDate, reason, idempotencyKey } = body;

    if (!incomeType || !["DIVIDEND", "INTEREST"].includes(incomeType)) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Valid incomeType (DIVIDEND or INTEREST) is required" }, { status: 400 });
    }

    if (!amount) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Amount is required" }, { status: 400 });
    }

    const amountDecimal = new Prisma.Decimal(amount);
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.recordIncome(tx, {
        investmentId,
        householdId: session.householdId,
        userId: session.id,
        incomeType,
        amount: amountDecimal,
        receivingAccountId,
        incomeAccountId,
        effectiveDate: effDate,
        reason,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Record income error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("CANNOT") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to record income" }, { status });
  }
}
