import { NextResponse } from "next/server";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { runHouseholdAutomations } from "@/lib/automations";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const result = await runHouseholdAutomations(session.householdId);

    return NextResponse.json({
      success: true,
      message: `Automation Engine executed successfully. Generated ${result.alertsCount} budget alert(s) and flagged ${result.duplicatesCount} duplicate candidate(s).`,
      result,
    });
  } catch (error) {
    console.error("Failed to run automation engine:", error);
    return NextResponse.json({ error: "Failed to run automation engine" }, { status: 500 });
  }
}
