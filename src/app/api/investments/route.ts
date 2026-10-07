import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");

    const where: Prisma.InvestmentWhereInput = {
      householdId: session.householdId,
    };
    if (status) where.status = status;
    if (category) where.category = category;

    const investments = await prisma.investment.findMany({
      where,
      include: {
        financialEvents: { orderBy: { createdAt: "desc" } },
        lots: { orderBy: { purchaseDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ investments });
  } catch (error) {
    console.error("Fetch investments error:", error);
    return NextResponse.json({ error: "Failed to fetch investments" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const mutateForbidden = assertCanMutate(session.role);
    if (mutateForbidden) return mutateForbidden;

    const body = await req.json();
    const { name, category, type, symbol, currency, description, investmentAccountId, notes } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "VALIDATION_FAILED: Investment name is required" }, { status: 400 });
    }

    const investment = await prisma.$transaction(async (tx) => {
      return await InvestmentDomainService.createDraft(tx, {
        householdId: session.householdId,
        userId: session.id,
        name,
        category,
        type,
        symbol,
        currency,
        description,
        investmentAccountId,
        notes,
      });
    });

    return NextResponse.json({ investment }, { status: 201 });
  } catch (error: any) {
    console.error("Create investment draft error:", error);
    return NextResponse.json({ error: error.message || "Failed to create investment draft" }, { status: 500 });
  }
}
