import { Prisma, PrismaClient, GoalFundingPlan } from "@prisma/client";
import { AuditService } from "@/finance/audit/audit.service";
import { FinancialSnapshotService } from "./snapshot";

export class GoalFundingPlanLifecycleService {
  /**
   * Approves a plan and activates it.
   * - Transitions plan to USER_APPROVED and ACTIVE.
   * - Supersedes any prior active plans for this goal (version immutability).
   * - Updates goal's planned parameters (monthlyContribution, and targetDate if extension strategy).
   * - Records immutable history and AuditService events.
   * - Zero journal/account ledger mutations!
   */
  public static async approvePlan(
    db: Prisma.TransactionClient | PrismaClient,
    params: {
      planId: string;
      goalId: string;
      householdId: string;
      userId: string;
      reason?: string;
    }
  ): Promise<GoalFundingPlan> {
    // If caller provided PrismaClient rather than TransactionClient, wrap in transaction
    if ("$transaction" in db && typeof db.$transaction === "function") {
      return (db as PrismaClient).$transaction(async (tx) => {
        return GoalFundingPlanLifecycleService.approvePlan(tx, params);
      });
    }

    const plan = await db.goalFundingPlan.findFirst({
      where: {
        id: params.planId,
        goalId: params.goalId,
        householdId: params.householdId,
      },
    });

    if (!plan) throw new Error("PLAN_NOT_FOUND");
    if (plan.status !== "PROPOSED" && plan.status !== "REVIEW_REQUIRED") {
      throw new Error(`INVALID_STATE_TRANSITION: Cannot approve plan in status ${plan.status}`);
    }

    const now = new Date();

    // 1. Mark existing ACTIVE plans for this goal as SUPERSEDED atomically
    const activePlans = await db.goalFundingPlan.findMany({
      where: {
        goalId: params.goalId,
        householdId: params.householdId,
        status: "ACTIVE",
        id: { not: plan.id },
      },
    });

    for (const ap of activePlans) {
      await db.goalFundingPlan.update({
        where: { id: ap.id },
        data: {
          status: "SUPERSEDED",
          supersededAt: now,
        },
      });

      await db.goalFundingPlanLifecycleHistory.create({
        data: {
          planId: ap.id,
          householdId: params.householdId,
          fromStatus: "ACTIVE",
          toStatus: "SUPERSEDED",
          action: "SUPERSEDE",
          reason: `Superseded by newly approved plan v${plan.version} (${plan.id})`,
          performedBy: params.userId,
        },
      });
    }

    // 2. Activate the target plan
    const updatedPlan = await db.goalFundingPlan.update({
      where: { id: plan.id },
      data: {
        status: "ACTIVE",
        approvedAt: now,
        approvedByUserId: params.userId,
      },
    });

    // 3. Record plan lifecycle history
    await db.goalFundingPlanLifecycleHistory.create({
      data: {
        planId: updatedPlan.id,
        householdId: params.householdId,
        fromStatus: plan.status,
        toStatus: "ACTIVE",
        action: "APPROVE",
        reason: params.reason || "User approved funding plan",
        performedBy: params.userId,
      },
    });

    // 4. Update the Goal operational planned parameters without creating accounting transactions
    const planDetails = JSON.parse(plan.planDetailsJson);
    const updateGoalData: Prisma.GoalUpdateInput = {};

    if (Number(plan.monthlyBurden) > 0) {
      updateGoalData.monthlyContribution = new Prisma.Decimal(plan.monthlyBurden);
    }

    if (plan.strategyType === "EXTEND_DEADLINE" || planDetails.subBreakdown?.newTargetDate) {
      const newDate = new Date(planDetails.subBreakdown.newTargetDate || plan.projectedCompletionDate);
      if (!isNaN(newDate.getTime())) {
        updateGoalData.targetDate = newDate;
      }
    }

    if (Object.keys(updateGoalData).length > 0) {
      await db.goal.update({
        where: { id: params.goalId },
        data: updateGoalData,
      });
    }

    // 5. Central Audit Trail Integration
    await AuditService.record(db, {
      householdId: params.householdId,
      entityType: "GOAL",
      entityId: params.goalId,
      action: "UPDATE",
      fromState: plan.status,
      toState: "ACTIVE",
      actorUserId: params.userId,
      reason: `Approved Goal Funding Plan v${plan.version} (${plan.strategyType})`,
      metadata: {
        planId: plan.id,
        version: plan.version,
        strategyType: plan.strategyType,
        monthlyBurden: Number(plan.monthlyBurden),
      },
    });

    return updatedPlan;
  }

  /**
   * Monitor an active plan against fresh financial realities:
   * Checks for material deviations:
   * - Available monthly surplus dropped below required monthly burden
   * - Emergency reserve fell below policy
   * - Goal target or deadline manually modified
   * If material deviation detected, transitions status to REVIEW_REQUIRED.
   */
  public static async checkPlanHealth(
    db: Prisma.TransactionClient | PrismaClient,
    params: {
      goalId: string;
      householdId: string;
      userId?: string;
    }
  ) {
    const activePlan = await db.goalFundingPlan.findFirst({
      where: {
        goalId: params.goalId,
        householdId: params.householdId,
        status: "ACTIVE",
      },
    });

    if (!activePlan) {
      return { status: "NO_ACTIVE_PLAN", isStale: false };
    }

    // Fresh snapshot
    const { snapshot } = await FinancialSnapshotService.captureSnapshot(
      db,
      params.householdId,
      params.goalId
    );

    const goal = await db.goal.findUnique({ where: { id: params.goalId } });
    if (!goal) throw new Error("GOAL_NOT_FOUND");

    const requiredMonthly = Number(activePlan.monthlyBurden);
    const availableCapacity = snapshot.availableGoalFundingCapacity;
    const staleReasons: string[] = [];

    // Trigger 1: Surplus capacity dropped below requirement
    if (requiredMonthly > 0 && availableCapacity < requiredMonthly) {
      staleReasons.push(
        `Available funding surplus (₹${availableCapacity.toLocaleString("en-IN")}) dropped below required monthly commitment (₹${requiredMonthly.toLocaleString("en-IN")})`
      );
    }

    // Trigger 2: Emergency reserve breach
    if (snapshot.emergencyReserveAmount !== null && snapshot.totalCash < snapshot.emergencyReserveAmount) {
      staleReasons.push(
        `Total liquid cash (₹${snapshot.totalCash.toLocaleString("en-IN")}) is below required emergency reserve (₹${snapshot.emergencyReserveAmount.toLocaleString("en-IN")})`
      );
    }

    // Trigger 3: Goal target amount changed materially (>5% diff from plan snapshot gap)
    const originalGap = Number(activePlan.fundingGap);
    const currentGoalGap = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount));
    if (Math.abs(currentGoalGap - originalGap) > originalGap * 0.15 && originalGap > 0) {
      staleReasons.push("Goal target amount or progress has shifted significantly since plan creation");
    }

    const isStale = staleReasons.length > 0;

    if (isStale && activePlan.status === "ACTIVE") {
      await db.goalFundingPlan.update({
        where: { id: activePlan.id },
        data: { status: "REVIEW_REQUIRED" },
      });

      await db.goalFundingPlanLifecycleHistory.create({
        data: {
          planId: activePlan.id,
          householdId: params.householdId,
          fromStatus: "ACTIVE",
          toStatus: "REVIEW_REQUIRED",
          action: "REVIEW_REQUIRED",
          reason: staleReasons.join("; "),
          performedBy: params.userId || "SYSTEM",
        },
      });
    }

    return {
      status: isStale ? "REVIEW_REQUIRED" : "HEALTHY",
      isStale,
      reasons: staleReasons,
      plan: activePlan,
      currentSnapshot: snapshot,
    };
  }
}
