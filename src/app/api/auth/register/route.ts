import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie, SessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, householdName } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Missing required registration fields" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const hName = householdName || `${name.split(" ")[0]}'s Family Household`;

    // Atomic Registration
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name.trim(),
          passwordHash,
          avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        },
      });

      const household = await tx.household.create({
        data: {
          name: hName,
          currency: "INR",
        },
      });

      const membership = await tx.householdMember.create({
        data: {
          householdId: household.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      const primaryProfile = await tx.familyProfile.create({
        data: {
          householdId: household.id,
          name: user.name,
          relationship: "SELF",
          isPrimary: true,
          isActive: true,
        },
      });

      return { user, household, role: membership.role, primaryProfile };
    });

    const sessionPayload: SessionUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      householdId: result.household.id,
      role: result.role as any,
      activeProfileId: result.primaryProfile.id,
      activeProfile: {
        id: result.primaryProfile.id,
        name: result.primaryProfile.name,
        relationship: result.primaryProfile.relationship,
        isPrimary: true,
      },
    };

    await setSessionCookie(sessionPayload);
    const { setActiveProfileCookie } = await import("@/lib/auth");
    await setActiveProfileCookie(result.primaryProfile.id);

    return NextResponse.json({ user: sessionPayload }, { status: 201 });
  } catch (error) {
    console.error("Registration failed:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
