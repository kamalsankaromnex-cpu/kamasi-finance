import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { hideIdempotencyKey, isValidIdempotencyKey, parsePositiveMoney } from "@/lib/financial-validation";
import { GoalDomainService } from "@/modules/goals/goal.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || "";
  let requestSession: { id: string; householdId: string } | null = null;
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    requestSession = session;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();
    const { amount, accountId } = body;

    if (!amount || !accountId) {
      return NextResponse.json({ error: "Missing amount or accountId" }, { status: 400 });
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }

    // IDOR Protection: verify goal belongs to session household
    const goal = await prisma.goal.findFirst({
      where: { id, householdId: session.householdId },
    });
    if (!goal) {
      return NextResponse.json({ error: "Goal not found or access denied" }, { status: 404 });
    }
    if (goal.status !== "ACTIVE") {
      return NextResponse.json({ error: "Goal is not active and cannot process withdrawals" }, { status: 400 });
    }

    // IDOR Protection: verify destination account belongs to session household
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId },
    });
    if (!account || (!account.isShared && account.userId !== session.id) || account.isArchived) {
      return NextResponse.json({ error: "Destination account not found or access denied" }, { status: 404 });
    }

    const decAmount = parsePositiveMoney(amount);
    if (!decAmount) return NextResponse.json({ error: "Amount must be finite and positive" }, { status: 400 });

    if (decAmount.gt(goal.currentAmount)) {
      return NextResponse.json({ error: "Withdrawal amount exceeds available goal balance" }, { status: 400 });
    }

    const prior = await prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const matches =
        prior.householdId === session.householdId &&
        prior.userId === session.id &&
        prior.accountId === accountId &&
        prior.amount.equals(decAmount) &&
        prior.description === `Goal Savings Withdrawal: ${goal.name}`;
      return matches
        ? NextResponse.json({ goal, transaction: hideIdempotencyKey(prior) }, { status: 200 })
        : NextResponse.json({ error: "Idempotency key has already been used" }, { status: 409 });
    }

    // Atomic Database Transaction using GoalDomainService
    const result = await prisma.$transaction(async (tx) => {
      const { goal: updatedGoal, transaction } = await GoalDomainService.withdrawFromGoal(tx, {
        goalId: id,
        householdId: session.householdId,
        userId: session.id,
        accountId,
        amount: decAmount,
        idempotencyKey,
      });

      return { goal: updatedGoal, transaction: transaction ? hideIdempotencyKey(transaction) : null };
    });

    return NextResponse.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const prior = await prisma.transaction.findUnique({ where: { idempotencyKey } });
      if (prior && requestSession && prior.householdId === requestSession.householdId && prior.userId === requestSession.id) {
        return NextResponse.json(hideIdempotencyKey(prior), { status: 200 });
      }
    }
    console.error("Failed to withdraw from goal:", error);
    return NextResponse.json({ error: "Failed to withdraw from goal" }, { status: 500 });
  }
}
