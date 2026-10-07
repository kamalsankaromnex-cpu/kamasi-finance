import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

const ALLOWED_RELATIONSHIPS = [
  "SELF",
  "SPOUSE",
  "PARENT",
  "CHILD",
  "BROTHER",
  "SISTER",
  "GRANDPARENT",
  "GRANDCHILD",
  "RELATIVE",
  "OTHER",
] as const;

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const profiles = await prisma.familyProfile.findMany({
      where: { householdId: session.householdId, isActive: true },
      include: {
        _count: {
          select: {
            transactions: true,
            goals: true,
            accounts: true,
            assets: true,
            investments: true,
            borrowings: true,
            projects: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error("Failed to list family profiles:", error);
    return NextResponse.json({ error: "Failed to list family profiles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { name, relationship, dateOfBirth, notes, avatarUrl, color } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 60) {
      return NextResponse.json({ error: "Profile name must be at most 60 characters" }, { status: 400 });
    }

    const rel = (relationship || "OTHER").toUpperCase();
    if (!ALLOWED_RELATIONSHIPS.includes(rel as any)) {
      return NextResponse.json(
        { error: `Relationship must be one of: ${ALLOWED_RELATIONSHIPS.join(", ")}` },
        { status: 400 }
      );
    }

    // Check unique name in household
    const existing = await prisma.familyProfile.findFirst({
      where: { householdId: session.householdId, name: trimmedName, isActive: true },
    });
    if (existing) {
      return NextResponse.json({ error: "A profile with this name already exists in your household" }, { status: 409 });
    }

    let parsedDob: Date | null = null;
    if (dateOfBirth) {
      const d = new Date(dateOfBirth);
      if (!isNaN(d.getTime())) parsedDob = d;
    }

    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.familyProfile.create({
        data: {
          householdId: session.householdId,
          name: trimmedName,
          relationship: rel,
          dateOfBirth: parsedDob,
          notes: notes ? String(notes).trim() : null,
          avatarUrl: avatarUrl ? String(avatarUrl).trim() : null,
          color: color ? String(color).trim() : "#6366f1",
          isPrimary: false,
          isActive: true,
        },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: created.id,
        action: "CREATE",
        actorUserId: session.id,
        reason: "User created new family profile",
        metadata: {
          action: "FAMILY_PROFILE_CREATED",
          profileId: created.id,
          profileName: created.name,
          relationship: created.relationship,
        },
      });

      return created;
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    console.error("Failed to create family profile:", error);
    return NextResponse.json({ error: "Failed to create family profile" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const { id, name, relationship, dateOfBirth, notes, avatarUrl, color } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
    }

    const targetProfile = await prisma.familyProfile.findFirst({
      where: { id, householdId: session.householdId, isActive: true },
    });

    if (!targetProfile) {
      return NextResponse.json({ error: "Profile not found or access denied" }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Profile name cannot be empty" }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (relationship !== undefined) {
      const rel = String(relationship).toUpperCase();
      if (!ALLOWED_RELATIONSHIPS.includes(rel as any)) {
        return NextResponse.json({ error: "Invalid relationship type" }, { status: 400 });
      }
      updateData.relationship = rel;
    }
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === null || dateOfBirth === "") {
        updateData.dateOfBirth = null;
      } else {
        const d = new Date(dateOfBirth);
        if (!isNaN(d.getTime())) updateData.dateOfBirth = d;
      }
    }
    if (notes !== undefined) updateData.notes = notes ? String(notes).trim() : null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
    if (color !== undefined) updateData.color = color ? String(color).trim() : targetProfile.color;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.familyProfile.update({
        where: { id },
        data: updateData,
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: id,
        action: "UPDATE",
        actorUserId: session.id,
        reason: "User updated family profile",
        metadata: {
          action: "FAMILY_PROFILE_UPDATED",
          profileId: id,
          changes: updateData,
        },
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update family profile:", error);
    return NextResponse.json({ error: "Failed to update family profile" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
    }

    const targetProfile = await prisma.familyProfile.findFirst({
      where: { id, householdId: session.householdId, isActive: true },
    });

    if (!targetProfile) {
      return NextResponse.json({ error: "Profile not found or access denied" }, { status: 404 });
    }

    // Safety checks: Cannot delete if only 1 active profile remains in household
    const activeCount = await prisma.familyProfile.count({
      where: { householdId: session.householdId, isActive: true },
    });
    if (activeCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the only remaining profile in the household" },
        { status: 400 }
      );
    }

    if (targetProfile.isPrimary) {
      return NextResponse.json(
        { error: "Cannot delete the primary profile of the household" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const res = await tx.familyProfile.update({
        where: { id },
        data: { isActive: false },
      });

      await AuditService.record(tx, {
        householdId: session.householdId,
        entityType: "HOUSEHOLD",
        entityId: id,
        action: "ARCHIVE",
        actorUserId: session.id,
        reason: "User deactivated family profile",
        metadata: {
          action: "FAMILY_PROFILE_DEACTIVATED",
          profileId: id,
          profileName: targetProfile.name,
        },
      });

      return res;
    });

    return NextResponse.json({ success: true, deactivatedProfile: result });
  } catch (error) {
    console.error("Failed to delete family profile:", error);
    return NextResponse.json({ error: "Failed to delete family profile" }, { status: 500 });
  }
}
