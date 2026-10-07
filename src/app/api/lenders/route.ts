import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const lenders = await prisma.lender.findMany({
      where: { householdId: session.householdId },
      include: {
        _count: { select: { borrowings: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(lenders);
  } catch (error) {
    console.error("GET /api/lenders error:", error);
    return NextResponse.json({ error: "Failed to fetch lenders" }, { status: 500 });
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
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Lender name is required" }, { status: 400 });
    }

    const lender = await prisma.lender.upsert({
      where: {
        householdId_name: {
          householdId: session.householdId,
          name,
        },
      },
      update: {
        type: body.type || undefined,
        contactInfo: body.contactInfo !== undefined ? body.contactInfo : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
      create: {
        householdId: session.householdId,
        name,
        type: body.type || "BANK",
        contactInfo: body.contactInfo || null,
        notes: body.notes || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "LENDER",
      entityId: lender.id,
      action: "CREATE",
      fromState: "NONE",
      toState: "ACTIVE",
      actorUserId: session.id,
      reason: `Created/updated lender ${lender.name}`,
    });

    return NextResponse.json(lender, { status: 201 });
  } catch (error) {
    console.error("POST /api/lenders error:", error);
    return NextResponse.json({ error: "Failed to create lender" }, { status: 500 });
  }
}
