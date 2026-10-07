import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const milestones = await prisma.projectMilestone.findMany({
      where: { projectId: id, householdId: session.householdId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(milestones);
  } catch (error: any) {
    console.error("Failed to fetch milestones:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch milestones" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid milestone payload" }, { status: 400 });
    }

    const milestone = await prisma.projectMilestone.create({
      data: {
        projectId: id,
        householdId: session.householdId,
        title: body.title,
        description: body.description || null,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        order: body.order ? Number(body.order) : 0,
        status: body.status || "PLANNED",
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "PROJECT_MILESTONE",
      entityId: milestone.id,
      action: "CREATE",
      actorUserId: session.id,
      metadata: { projectId: id, title: milestone.title },
    });

    return NextResponse.json(milestone, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create milestone:", error);
    return NextResponse.json({ error: error.message || "Failed to create milestone" }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!body || !body.milestoneId) {
      return NextResponse.json({ error: "milestoneId is required" }, { status: 400 });
    }

    const existing = await prisma.projectMilestone.findFirst({
      where: { id: body.milestoneId, projectId: id, householdId: session.householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    const isAchieved = body.status === "ACHIEVED";
    const achievedAt = isAchieved ? (existing.achievedAt || new Date()) : (body.status ? null : existing.achievedAt);

    const updated = await prisma.projectMilestone.update({
      where: { id: body.milestoneId },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        description: body.description !== undefined ? body.description : undefined,
        targetDate: body.targetDate !== undefined ? (body.targetDate ? new Date(body.targetDate) : null) : undefined,
        status: body.status !== undefined ? body.status : undefined,
        achievedAt,
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "PROJECT_MILESTONE",
      entityId: updated.id,
      action: "UPDATE",
      actorUserId: session.id,
      metadata: { projectId: id, title: updated.title, status: updated.status },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update milestone:", error);
    return NextResponse.json({ error: error.message || "Failed to update milestone" }, { status: 400 });
  }
}
