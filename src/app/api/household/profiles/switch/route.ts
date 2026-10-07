import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { setActiveProfileCookie } from "@/lib/auth";
import { AuditService } from "@/finance/audit/audit.service";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const body = await req.json();
    const { profileId } = body;

    if (!profileId || typeof profileId !== "string") {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 });
    }

    if (profileId === "ALL") {
      await setActiveProfileCookie("ALL");
      await AuditService.record(prisma, {
        householdId: session.householdId,
        actorUserId: session.id,
        action: "UPDATE",
        entityType: "USER",
        entityId: "FAMILY_VIEW",
        metadata: {
          profileId: "ALL",
          profileName: "Family View",
          userEmail: session.email,
        },
      });
      return NextResponse.json({
        success: true,
        activeProfile: null,
        isFamilyView: true,
      });
    }

    // Strict Server-Side Household Ownership Validation (IDOR prevention)
    const profile = await prisma.familyProfile.findFirst({
      where: {
        id: profileId,
        householdId: session.householdId,
        isActive: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Forbidden: Profile does not belong to user's household or is inactive" },
        { status: 403 }
      );
    }

    await setActiveProfileCookie(profile.id);

    await AuditService.record(prisma, {
      householdId: session.householdId,
      actorUserId: session.id,
      action: "UPDATE",
      entityType: "USER",
      entityId: profile.id,
      metadata: {
        profileId: profile.id,
        profileName: profile.name,
        relationship: profile.relationship,
        userEmail: session.email,
      },
    });

    return NextResponse.json({
      success: true,
      activeProfile: {
        id: profile.id,
        name: profile.name,
        relationship: profile.relationship,
        avatarUrl: profile.avatarUrl,
        color: profile.color,
        isPrimary: profile.isPrimary,
      },
      isFamilyView: false,
    });
  } catch (error) {
    console.error("Failed to switch profile:", error);
    return NextResponse.json({ error: "Failed to switch profile" }, { status: 500 });
  }
}
