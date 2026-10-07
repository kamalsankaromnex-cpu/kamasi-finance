import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/rbac";
import { ProjectQueryService } from "@/modules/projects/project-query.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const snapshot = await ProjectQueryService.getProjectSnapshot(prisma, session.householdId, id);
    return NextResponse.json(snapshot);
  } catch (error: any) {
    console.error("Failed to fetch project snapshot:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch project snapshot" }, { status: 500 });
  }
}
