import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { DashboardQueryService, DashboardPeriodType } from "@/finance/dashboard/dashboard-query.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const periodParam = (searchParams.get("period") || "MONTHLY").toUpperCase() as DashboardPeriodType;

    const validPeriods: DashboardPeriodType[] = ["MONTHLY", "QUARTERLY", "YEARLY", "ALL_TIME"];
    const periodType = validPeriods.includes(periodParam) ? periodParam : "MONTHLY";

    const snapshot = await DashboardQueryService.getSnapshot(
      prisma,
      session.householdId,
      periodType
    );

    return NextResponse.json(snapshot);
  } catch (error: any) {
    console.error("Failed to generate dashboard snapshot:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Failed to generate dashboard snapshot" },
      { status: 500 }
    );
  }
}

