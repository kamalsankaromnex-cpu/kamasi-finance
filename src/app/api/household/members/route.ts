import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const household = await prisma.household.findUnique({
      where: { id: session.householdId },
      select: { id: true, name: true, currency: true, createdAt: true },
    });

    const members = await prisma.householdMember.findMany({
      where: { householdId: session.householdId },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
    });

    const rawInvitations = session.role === "OWNER" ? await prisma.householdInvitation.findMany({
      where: { householdId: session.householdId },
      select: { id: true, householdId: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }) : [];

    const now = new Date();
    const invitations = rawInvitations.map((inv) => {
      const isExpired = inv.status === "PENDING" && new Date(inv.expiresAt) < now;
      return {
        ...inv,
        status: isExpired ? "EXPIRED" : inv.status,
      };
    });

    return NextResponse.json({ household, members, invitations });
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
      return NextResponse.json({ error: "Valid email address is required" }, { status: 400 });
    }
    if (role !== undefined && !["MEMBER", "VIEWER"].includes(role)) {
      return NextResponse.json({ error: "Invitation role must be MEMBER or VIEWER" }, { status: 400 });
    }

    const inviteCode = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 Days Expiry

    const result = await prisma.$transaction(async (tx) => {
      const invitation = await tx.householdInvitation.create({
        data: {
          householdId: session.householdId,
          email: email.toLowerCase().trim(),
          role: role || "MEMBER",
          code: inviteCode,
          status: "PENDING",
          expiresAt,
        },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: invitation.id,
        action: "CREATE",
        actorUserId: session.id,
        reason: "Owner sent family invitation",
        metadata: { action: "HOUSEHOLD_INVITATION_CREATED", email: invitation.email, role: invitation.role },
      });

      return invitation;
    });

    return NextResponse.json(
      {
        invitation: { id: result.id, email: result.email, role: result.role, expiresAt: result.expiresAt },
        code: inviteCode,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to invite family member:", error);
    return NextResponse.json({ error: "Failed to invite family member" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only household OWNER can manage member roles" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { memberId, role } = body;

    if (!memberId || typeof memberId !== "string") {
      return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    if (!role || !["MEMBER", "VIEWER"].includes(role)) {
      return NextResponse.json(
        { error: "Role updates are restricted to MEMBER or VIEWER. Arbitrary OWNER assignment is not permitted." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const targetMember = await tx.householdMember.findFirst({
        where: { id: memberId, householdId: session.householdId },
      });

      if (!targetMember) throw new Error("MEMBER_NOT_FOUND");

      if (targetMember.role === "OWNER") {
        throw new Error("OWNER_PROTECTION_VIOLATION");
      }

      const res = await tx.householdMember.update({
        where: { id: memberId },
        data: { role },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: memberId,
        action: "UPDATE",
        fromState: targetMember.role,
        toState: role,
        actorUserId: session.id,
        reason: "Owner updated member role",
        metadata: { action: "HOUSEHOLD_MEMBER_ROLE_CHANGED", targetUserId: targetMember.userId },
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "MEMBER_NOT_FOUND") {
        return NextResponse.json({ error: "Household member not found" }, { status: 404 });
      }
      if (error.message === "OWNER_PROTECTION_VIOLATION") {
        return NextResponse.json(
          { error: "Forbidden: Owner role cannot be demoted via generic role update" },
          { status: 400 }
        );
      }
    }
    console.error("Failed to update member role:", error);
    return NextResponse.json({ error: "Failed to update member role" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Forbidden: Only household OWNER can revoke invitations or remove members" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const invitationId = searchParams.get("invitationId") || searchParams.get("id");

    if (memberId) {
      const result = await prisma.$transaction(async (tx) => {
        const targetMember = await tx.householdMember.findFirst({
          where: { id: memberId, householdId: session.householdId },
        });

        if (!targetMember) throw new Error("MEMBER_NOT_FOUND");

        if (targetMember.role === "OWNER") {
          throw new Error("CANNOT_REMOVE_OWNER");
        }

        await tx.householdMember.delete({
          where: { id: memberId },
        });

        await AuditService.record(tx, {
          householdId: session.householdId,
          entityType: "HOUSEHOLD",
          entityId: memberId,
          action: "UPDATE",
          fromState: targetMember.role,
          toState: "REMOVED",
          actorUserId: session.id,
          reason: "Owner removed member from household",
          metadata: { action: "HOUSEHOLD_MEMBER_REMOVED", targetUserId: targetMember.userId },
        });

        return { success: true, removedMemberId: memberId };
      });

      return NextResponse.json(result);
    }

    if (invitationId) {
      const result = await prisma.$transaction(async (tx) => {
        const existingInvite = await tx.householdInvitation.findFirst({
          where: { id: invitationId, householdId: session.householdId },
        });

        if (!existingInvite) throw new Error("INVITATION_NOT_FOUND");

        const updated = await tx.householdInvitation.update({
          where: { id: invitationId },
          data: { status: "REVOKED" },
        });

        await AuditService.record(tx, {
          householdId: session.householdId,
          entityType: "HOUSEHOLD",
          entityId: invitationId,
          action: "CANCEL",
          fromState: existingInvite.status,
          toState: "REVOKED",
          actorUserId: session.id,
          reason: "Owner revoked household invitation",
          metadata: { action: "HOUSEHOLD_INVITATION_REVOKED", email: existingInvite.email },
        });

        return updated;
      });

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Explicit resource identifier required (memberId or invitationId)" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "MEMBER_NOT_FOUND" || error.message === "INVITATION_NOT_FOUND") {
        return NextResponse.json({ error: "Resource not found or access denied" }, { status: 404 });
      }
      if (error.message === "CANNOT_REMOVE_OWNER") {
        return NextResponse.json(
          { error: "Forbidden: Household Owner cannot be removed from the household" },
          { status: 400 }
        );
      }
    }
    console.error("Failed to execute family deletion request:", error);
    return NextResponse.json({ error: "Failed to execute family deletion request" }, { status: 500 });
  }
}
