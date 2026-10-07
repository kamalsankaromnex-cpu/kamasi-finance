import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    // Fetch automation logs
    const automationLogs = await prisma.automationExecutionLog.findMany({
      where: { householdId: session.householdId },
      orderBy: { executedAt: "desc" },
      take: 100,
    });

    // Fetch voided / reversed transaction logs for audit trail
    const voidedTxns = await prisma.transaction.findMany({
      where: { householdId: session.householdId, isVoided: true },
      include: { account: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const auditTrail = [
      ...automationLogs.map((log) => ({
        id: log.id,
        type: "AUTOMATION_RULE_EXECUTION",
        triggerType: log.triggerType,
        status: log.status,
        details: log.details,
        timestamp: log.executedAt,
      })),
      ...voidedTxns.map((tx) => ({
        id: tx.id,
        type: "TRANSACTION_VOIDED_REVERSED",
        triggerType: tx.type,
        status: "VOIDED",
        details: `Voided transaction: "${tx.description}" (${tx.amount} INR) on ${tx.account?.name}`,
        timestamp: tx.voidedAt || tx.updatedAt,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ logs: auditTrail, totalCount: auditTrail.length });
  } catch (error) {
    console.error("Audit logs error:", error);
    return NextResponse.json({ error: "Failed to fetch security audit logs" }, { status: 500 });
  }
}
