import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { InvestmentDomainService } from "@/modules/investments/investment.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: investmentId } = await params;

    const mutateForbidden = assertCanMutate(session.role);
    if (mutateForbidden) return mutateForbidden;

    const investment = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.restoreInvestment(tx, {
        investmentId,
        householdId: session.householdId,
        userId: session.id,
      });
    });

    return NextResponse.json({ investment }, { status: 200 });
  } catch (error: any) {
    console.error("Restore investment error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("INVALID_INVESTMENT_LIFECYCLE_TRANSITION") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to restore investment" }, { status });
  }
}
