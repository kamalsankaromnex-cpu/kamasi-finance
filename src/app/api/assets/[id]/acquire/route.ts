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

    const body = await req.json().catch(() => ({}));
    const { amount, payingAccountId, assetAccountId, acquisitionDate, idempotencyKey } = body;

    const amountDecimal = amount ? new Prisma.Decimal(amount) : undefined;
    const acqDate = acquisitionDate ? new Date(acquisitionDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return await AssetDomainService.acquireAsset(tx, {
        assetId,
        householdId: session.householdId,
        userId: session.id,
        amount: amountDecimal,
        payingAccountId,
        assetAccountId,
        acquisitionDate: acqDate,
        idempotencyKey,
      });
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Acquire asset error:", error);
    const status = error.message?.startsWith("VALIDATION") || error.message?.startsWith("INVALID") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to acquire asset" }, { status });
  }
}
