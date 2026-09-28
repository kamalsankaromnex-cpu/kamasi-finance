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

    const goals = await prisma.goal.findMany({
      where: { householdId: session.householdId },
      orderBy: { targetDate: "asc" },
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
    const { name, description, targetAmount, currentAmount, targetDate, category, priority } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Goal name must be 1–120 characters" }, { status: 400 });
    const target = parsePositiveMoney(targetAmount);
    const current = currentAmount === undefined || currentAmount === null || currentAmount === "" ? new Prisma.Decimal(0) : parseNonNegativeMoney(currentAmount);
    if (!target || !current) return NextResponse.json({ error: "Goal amounts must be finite; target must be positive and current amount non-negative" }, { status: 400 });
    const parsedTargetDate = parseIsoDate(targetDate);
    if (!parsedTargetDate) return NextResponse.json({ error: "A valid target date is required" }, { status: 400 });
    if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 2000)) return NextResponse.json({ error: "Description must be text up to 2000 characters" }, { status: 400 });
    if (category !== undefined && category !== null && (typeof category !== "string" || category.length > 80)) return NextResponse.json({ error: "Category must be text up to 80 characters" }, { status: 400 });
    if (priority !== undefined && !["LOW", "MEDIUM", "HIGH"].includes(String(priority))) return NextResponse.json({ error: "Invalid goal priority" }, { status: 400 });

    const goal = await prisma.goal.create({
      data: {
        householdId: session.householdId,
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        targetAmount: target,
        currentAmount: current,
        targetDate: parsedTargetDate,
        category: typeof category === "string" ? category : "General",
        priority: String(priority || "MEDIUM"),
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}
