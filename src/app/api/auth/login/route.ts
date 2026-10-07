import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie, SessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const rateKey = `login_${email.toLowerCase().trim()}`;
    const rateCheck = checkRateLimit(rateKey, 5, 60 * 1000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Too many failed login attempts. Please try again in 1 minute." },
        { status: 429, headers: { "Retry-After": Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          include: { household: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    let primaryMembership = user.memberships[0];
    if (!primaryMembership) {
      const household = await prisma.$transaction(async (tx) => {
        const created = await tx.household.create({
          data: { name: `${user.name}'s Household`, currency: "INR" },
        });
        const member = await tx.householdMember.create({
          data: { householdId: created.id, userId: user.id, role: "OWNER" },
          include: { household: true },
        });
        await tx.familyProfile.create({
          data: { householdId: created.id, name: user.name, relationship: "SELF", isPrimary: true, isActive: true },
        });
        return member;
      });
      primaryMembership = household;
    }

    // Resolve household profiles
    let profiles = await prisma.familyProfile.findMany({
      where: { householdId: primaryMembership.householdId, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    if (profiles.length === 0) {
      const autoProfile = await prisma.familyProfile.create({
        data: {
          householdId: primaryMembership.householdId,
          name: user.name,
          relationship: "SELF",
          isPrimary: true,
          isActive: true,
        },
      });
      profiles = [autoProfile];
    }

    const requiresProfileSelection = profiles.length > 1;
    const selectedProfile = requiresProfileSelection ? null : profiles[0];

    const sessionPayload: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: primaryMembership.householdId,
      role: primaryMembership.role as any,
      activeProfileId: selectedProfile ? selectedProfile.id : null,
      activeProfile: selectedProfile
        ? {
            id: selectedProfile.id,
            name: selectedProfile.name,
            relationship: selectedProfile.relationship,
            avatarUrl: selectedProfile.avatarUrl,
            color: selectedProfile.color,
            isPrimary: selectedProfile.isPrimary,
          }
        : null,
    };

    await setSessionCookie(sessionPayload);
    const { setActiveProfileCookie, removeActiveProfileCookie } = await import("@/lib/auth");
    if (selectedProfile) {
      await setActiveProfileCookie(selectedProfile.id);
    } else {
      await removeActiveProfileCookie();
    }

    return NextResponse.json({
      user: sessionPayload,
      requiresProfileSelection,
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        avatarUrl: p.avatarUrl,
        color: p.color,
        isPrimary: p.isPrimary,
      })),
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
