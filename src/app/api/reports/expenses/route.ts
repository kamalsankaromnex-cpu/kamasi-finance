import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    const period = searchParams.get("period") as "MONTH" | "QUARTER" | "YEAR" | "CUSTOM" | undefined;
    const accountId = searchParams.get("accountId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;

    const report = await FinancialReportingService.getExpenseAnalysisReport(prisma, session.householdId, {
      from,
      to,
      period,
      accountId,
      categoryId,
    });
    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to generate Expense report:", error);
    return NextResponse.json({ error: "Failed to generate Expense report" }, { status: 500 });
  }
}
