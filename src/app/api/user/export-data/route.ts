import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await authorizeRequest(req);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const householdId = auth.session.householdId;

    const [household, accounts, transactions, goals, investments, liabilities, assets] = await Promise.all([
      prisma.household.findUnique({ where: { id: householdId } }),
      prisma.account.findMany({ where: { householdId, isArchived: false } }),
      prisma.transaction.findMany({ where: { householdId }, take: 1000 }),
      prisma.goal.findMany({ where: { householdId } }),
      prisma.investment.findMany({ where: { householdId } }),
      prisma.liability.findMany({ where: { householdId } }),
      prisma.asset.findMany({ where: { householdId } }),
    ]);

    const exportPayload = {
      exportTimestamp: new Date().toISOString(),
      user: {
        id: auth.session.id,
        email: auth.session.email,
        name: auth.session.name,
      },
      household,
      accounts,
      transactions,
      goals,
      investments,
      liabilities,
      assets,
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="kamasi-finance-export-${Date.now()}.json"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message || "Failed to export data" }, { status: 500 });
  }
}
