import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { GoalFundingPlannerService } from "@/finance/goals/planner/planner.service";
import { AiPlanExplanationService } from "@/finance/goals/planner/ai-explanation";
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

    // Retrieve active plan if exists, otherwise generate on the fly
    const activePlan = await prisma.goalFundingPlan.findFirst({
      where: { goalId: id, householdId: session.householdId, status: { in: ["ACTIVE", "PROPOSED", "REVIEW_REQUIRED"] } },
      orderBy: { version: "desc" },
    });

    const planResult = await GoalFundingPlannerService.generatePlan(prisma, {
      goalId: id,
      householdId: session.householdId,
    });

    const narrative = AiPlanExplanationService.generateDeterministicNarrative(planResult.recommendedPlan);

    return NextResponse.json({
      ...planResult,
      persistedActivePlan: activePlan,
      explanationNarrative: narrative,
    });
  } catch (error: any) {
    if (error.message === "GOAL_NOT_FOUND") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("Failed to generate goal plan:", error);
    return NextResponse.json({ error: "Failed to generate goal plan" }, { status: 500 });
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
    const { targetDate, monthlyContribution, saveProposal, selectedStrategyType } = body || {};

    const overrides: { targetDate?: Date; monthlyContribution?: number } = {};
    if (targetDate) {
      const parsed = parseIsoDate(targetDate);
      if (parsed) overrides.targetDate = parsed;
    }
    if (monthlyContribution !== undefined && monthlyContribution !== null && monthlyContribution !== "") {
      const parsed = parseNonNegativeMoney(monthlyContribution);
      if (parsed) overrides.monthlyContribution = Number(parsed);
    }

    const planResult = await GoalFundingPlannerService.generatePlan(prisma, {
      goalId: id,
      householdId: session.householdId,
      overrides,
    });

    let savedPlan = null;
    if (saveProposal) {
      const targetStrat = selectedStrategyType
        ? planResult.allStrategies.find((s) => s.strategyType === selectedStrategyType) || planResult.recommendedPlan
        : planResult.recommendedPlan;

      savedPlan = await GoalFundingPlannerService.saveProposedPlan(prisma, {
        householdId: session.householdId,
        goalId: id,
        selectedStrategy: targetStrat,
        planResult,
        userId: session.id,
      });
    }

    const narrative = AiPlanExplanationService.generateDeterministicNarrative(planResult.recommendedPlan);

    return NextResponse.json({
      ...planResult,
      savedPlan,
      explanationNarrative: narrative,
    });
  } catch (error: any) {
    if (error.message === "GOAL_NOT_FOUND") {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }
    console.error("Failed to process goal plan calculation:", error);
    return NextResponse.json({ error: "Failed to process goal plan calculation" }, { status: 500 });
  }
}
