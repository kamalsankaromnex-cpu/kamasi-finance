import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { GoalFundingPlanLifecycleService } from "@/finance/goals/planner/lifecycle.service";

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
    const { planId, reason } = body || {};

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const approvedPlan = await prisma.$transaction(async (tx) => {
      return GoalFundingPlanLifecycleService.approvePlan(tx, {
        planId,
        goalId: id,
        householdId: session.householdId,
        userId: session.id,
        reason,
      });
    });

    return NextResponse.json({
      success: true,
      plan: approvedPlan,
    });
  } catch (error: any) {
    if (error.message === "PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    if (error.message.startsWith("INVALID_STATE_TRANSITION")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to approve goal funding plan:", error);
    return NextResponse.json({ error: "Failed to approve goal funding plan" }, { status: 500 });
  }
}
