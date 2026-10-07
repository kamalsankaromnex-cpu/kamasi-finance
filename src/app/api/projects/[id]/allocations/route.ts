import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { ProjectPaymentService } from "@/modules/projects/project-payment.service";

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
      return NextResponse.json({ error: "Invalid allocation payload" }, { status: 400 });
    }

    const allocation = await ProjectPaymentService.allocateTransactionToPayment(prisma, {
      projectId: id,
      householdId: session.householdId,
      paymentRequirementId: body.paymentRequirementId,
      transactionId: body.transactionId,
      allocatedAmount: body.allocatedAmount ? Number(body.allocatedAmount) : undefined,
      notes: body.notes,
      userId: session.id,
    });

    return NextResponse.json(allocation, { status: 201 });
  } catch (error: any) {
    console.error("Failed to allocate transaction to payment:", error);
    return NextResponse.json({ error: error.message || "Failed to allocate transaction" }, { status: 400 });
  }
}
