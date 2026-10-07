import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { AssetDomainService } from "@/modules/assets/asset.service";
import { Prisma } from "@prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id: assetId } = await params;

    const body = await req.json();
    const { proceeds, receivingAccountId, adjustmentAccountId, effectiveDate, reason, idempotencyKey } = body;

    if (proceeds === undefined || proceeds === null) {
      return NextResponse.json({ error: "VALIDATION_FAILED: proceeds is required" }, { status: 400 });
    }

    const proceedsDecimal = new Prisma.Decimal(proceeds);
    const effDate = effectiveDate ? new Date(effectiveDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await AssetDomainService.disposeAsset(tx, {
        assetId,
        householdId: session.householdId,
        userId: session.id,
        proceeds: proceedsDecimal,
        receivingAccountId,
        adjustmentAccountId,
        effectiveDate: effDate,
        reason,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Dispose asset error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to dispose asset" }, { status });
  }
}
