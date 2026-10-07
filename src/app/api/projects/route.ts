import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectDomainService } from "@/modules/projects/project.service";
import { ProjectQueryService } from "@/modules/projects/project-query.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const projectType = url.searchParams.get("projectType");

    const where: any = { householdId: session.householdId };
    if (status && status !== "ALL") where.status = status;
    if (projectType && projectType !== "ALL") where.projectType = projectType;

    const projects = await prisma.project.findMany({
      where,
      include: {
        financialPlans: { where: { planningStatus: "ACTIVE" }, take: 1 },
        costItems: true,
        payments: true,
        fundingSources: true,
        tasks: true,
        milestones: true,
        primaryGoal: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const conflicts = await ProjectQueryService.checkFundingConflicts(prisma, session.householdId);

    const enriched = projects.map((p) => {
      const activePlan = p.financialPlans[0];
      const estimatedCost = activePlan ? Number(activePlan.estimatedTotalCost) : 0;
      const committedAmount = p.payments.reduce((s, pay) => s + Number(pay.committedAmount), 0);
      const paidAmount = p.payments.reduce((s, pay) => s + Number(pay.paidAmount), 0);
      const securedFunding = p.fundingSources.reduce(
        (s, f) => s + Math.max(Number(f.committedAmount), Number(f.receivedAmount)),
        0
      );
      const fundingGap = Math.max(0, estimatedCost - securedFunding);

      return {
        ...p,
        metrics: {
          estimatedCost,
          committedAmount,
          paidAmount,
          securedFunding,
          fundingGap,
          tasksCount: p.tasks.length,
          tasksCompleted: p.tasks.filter((t) => t.status === "COMPLETED").length,
          milestonesCount: p.milestones.length,
        },
      };
    });

    return NextResponse.json({
      projects: enriched,
      fundingConflicts: conflicts,
    });
  } catch (error: any) {
    console.error("Failed to list projects:", error);
    return NextResponse.json({ error: error.message || "Failed to list projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
    }

    const project = await ProjectDomainService.createProject(prisma, {
      householdId: session.householdId,
      name: body.name,
      description: body.description,
      notes: body.notes,
      projectType: body.projectType,
      priority: body.priority,
      startDate: body.startDate,
      targetDate: body.targetDate,
      estimatedTotalCost: body.estimatedTotalCost ? Number(body.estimatedTotalCost) : undefined,
      ownerMemberId: body.ownerMemberId,
      primaryGoalId: body.primaryGoalId,
      userId: session.id,
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: error.message || "Failed to create project" }, { status: 400 });
  }
}
