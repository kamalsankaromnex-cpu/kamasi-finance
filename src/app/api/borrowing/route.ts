import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { BorrowingService } from "@/modules/borrowing/borrowing.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const scopeId = searchParams.get("scopeId");
    const lenderId = searchParams.get("lenderId");
    const borrowingType = searchParams.get("borrowingType");
    const includeArchived = searchParams.get("includeArchived") === "true";

    const where: Prisma.BorrowingWhereInput = {
      householdId: session.householdId,
      ...(includeArchived
        ? {}
        : status
        ? { status }
        : { status: { not: "ARCHIVED" } }),
      ...(scopeId ? { scopeId } : {}),
      ...(lenderId ? { lenderId } : {}),
      ...(borrowingType ? { borrowingType } : {}),
    };

    const borrowings = await prisma.borrowing.findMany({
      where,
      include: {
        lender: true,
        scope: { select: { id: true, name: true, color: true, icon: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
        subcategory: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, category: true } },
        receivingAccount: { select: { id: true, name: true, type: true } },
        liabilityAccount: { select: { id: true, name: true, balance: true } },
        schedules: {
          where: { status: "ACTIVE" },
          select: { id: true, totalInstallments: true, totalAmount: true },
        },
        _count: {
          select: {
            installments: true,
            financialEvents: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json(borrowings);
  } catch (error) {
    console.error("GET /api/borrowing error:", error);
    return NextResponse.json({ error: "Failed to fetch borrowings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    // Strict P0 RBAC mutation guard
    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();

    const borrowing = await BorrowingService.createDraft(prisma, {
      householdId: session.householdId,
      name: body.name,
      description: body.description,
      lenderId: body.lenderId,
      lenderName: body.lenderName,
      lenderType: body.lenderType,
      borrowingType: body.borrowingType,
      financingType: body.financingType,
      repaymentMethod: body.repaymentMethod,
      purpose: body.purpose,
      principalAmount: body.principalAmount,
      interestRate: body.interestRate,
      tenureMonths: body.tenureMonths ? parseInt(body.tenureMonths) : undefined,
      startDate: body.startDate,
      maturityDate: body.maturityDate,
      firstPaymentDate: body.firstPaymentDate,
      scopeId: body.scopeId,
      categoryId: body.categoryId,
      subcategoryId: body.subcategoryId,
      costCenterId: body.costCenterId,
      assetId: body.assetId,
      liabilityAccountId: body.liabilityAccountId,
      receivingAccountId: body.receivingAccountId,
      userId: session.id,
    });

    return NextResponse.json(borrowing, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/borrowing error:", error);
    const status = error.message?.includes("VALIDATION_ERROR") || error.message?.includes("CLASSIFICATION_INVALID") ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to create borrowing" }, { status });
  }
}
