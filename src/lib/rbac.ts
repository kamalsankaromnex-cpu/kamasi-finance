import { NextResponse } from "next/server";
import { verifySessionToken, SessionUser } from "./auth";
import { prisma } from "./prisma";

export async function getSessionFromRequest(req: Request): Promise<SessionUser | null> {
  const cookieHeader = req.headers.get("cookie");
  let token: string | undefined = undefined;

  if (cookieHeader) {
    const match = cookieHeader.split(";").find((c) => c.trim().startsWith("kamasi_session="));
    if (match) {
      token = match.split("=")[1]?.trim();
    }
  }

  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) return null;
  const tokenSession = await verifySessionToken(token);
  if (!tokenSession) return null;
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: tokenSession.householdId, userId: tokenSession.id } },
    select: { role: true },
  });
  if (!membership || !["OWNER", "MEMBER", "VIEWER"].includes(membership.role)) return null;
  return { ...tokenSession, role: membership.role as SessionUser["role"] };
}

export async function authorizeRequest(req: Request): Promise<{ session: SessionUser } | { errorResponse: NextResponse }> {
  const session = await getSessionFromRequest(req);

  if (!session) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 }),
    };
  }

  return { session };
}

export function assertCanMutate(role: string): NextResponse | null {
  if (role === "VIEWER") {
    return NextResponse.json(
      { error: "Forbidden: Viewer role has read-only access to household finances" },
      { status: 403 }
    );
  }
  return null;
}
