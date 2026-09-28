import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie, SessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
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
        return tx.householdMember.create({
          data: { householdId: created.id, userId: user.id, role: "OWNER" },
          include: { household: true },
        });
      });
      primaryMembership = household;
    }

    const sessionPayload: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: primaryMembership.householdId,
      role: primaryMembership.role as any,
    };

    await setSessionCookie(sessionPayload);

    return NextResponse.json({ user: sessionPayload });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
