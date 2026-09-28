import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parsePositiveMoney } from "@/lib/financial-validation";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid income source payload" }, { status: 400 });
    const { name, category, categoryId, description, defaultAccountId, expectedAmount, behavior, frequency, expectedDay, startDate, endDate } = body as Record<string, unknown>;

    const existingSource = await prisma.incomeSource.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existingSource) {
      return NextResponse.json({ error: "Income source not found" }, { status: 404 });
    }

    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 160)) return NextResponse.json({ error: "Income source name must be 1–160 characters" }, { status: 400 });
    if (category !== undefined && (typeof category !== "string" || !category.trim() || category.length > 80)) return NextResponse.json({ error: "Income category label is invalid" }, { status: 400 });
    if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 2000)) return NextResponse.json({ error: "Description must be text up to 2000 characters" }, { status: 400 });
    const decExpected = expectedAmount === undefined ? existingSource.expectedAmount : expectedAmount === null || expectedAmount === "" ? null : parsePositiveMoney(expectedAmount);
    if (expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== "" && !decExpected) return NextResponse.json({ error: "Expected income must be a finite positive amount" }, { status: 400 });
    if (behavior !== undefined && !["RECURRING", "SEASONAL", "IRREGULAR", "ONE_TIME"].includes(String(behavior))) return NextResponse.json({ error: "Invalid income behavior" }, { status: 400 });
    if (frequency !== undefined && !["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM_SEASONAL"].includes(String(frequency))) return NextResponse.json({ error: "Invalid income frequency" }, { status: 400 });
    const day = expectedDay === undefined ? existingSource.expectedDay : expectedDay === null || expectedDay === "" ? null : Number(expectedDay);
    if (expectedDay !== undefined && day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return NextResponse.json({ error: "Expected day must be an integer from 1 to 31" }, { status: 400 });

    const nextCategoryId = categoryId === undefined ? existingSource.categoryId : categoryId === null || categoryId === "" ? null : categoryId;
    if (nextCategoryId !== null) {
      if (typeof nextCategoryId !== "string") return NextResponse.json({ error: "Income category is invalid" }, { status: 400 });
      const categoryRecord = await prisma.category.findFirst({ where: { id: nextCategoryId, householdId: session.householdId, type: "INCOME" }, select: { id: true } });
      if (!categoryRecord) return NextResponse.json({ error: "Income category is invalid for this household" }, { status: 400 });
    }
    const nextAccountId = defaultAccountId === undefined ? existingSource.defaultAccountId : defaultAccountId === null || defaultAccountId === "" ? null : defaultAccountId;
    if (nextAccountId !== null) {
      if (typeof nextAccountId !== "string") return NextResponse.json({ error: "Income account is invalid" }, { status: 400 });
      const account = await prisma.account.findFirst({ where: { id: nextAccountId, householdId: session.householdId, OR: [{ isShared: true }, { userId: session.id }], isArchived: false }, select: { id: true } });
      if (!account) return NextResponse.json({ error: "Income account is unavailable" }, { status: 400 });
    }
    const nextStart = startDate === undefined ? existingSource.startDate : startDate === null || startDate === "" ? null : parseIsoDate(startDate);
    const nextEnd = endDate === undefined ? existingSource.endDate : endDate === null || endDate === "" ? null : parseIsoDate(endDate);
    if ((startDate !== undefined && startDate !== null && startDate !== "" && !nextStart) || (endDate !== undefined && endDate !== null && endDate !== "" && !nextEnd)) return NextResponse.json({ error: "Income source dates must be valid ISO dates" }, { status: 400 });
    if (nextStart && nextEnd && nextEnd < nextStart) return NextResponse.json({ error: "Income source end date cannot precede its start date" }, { status: 400 });

    const updatedSource = await prisma.incomeSource.update({
      where: { id, householdId: session.householdId },
      data: {
        ...(name !== undefined && { name: (name as string).trim() }),
        ...(category !== undefined && { category: (category as string).trim() }),
        categoryId: nextCategoryId,
        ...(description !== undefined && { description }),
        defaultAccountId: nextAccountId,
        expectedAmount: decExpected,
        ...(behavior !== undefined && { behavior: String(behavior) }),
        ...(frequency !== undefined && { frequency: String(frequency) }),
        ...(expectedDay !== undefined && { expectedDay: day }),
        ...(startDate !== undefined && { startDate: nextStart }),
        ...(endDate !== undefined && { endDate: nextEnd }),
      },
    });

    return NextResponse.json(updatedSource);
  } catch (error) {
    console.error("Failed to update income source:", error);
    return NextResponse.json({ error: "Failed to update income source" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existingSource = await prisma.incomeSource.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existingSource) {
      return NextResponse.json({ error: "Income source not found" }, { status: 404 });
    }

    // Soft delete/deactivate to preserve historical transaction reports
    await prisma.incomeSource.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: "Income source deactivated successfully" });
  } catch (error) {
    console.error("Failed to deactivate income source:", error);
    return NextResponse.json({ error: "Failed to deactivate income source" }, { status: 500 });
  }
}
