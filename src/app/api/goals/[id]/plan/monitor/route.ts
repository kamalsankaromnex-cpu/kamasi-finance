import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { GoalFundingPlanLifecycleService } from "@/finance/goals/planner/lifecycle.service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const health = await GoalFundingPlanLifecycleService.checkPlanHealth(prisma, {
      goalId: id,
      householdId: session.householdId,
      userId: session.id,
    });

    return NextResponse.json(health);
  } catch (error: any) {
    if (error.message === "GOAL_NOT_FOUND") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("Failed to check plan health:", error);
    return NextResponse.json({ error: "Failed to check plan health" }, { status: 500 });
  }
}
