import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { authorizeRequest } from "@/lib/rbac";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const body = await req.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 128) return NextResponse.json({ error: "A valid invitation code is required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, email: true, name: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });
    const invite = await prisma.householdInvitation.findFirst({ where: { code, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (!invite) return NextResponse.json({ error: "Invitation is invalid, expired, or already used" }, { status: 404 });
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "This invitation was issued to a different email address" }, { status: 403 });
    }
    if (!["MEMBER", "VIEWER"].includes(invite.role)) return NextResponse.json({ error: "Invitation role is invalid" }, { status: 400 });

    const membership = await prisma.$transaction(async (tx) => {
      const claimed = await tx.householdInvitation.updateMany({
        where: { id: invite.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED" },
      });
      if (claimed.count !== 1) throw new Error("INVITATION_ALREADY_CLAIMED");
      return tx.householdMember.upsert({
        where: { householdId_userId: { householdId: invite.householdId, userId: user.id } },
        create: { householdId: invite.householdId, userId: user.id, role: invite.role },
        update: { role: invite.role },
        select: { role: true },
      });
    });
    await setSessionCookie({ id: user.id, email: user.email, name: user.name, householdId: invite.householdId, role: membership.role as "MEMBER" | "VIEWER" });
    return NextResponse.json({ success: true, householdId: invite.householdId, role: membership.role });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_CLAIMED") {
      return NextResponse.json({ error: "Invitation is invalid, expired, or already used" }, { status: 409 });
    }
    console.error("Failed to accept household invitation:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
