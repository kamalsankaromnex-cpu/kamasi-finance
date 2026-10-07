import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await authorizeRequest(req);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "Current and new passwords are required" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "VALIDATION_ERROR", message: "New password must be at least 8 characters long" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.session.id },
    });
    if (!user) {
      return NextResponse.json({ error: "USER_NOT_FOUND", message: "User not found" }, { status: 404 });
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Current password is incorrect" }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: error.message || "Failed to update password" }, { status: 500 });
  }
}
