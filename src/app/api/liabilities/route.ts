import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");

    const where: Prisma.LiabilityWhereInput = {
      householdId: session.householdId,
    };
    if (status) where.status = status;
    if (category) where.category = category;

    const liabilities = await prisma.liability.findMany({
      where,
      include: {
        financialEvents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ liabilities });
  } catch (error) {
    console.error("Fetch liabilities error:", error);
    return NextResponse.json({ error: "Failed to fetch liabilities" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const body = await req.json();
    const { name, category, type, description, principalAmount, interestRate, startDate, dueDate, lender, liabilityAccountId, notes } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "VALIDATION_FAILED: Liability name is required" }, { status: 400 });
    }

    if (!principalAmount) {
      return NextResponse.json({ error: "VALIDATION_FAILED: Principal amount is required" }, { status: 400 });
    }

    const principalDecimal = new Prisma.Decimal(principalAmount);
    const rateDecimal = interestRate ? new Prisma.Decimal(interestRate) : new Prisma.Decimal(0);

    const liability = await prisma.$transaction(async (tx) => {
      return await LiabilityDomainService.createDraft(tx, {
        householdId: session.householdId,
        userId: session.id,
        name,
        category,
        type,
        description,
        principalAmount: principalDecimal,
        interestRate: rateDecimal,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        lender,
        liabilityAccountId,
        notes,
      });
    });

    return NextResponse.json({ liability }, { status: 201 });
  } catch (error: any) {
    console.error("Create liability draft error:", error);
    return NextResponse.json({ error: error.message || "Failed to create liability draft" }, { status: 500 });
  }
}
