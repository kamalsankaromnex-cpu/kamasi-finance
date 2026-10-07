import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const report = await FinancialReportingService.getAssetReport(prisma, session.householdId);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to generate Asset report:", error);
    return NextResponse.json({ error: "Failed to generate Asset report" }, { status: 500 });
  }
}
