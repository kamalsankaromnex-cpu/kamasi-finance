import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const institutions = await prisma.financialInstitution.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        shortCode: true,
        logoUrl: true,
      },
    });

    return NextResponse.json(institutions);
  } catch (error) {
    console.error("Failed to fetch financial institutions:", error);
    return NextResponse.json({ error: "Failed to fetch financial institutions" }, { status: 500 });
  }
}
