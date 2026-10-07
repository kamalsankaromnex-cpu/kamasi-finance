import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { AssetDomainService } from "@/modules/assets/asset.service";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");

    const where: Prisma.AssetWhereInput = {
      householdId: session.householdId,
    };
    if (status) where.status = status;
    if (category) where.category = category;

    const assets = await prisma.asset.findMany({
      where,
      include: {
        financialEvents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assets });
  } catch (error) {
    console.error("Fetch assets error:", error);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const body = await req.json();
    const { name, category, description, initialValue, assetAccountId, notes } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "VALIDATION_FAILED: Asset name is required" }, { status: 400 });
    }

    const initialValDecimal = initialValue ? new Prisma.Decimal(initialValue) : new Prisma.Decimal(0);

    const asset = await prisma.$transaction(async (tx) => {
      return await AssetDomainService.createDraft(tx, {
        householdId: session.householdId,
        userId: session.id,
        name,
        category,
        description,
        initialValue: initialValDecimal,
        assetAccountId,
        notes,
      });
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error: any) {
    console.error("Create asset draft error:", error);
    return NextResponse.json({ error: error.message || "Failed to create asset draft" }, { status: 500 });
  }
}
