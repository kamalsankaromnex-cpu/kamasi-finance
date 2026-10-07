import { NextResponse } from "next/server";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AIFinancialAssistantService } from "@/finance/ai/ai-assistant.service";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { actionType, parameters } = body;

    if (!actionType || !parameters || parameters.amount === undefined) {
      return NextResponse.json({ error: "Missing required action parameters (actionType, parameters, parameters.amount)" }, { status: 400 });
    }

    const proposal = await AIFinancialAssistantService.proposeAction(
      session.householdId,
      session.id,
      actionType,
      parameters
    );

    return NextResponse.json(proposal, { status: 201 });
  } catch (error: any) {
    console.error("AI action proposal failed:", error);
    return NextResponse.json({ error: error.message || "Failed to create action proposal" }, { status: 500 });
  }
}
