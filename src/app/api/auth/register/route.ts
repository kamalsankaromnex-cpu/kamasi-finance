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

      return { user, household, role: membership.role };
    });

    const sessionPayload: SessionUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      householdId: result.household.id,
      role: result.role as any,
    };

    await setSessionCookie(sessionPayload);

    return NextResponse.json({ user: sessionPayload }, { status: 201 });
  } catch (error) {
    console.error("Registration failed:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
