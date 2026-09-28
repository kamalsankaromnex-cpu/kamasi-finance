import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await authorizeRequest(req);
  if ("errorResponse" in auth) return auth.errorResponse;
  const household = await prisma.household.findUnique({
    where: { id: auth.session.householdId },
    select: { name: true, currency: true, _count: { select: { members: true } } },
  });
  if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });
  return NextResponse.json({
    user: {
      ...auth.session,
      householdName: household.name,
      currency: household.currency,
      memberCount: household._count.members,
    },
  });
}
