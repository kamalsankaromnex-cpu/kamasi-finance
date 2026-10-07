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
    const { proposalId, parametersHash } = body;

    if (!proposalId || !parametersHash) {
      return NextResponse.json({ error: "Missing required execution payload (proposalId, parametersHash)" }, { status: 400 });
    }

    const result = await AIFinancialAssistantService.confirmAndExecuteAction(
      session.householdId,
      session.id,
      proposalId,
      parametersHash
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI action execution failed:", error);
    return NextResponse.json({ error: error.message || "Failed to execute action proposal" }, { status: 400 });
  }
}
