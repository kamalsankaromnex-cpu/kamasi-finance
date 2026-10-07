import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectPlanningService } from "@/modules/projects/project-planning.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const sources = await prisma.projectFundingSource.findMany({
      where: { projectId: id, householdId: session.householdId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(sources);
  } catch (error: any) {
    console.error("Failed to fetch funding sources:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch funding sources" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid funding source payload" }, { status: 400 });
    }

    const funding = await ProjectPlanningService.addFundingSource(prisma, {
      projectId: id,
      householdId: session.householdId,
      sourceType: body.sourceType,
      name: body.name,
      plannedAmount: Number(body.plannedAmount),
      committedAmount: body.committedAmount ? Number(body.committedAmount) : undefined,
      receivedAmount: body.receivedAmount ? Number(body.receivedAmount) : undefined,
      notes: body.notes,
      linkedAccountId: body.linkedAccountId,
      linkedBorrowingId: body.linkedBorrowingId,
      linkedInvestmentId: body.linkedInvestmentId,
      linkedAssetId: body.linkedAssetId,
      linkedGoalId: body.linkedGoalId,
      userId: session.id,
    });

    return NextResponse.json(funding, { status: 201 });
  } catch (error: any) {
    console.error("Failed to add funding source:", error);
    return NextResponse.json({ error: error.message || "Failed to add funding source" }, { status: 400 });
  }
}
