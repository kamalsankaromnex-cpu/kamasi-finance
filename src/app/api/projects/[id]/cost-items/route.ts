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

    const items = await prisma.projectCostItem.findMany({
      where: { projectId: id, householdId: session.householdId },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(items);
  } catch (error: any) {
    console.error("Failed to fetch cost items:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch cost items" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid cost item payload" }, { status: 400 });
    }

    const item = await ProjectPlanningService.addCostItem(prisma, {
      projectId: id,
      householdId: session.householdId,
      name: body.name,
      description: body.description,
      plannedAmount: Number(body.plannedAmount),
      dueDate: body.dueDate,
      categoryId: body.categoryId,
      priority: body.priority,
      userId: session.id,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error("Failed to add cost item:", error);
    return NextResponse.json({ error: error.message || "Failed to add cost item" }, { status: 400 });
  }
}
