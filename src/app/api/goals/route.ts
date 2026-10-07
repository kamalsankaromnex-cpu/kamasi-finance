import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parseNonNegativeMoney, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const paramProfileId = url.searchParams.get("profileId");

    const whereClause: any = { householdId: session.householdId };

    if (paramProfileId) {
      if (paramProfileId !== "ALL") {
        const profile = await prisma.familyProfile.findFirst({
          where: { id: paramProfileId, householdId: session.householdId },
        });
        if (!profile) return NextResponse.json({ error: "Forbidden: Profile not in household" }, { status: 403 });
        whereClause.profileId = paramProfileId;
      }
    } else if (session.activeProfile && !session.activeProfile.isFamilyView) {
      if (session.activeProfile.isPrimary) {
        whereClause.OR = [{ profileId: session.activeProfile.id }, { profileId: null }];
      } else {
        whereClause.profileId = session.activeProfile.id;
      }
    }

    const goals = await prisma.goal.findMany({
      where: whereClause,
      orderBy: { targetDate: "asc" },
      include: {
        profile: { select: { id: true, name: true, relationship: true, color: true } },
      },
    });
    return NextResponse.json(goals);
  } catch (error) {
    console.error("Failed to fetch goals:", error);
    return NextResponse.json({ error: "Failed to fetch goals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid goal payload" }, { status: 400 });
    const { name, description, targetAmount, currentAmount, targetDate, category, priority, notes, monthlyContribution, profileId: bodyProfileId } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Goal name must be 1–120 characters" }, { status: 400 });
    const target = parsePositiveMoney(targetAmount);
    const current = currentAmount === undefined || currentAmount === null || currentAmount === "" ? new Prisma.Decimal(0) : parseNonNegativeMoney(currentAmount);
    if (!target || !current) return NextResponse.json({ error: "Goal amounts must be finite; target must be positive and current amount non-negative" }, { status: 400 });
    const monthly = monthlyContribution === undefined || monthlyContribution === null || monthlyContribution === "" ? new Prisma.Decimal(0) : parseNonNegativeMoney(monthlyContribution);
    if (!monthly) return NextResponse.json({ error: "Monthly contribution must be a non-negative number" }, { status: 400 });
    const parsedTargetDate = parseIsoDate(targetDate);
    if (!parsedTargetDate) return NextResponse.json({ error: "A valid target date is required" }, { status: 400 });
    if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 2000)) return NextResponse.json({ error: "Description must be text up to 2000 characters" }, { status: 400 });
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 4000)) return NextResponse.json({ error: "Notes must be text up to 4000 characters" }, { status: 400 });
    if (category !== undefined && category !== null && (typeof category !== "string" || category.length > 80)) return NextResponse.json({ error: "Category must be text up to 80 characters" }, { status: 400 });
    if (priority !== undefined && !["LOW", "MEDIUM", "HIGH"].includes(String(priority))) return NextResponse.json({ error: "Invalid goal priority" }, { status: 400 });

    let targetProfileId: string | null = null;
    if (typeof bodyProfileId === "string" && bodyProfileId.trim()) {
      const p = await prisma.familyProfile.findFirst({
        where: { id: bodyProfileId.trim(), householdId: session.householdId },
      });
      if (!p) return NextResponse.json({ error: "Forbidden: Profile not in household" }, { status: 403 });
      targetProfileId = p.id;
    } else if (session.activeProfile && !session.activeProfile.isFamilyView) {
      targetProfileId = session.activeProfile.id;
    } else {
      const primary = await prisma.familyProfile.findFirst({
        where: { householdId: session.householdId, isPrimary: true, isActive: true },
      });
      targetProfileId = primary?.id || null;
    }

    const goal = await prisma.goal.create({
      data: {
        householdId: session.householdId,
        profileId: targetProfileId,
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        notes: typeof notes === "string" ? notes : null,
        targetAmount: target,
        currentAmount: current,
        monthlyContribution: monthly,
        targetDate: parsedTargetDate,
        category: typeof category === "string" ? category : "General",
        priority: String(priority || "MEDIUM"),
        deadlineFlexibility: typeof body === "object" && (body as any)?.deadlineFlexibility ? String((body as any).deadlineFlexibility) : "MODERATE",
      },
      include: {
        profile: { select: { id: true, name: true, relationship: true, color: true } },
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}
