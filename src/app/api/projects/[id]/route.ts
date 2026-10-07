import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectDomainService } from "@/modules/projects/project.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, householdId: session.householdId },
      include: {
        financialPlans: { orderBy: { version: "desc" } },
        costItems: { include: { category: true } },
        payments: { include: { allocations: true } },
        fundingSources: true,
        tasks: { orderBy: { createdAt: "asc" } },
        milestones: { orderBy: { order: "asc" } },
        primaryGoal: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error: any) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch project" }, { status: 500 });
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (body.action === "TRANSITION_STATUS" && body.toStatus) {
      const updated = await ProjectDomainService.transitionStatus(prisma, {
        projectId: id,
        householdId: session.householdId,
        toStatus: body.toStatus,
        reason: body.reason,
        userId: session.id,
      });
      return NextResponse.json(updated);
    }

    const updated = await ProjectDomainService.updateProject(prisma, {
      projectId: id,
      householdId: session.householdId,
      name: body.name,
      description: body.description,
      notes: body.notes,
      projectType: body.projectType,
      priority: body.priority,
      startDate: body.startDate,
      targetDate: body.targetDate,
      ownerMemberId: body.ownerMemberId,
      primaryGoalId: body.primaryGoalId,
      userId: session.id,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update project:", error);
    return NextResponse.json({ error: error.message || "Failed to update project" }, { status: 400 });
  }
}
