import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { AIFinancialAssistantService } from "@/finance/ai/ai-assistant.service";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Query prompt is required" }, { status: 400 });
    }

    const aiResponse = await AIFinancialAssistantService.processQuery(session.householdId, prompt);
    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error("AI query processing failed:", error);
    return NextResponse.json({ error: error.message || "Failed to process AI query" }, { status: 500 });
  }
}
