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

    const body = await req.json().catch(() => ({}));
    const { eventId, reason } = body;

    if (!eventId) {
      return NextResponse.json({ error: "VALIDATION_FAILED: eventId is required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.reverseEvent(tx, {
        investmentId,
        householdId: session.householdId,
        userId: session.id,
        eventId,
        reason,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Reverse investment event error:", error);
    const status = error.message?.startsWith("VALIDATION") ||
      error.message?.startsWith("INVALID") ||
      error.message?.startsWith("CANNOT") ||
      error.message?.startsWith("EVENT_") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to reverse investment event" }, { status });
  }
}
