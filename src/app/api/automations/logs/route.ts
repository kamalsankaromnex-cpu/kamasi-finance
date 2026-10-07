import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const logs = await prisma.automationExecutionLog.findMany({
      where: { householdId: session.householdId },
      orderBy: { executedAt: "desc" },
      take: 50,
      include: {
        rule: { select: { id: true, name: true, triggerType: true } },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Failed to fetch automation logs:", error);
    return NextResponse.json({ error: "Failed to fetch automation logs" }, { status: 500 });
  }
}
