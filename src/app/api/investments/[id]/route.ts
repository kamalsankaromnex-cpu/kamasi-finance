import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { InvestmentDomainService } from "@/modules/investments/investment.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: investmentId } = await params;

    const investment = await prisma.investment.findFirst({
      where: { id: investmentId, householdId: session.householdId },
      include: {
        financialEvents: { orderBy: { createdAt: "desc" } },
        lots: { orderBy: { purchaseDate: "desc" } },
        lifecycleHistory: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!investment) {
      return NextResponse.json({ error: "INVESTMENT_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ investment });
  } catch (error) {
    console.error("Get investment error:", error);
    return NextResponse.json({ error: "Failed to fetch investment" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: investmentId } = await params;

    const mutateForbidden = assertCanMutate(session.role);
    if (mutateForbidden) return mutateForbidden;

    const body = await req.json().catch(() => ({}));

    const updated = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.updateDraft(tx, {
        investmentId,
        householdId: session.householdId,
        userId: session.id,
        data: body,
      });
    });

    return NextResponse.json({ investment: updated });
  } catch (error: any) {
    console.error("Update investment error:", error);
    const status = error.message?.startsWith("CANNOT") || error.message?.startsWith("INVESTMENT_NOT_FOUND") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to update investment" }, { status });
  }
}
