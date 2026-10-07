import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    const action = url.searchParams.get("action");
    const actorUserId = url.searchParams.get("actorUserId");
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    const verifyIntegrity = url.searchParams.get("verifyIntegrity") === "true";

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Build filter strictly scoped to householdId
    const where: Prisma.AuditEventWhereInput = {
      householdId: session.householdId,
    };

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (actorUserId) where.actorUserId = actorUserId;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    let integrityResult = undefined;
    if (verifyIntegrity) {
      integrityResult = await AuditIntegrityService.verifyChain(prisma, session.householdId);
    }

    return NextResponse.json({
      data: events,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      ...(integrityResult ? { integrity: integrityResult } : {}),
    });
  } catch (error) {
    console.error("Audit API query error:", error);
    return NextResponse.json({ error: "Failed to query audit trail" }, { status: 500 });
  }
}
