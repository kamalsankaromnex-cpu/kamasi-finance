import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { validateRuleJson } from "@/lib/automations";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const rules = await prisma.automationRule.findMany({
      where: { householdId: session.householdId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Failed to fetch automation rules:", error);
    return NextResponse.json({ error: "Failed to fetch automation rules" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { name, triggerType, conditionJson, actionType, actionJson } = body;

    if (!name || !triggerType || !conditionJson || !actionType || !actionJson) {
      return NextResponse.json({ error: "Missing required rule fields" }, { status: 400 });
    }

    const jsonValidation = validateRuleJson(conditionJson, actionJson);
    if (!jsonValidation.valid) {
      return NextResponse.json({ error: jsonValidation.error }, { status: 400 });
    }

    const rule = await prisma.automationRule.create({
      data: {
        householdId: session.householdId,
        createdByUserId: session.id,
        name: name.trim(),
        triggerType: triggerType.trim(),
        conditionJson: conditionJson.trim(),
        actionType: actionType.trim(),
        actionJson: actionJson.trim(),
        isActive: true,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Failed to create automation rule:", error);
    return NextResponse.json({ error: "Failed to create automation rule" }, { status: 500 });
  }
}
