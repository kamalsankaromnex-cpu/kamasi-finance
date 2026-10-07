import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: liabilityId } = await params;

    const liability = await prisma.liability.findFirst({
      where: { id: liabilityId, householdId: session.householdId },
      include: {
        financialEvents: { orderBy: { createdAt: "desc" } },
        lifecycleHistory: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!liability) {
      return NextResponse.json({ error: "LIABILITY_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ liability });
  } catch (error) {
    console.error("Get liability error:", error);
    return NextResponse.json({ error: "Failed to fetch liability" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: liabilityId } = await params;

    const body = await req.json().catch(() => ({}));

    const updated = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.updateDraft(tx, {
        liabilityId,
        householdId: session.householdId,
        userId: session.id,
        data: body,
      });
    });

    return NextResponse.json({ liability: updated });
  } catch (error: any) {
    console.error("Update liability error:", error);
    const status = error.message?.startsWith("CANNOT") || error.message?.startsWith("LIABILITY_NOT_FOUND") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to update liability" }, { status });
  }
}
