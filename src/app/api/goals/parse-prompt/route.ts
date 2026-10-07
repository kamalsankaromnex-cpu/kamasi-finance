import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { AiGoalParser } from "@/finance/goals/planner/ai-goal-parser";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const body = await req.json().catch(() => ({}));
    const { prompt } = body || {};

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt string is required" }, { status: 400 });
    }

    const draft = AiGoalParser.parse(prompt);

    return NextResponse.json({
      success: true,
      draft,
    });
  } catch (error: any) {
    console.error("Failed to parse goal prompt:", error);
    return NextResponse.json({ error: "Failed to parse goal prompt" }, { status: 500 });
  }
}
