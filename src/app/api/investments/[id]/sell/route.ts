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
    const { quantity, pricePerUnit, receivingAccountId, gainLossAccountId, effectiveDate, reason, idempotencyKey } = body;

    if (!quantity || pricePerUnit === undefined) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Quantity and price per unit are required" }, { status: 400 });
    }

    const qDecimal = new Prisma.Decimal(quantity);
    const pDecimal = new Prisma.Decimal(pricePerUnit);
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.sellInvestment(tx, {
        investmentId,
        householdId: session.householdId,
        userId: session.id,
        quantity: qDecimal,
        pricePerUnit: pDecimal,
        receivingAccountId,
        gainLossAccountId,
        effectiveDate: effDate,
        reason,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Sell investment error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("CANNOT") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to sell investment" }, { status });
  }
}
