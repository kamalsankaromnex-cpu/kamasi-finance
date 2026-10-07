import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: liabilityId } = await params;

    const liability = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.restoreLiability(tx, {
        liabilityId,
        householdId: session.householdId,
        userId: session.id,
      });
    });

    return NextResponse.json({ liability }, { status: 200 });
  } catch (error: any) {
    console.error("Restore liability error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") || error.message?.startsWith("INVALID_LIABILITY_LIFECYCLE_TRANSITION") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to restore liability" }, { status });
  }
}
