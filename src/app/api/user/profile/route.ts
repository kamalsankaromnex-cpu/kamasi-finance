import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const auth = await authorizeRequest(req);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Full name is required" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: auth.session.id },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message || "Failed to update profile" }, { status: 500 });
  }
}
