import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { parseIsoDate, parseNonNegativeMoney } from "@/lib/financial-validation";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const fundingResult = await prisma.$transaction(async (tx) => {
      return GoalDomainService.getGoalFunding(tx, {
        goalId: id,
        householdId: session.householdId,
      });
    });

    return NextResponse.json(fundingResult);
  } catch (error: any) {
    if (error.message === "GOAL_NOT_FOUND") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("Failed to calculate goal funding:", error);
    return NextResponse.json({ error: "Failed to calculate goal funding" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const body = await req.json().catch(() => ({}));
    const { currentAvailable, monthlyContribution, targetDate, startDate } = body || {};

    const overrides: {
      currentAvailable?: number;
      monthlyContribution?: number;
      targetDate?: Date;
      startDate?: Date;
    } = {};

    if (currentAvailable !== undefined && currentAvailable !== null && currentAvailable !== "") {
      const parsed = parseNonNegativeMoney(currentAvailable);
      if (!parsed) return NextResponse.json({ error: "currentAvailable must be non-negative" }, { status: 400 });
      overrides.currentAvailable = Number(parsed);
    }

    if (monthlyContribution !== undefined && monthlyContribution !== null && monthlyContribution !== "") {
      const parsed = parseNonNegativeMoney(monthlyContribution);
      if (!parsed) return NextResponse.json({ error: "monthlyContribution must be non-negative" }, { status: 400 });
      overrides.monthlyContribution = Number(parsed);
    }

    if (targetDate) {
      const parsed = parseIsoDate(targetDate);
      if (!parsed) return NextResponse.json({ error: "Invalid targetDate" }, { status: 400 });
      overrides.targetDate = parsed;
    }

    if (startDate) {
      const parsed = parseIsoDate(startDate);
      if (!parsed) return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
      overrides.startDate = parsed;
    }

    const fundingResult = await prisma.$transaction(async (tx) => {
      return GoalDomainService.getGoalFunding(tx, {
        goalId: id,
        householdId: session.householdId,
        overrides,
      });
    });

    return NextResponse.json(fundingResult);
  } catch (error: any) {
    if (error.message === "GOAL_NOT_FOUND") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("Failed to simulate goal funding:", error);
    return NextResponse.json({ error: "Failed to simulate goal funding" }, { status: 500 });
  }
}
