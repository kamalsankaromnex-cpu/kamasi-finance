import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parseNonNegativeMoney, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const goal = await prisma.goal.findFirst({
      where: { id, householdId: session.householdId },
      include: { account: true },
    });

    if (!goal) {
      return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error("Failed to fetch goal:", error);
    return NextResponse.json({ error: "Failed to fetch goal" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const existing = await prisma.goal.findFirst({
      where: { id, householdId: session.householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, targetAmount, currentAmount, targetDate, category, priority, status, notes, monthlyContribution } = body;

    const updateData: Prisma.GoalUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "Goal name is required" }, { status: 400 });
      updateData.name = name.trim();
    }

    if (targetAmount !== undefined) {
      const decTarget = parsePositiveMoney(targetAmount);
      if (!decTarget) return NextResponse.json({ error: "Target amount must be a positive number" }, { status: 400 });
      updateData.targetAmount = decTarget;
    }

    if (currentAmount !== undefined) {
      const decCurrent = parseNonNegativeMoney(currentAmount);
      if (!decCurrent) return NextResponse.json({ error: "Current amount must be non-negative" }, { status: 400 });
      updateData.currentAmount = decCurrent;
    }

    if (monthlyContribution !== undefined) {
      const decMonthly = parseNonNegativeMoney(monthlyContribution);
      if (!decMonthly) return NextResponse.json({ error: "Monthly contribution must be non-negative" }, { status: 400 });
      updateData.monthlyContribution = decMonthly;
    }

    if (targetDate !== undefined) {
      const parsedDate = parseIsoDate(targetDate);
      if (!parsedDate) return NextResponse.json({ error: "Valid target date is required" }, { status: 400 });
      updateData.targetDate = parsedDate;
    }

    if (priority !== undefined) {
      if (!["LOW", "MEDIUM", "HIGH"].includes(String(priority))) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      updateData.priority = String(priority);
    }

    if (status !== undefined) {
      const allowedStatuses = ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
      if (!allowedStatuses.includes(String(status))) return NextResponse.json({ error: "Invalid goal status" }, { status: 400 });
      updateData.status = String(status);
    }

    if (description !== undefined) updateData.description = typeof description === "string" ? description : null;
    if (notes !== undefined) updateData.notes = typeof notes === "string" ? notes : null;
    if (category !== undefined) updateData.category = typeof category === "string" ? category : null;

    const updated = await prisma.goal.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update goal:", error);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const existing = await prisma.goal.findFirst({
      where: { id, householdId: session.householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });
    }

    // Financial History Rule: If currentAmount > 0, archive goal instead of physical delete
    if (Number(existing.currentAmount) > 0) {
      const archived = await prisma.goal.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });
      return NextResponse.json({
        message: "Goal contains financial progress history; soft archived cleanly.",
        goal: archived,
      });
    }

    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ message: "Goal deleted successfully" });
  } catch (error) {
    console.error("Failed to delete goal:", error);
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}
