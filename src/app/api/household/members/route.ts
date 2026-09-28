import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const members = await prisma.householdMember.findMany({
      where: { householdId: session.householdId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
    });

    const invitations = session.role === "OWNER" ? await prisma.householdInvitation.findMany({
      where: { householdId: session.householdId },
      select: { id: true, householdId: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
    }) : [];

    return NextResponse.json({ members, invitations });
  } catch (error) {
    console.error("Failed to fetch household members:", error);
    return NextResponse.json({ error: "Failed to fetch household members" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only household OWNER can send invitations" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, role } = body;

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (role !== undefined && !["MEMBER", "VIEWER"].includes(role)) {
      return NextResponse.json({ error: "Invitation role must be MEMBER or VIEWER" }, { status: 400 });
    }

    const inviteCode = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days Expiry

    const invitation = await prisma.householdInvitation.create({
      data: {
        householdId: session.householdId,
        email: email.toLowerCase().trim(),
        role: role || "MEMBER",
        code: inviteCode,
        status: "PENDING",
        expiresAt,
      },
    });

    return NextResponse.json({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, code: inviteCode }, { status: 201 });
  } catch (error) {
    console.error("Failed to invite family member:", error);
    return NextResponse.json({ error: "Failed to invite family member" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only household OWNER can revoke invitations" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("id");

    if (!invitationId) {
      return NextResponse.json({ error: "Invitation ID is required" }, { status: 400 });
    }

    const existingInvite = await prisma.householdInvitation.findFirst({
      where: { id: invitationId, householdId: session.householdId },
    });

    if (!existingInvite) {
      return NextResponse.json({ error: "Invitation not found or access denied" }, { status: 404 });
    }

    const updated = await prisma.householdInvitation.update({
      where: { id: invitationId },
      data: { status: "REVOKED" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to revoke invitation:", error);
    return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 });
  }
}
