import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectPaymentService } from "@/modules/projects/project-payment.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const payments = await prisma.projectPaymentRequirement.findMany({
      where: { projectId: id, householdId: session.householdId },
      include: { allocations: true },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json(payments);
  } catch (error: any) {
    console.error("Failed to fetch payments:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch payments" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid payment payload" }, { status: 400 });
    }

    const payment = await ProjectPaymentService.addPaymentRequirement(prisma, {
      projectId: id,
      householdId: session.householdId,
      costItemId: body.costItemId,
      name: body.name,
      dueDate: body.dueDate,
      plannedAmount: Number(body.plannedAmount),
      committedAmount: body.committedAmount ? Number(body.committedAmount) : undefined,
      userId: session.id,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error: any) {
    console.error("Failed to add payment requirement:", error);
    return NextResponse.json({ error: error.message || "Failed to add payment requirement" }, { status: 400 });
  }
}
