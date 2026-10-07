import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { validateClassificationCombination } from "@/lib/services/classification-service";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { id } = await params;

    const borrowing = await prisma.borrowing.findFirst({
      where: { id, householdId: session.householdId },
      include: {
        lender: true,
        scope: true,
        category: true,
        subcategory: true,
        costCenter: true,
        asset: true,
        receivingAccount: true,
        liabilityAccount: true,
        disbursementJournal: {
          include: { entries: { include: { account: true } } },
        },
        schedules: {
          include: {
            installments: {
              orderBy: { installmentNumber: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        financialEvents: {
          include: {
            journal: {
              include: { entries: { include: { account: true } } },
            },
            reversalOfEvent: true,
          },
          orderBy: { effectiveDate: "desc" },
        },
        lifecycleHistory: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!borrowing) {
      return NextResponse.json({ error: "Borrowing not found" }, { status: 404 });
    }

    return NextResponse.json(borrowing);
  } catch (error) {
    console.error("GET /api/borrowing/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch borrowing" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.borrowing.findFirst({
      where: { id, householdId: session.householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Borrowing not found" }, { status: 404 });
    }

    // Classification validation if classification fields are updated
    if (
      body.scopeId !== undefined ||
      body.categoryId !== undefined ||
      body.subcategoryId !== undefined ||
      body.costCenterId !== undefined
    ) {
      const classValidation = await validateClassificationCombination({
        householdId: session.householdId,
        scopeId: body.scopeId !== undefined ? body.scopeId : existing.scopeId,
        categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
        subcategoryId: body.subcategoryId !== undefined ? body.subcategoryId : existing.subcategoryId,
        costCenterId: body.costCenterId !== undefined ? body.costCenterId : existing.costCenterId,
        isNewRecord: false,
      });
      if (!classValidation.valid) {
        return NextResponse.json({ error: classValidation.error }, { status: 400 });
      }
    }

    const updateData: Prisma.BorrowingUpdateInput = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.purpose !== undefined) updateData.purpose = body.purpose;
    if (body.lenderId !== undefined) updateData.lender = body.lenderId ? { connect: { id: body.lenderId } } : { disconnect: true };
    if (body.scopeId !== undefined) updateData.scope = body.scopeId ? { connect: { id: body.scopeId } } : { disconnect: true };
    if (body.categoryId !== undefined) updateData.category = body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true };
    if (body.subcategoryId !== undefined) updateData.subcategory = body.subcategoryId ? { connect: { id: body.subcategoryId } } : { disconnect: true };
    if (body.costCenterId !== undefined) updateData.costCenter = body.costCenterId ? { connect: { id: body.costCenterId } } : { disconnect: true };
    if (body.assetId !== undefined) updateData.asset = body.assetId ? { connect: { id: body.assetId } } : { disconnect: true };
    if (body.notes !== undefined) updateData.description = body.notes;

    // Financial parameter edits only allowed in DRAFT status
    if (existing.status === "DRAFT") {
      if (body.principalAmount !== undefined) updateData.principalAmount = new Prisma.Decimal(body.principalAmount);
      if (body.interestRate !== undefined) updateData.interestRate = new Prisma.Decimal(body.interestRate);
      if (body.tenureMonths !== undefined) updateData.tenureMonths = parseInt(body.tenureMonths);
      if (body.borrowingType !== undefined) updateData.borrowingType = body.borrowingType;
      if (body.financingType !== undefined) updateData.financingType = body.financingType;
      if (body.repaymentMethod !== undefined) updateData.repaymentMethod = body.repaymentMethod;
    }

    const updated = await prisma.borrowing.update({
      where: { id: existing.id },
      data: updateData,
      include: { lender: true, scope: true, category: true, subcategory: true, costCenter: true, asset: true },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "BORROWING",
      entityId: existing.id,
      action: "UPDATE",
      fromState: existing.status,
      toState: updated.status,
      actorUserId: session.id,
      reason: `Updated borrowing ${updated.name}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/borrowing/[id] error:", error);
    return NextResponse.json({ error: "Failed to update borrowing" }, { status: 500 });
  }
}
