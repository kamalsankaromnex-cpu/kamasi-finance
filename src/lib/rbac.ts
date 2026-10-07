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

  // Extract active profile preference if specified in cookie or header
  let requestedProfileId: string | undefined = undefined;
  if (cookieHeader) {
    const profMatch = cookieHeader.split(";").find((c) => c.trim().startsWith("kamasi_active_profile="));
    if (profMatch) {
      requestedProfileId = profMatch.split("=")[1]?.trim();
    }
  }
  const headerProf = req.headers.get("x-profile-id")?.trim();
  if (headerProf) {
    requestedProfileId = headerProf;
  }

  let activeProfileId: string | null = null;
  let activeProfile: SessionUser["activeProfile"] = null;

  if (requestedProfileId === "ALL") {
    activeProfileId = "ALL";
    activeProfile = null;
  } else if (requestedProfileId) {
    const profile = await prisma.familyProfile.findFirst({
      where: { id: requestedProfileId, householdId: tokenSession.householdId, isActive: true },
      select: { id: true, name: true, relationship: true, avatarUrl: true, color: true, isPrimary: true },
    });
    if (profile) {
      activeProfileId = profile.id;
      activeProfile = profile;
    }
  }

  // If no valid active profile was resolved yet, pick or auto-create primary profile for the household
  if (!activeProfileId) {
    let primaryProfile = await prisma.familyProfile.findFirst({
      where: { householdId: tokenSession.householdId, isPrimary: true, isActive: true },
      select: { id: true, name: true, relationship: true, avatarUrl: true, color: true, isPrimary: true },
    });

    if (!primaryProfile) {
      primaryProfile = await prisma.familyProfile.findFirst({
        where: { householdId: tokenSession.householdId, isActive: true },
        select: { id: true, name: true, relationship: true, avatarUrl: true, color: true, isPrimary: true },
      });
    }

    if (!primaryProfile) {
      primaryProfile = await prisma.familyProfile.create({
        data: {
          householdId: tokenSession.householdId,
          name: tokenSession.name,
          relationship: "SELF",
          isPrimary: true,
          isActive: true,
        },
        select: { id: true, name: true, relationship: true, avatarUrl: true, color: true, isPrimary: true },
      });
    }

    activeProfileId = primaryProfile.id;
    activeProfile = primaryProfile;
  }

  return {
    ...tokenSession,
    role: membership.role as SessionUser["role"],
    activeProfileId,
    activeProfile,
  };
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
