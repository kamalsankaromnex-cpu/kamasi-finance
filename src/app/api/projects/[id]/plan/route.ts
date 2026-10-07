import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectPlanningService } from "@/modules/projects/project-planning.service";

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
      return NextResponse.json({ error: "Invalid plan payload" }, { status: 400 });
    }

    const plan = await ProjectPlanningService.createPlanVersion(prisma, {
      projectId: id,
      householdId: session.householdId,
      estimatedTotalCost: Number(body.estimatedTotalCost),
      notes: body.notes,
      reason: body.reason,
      userId: session.id,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create plan version:", error);
    return NextResponse.json({ error: error.message || "Failed to create plan version" }, { status: 400 });
  }
}
