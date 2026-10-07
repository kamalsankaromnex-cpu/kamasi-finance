import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { AuditService } from "@/finance/audit/audit.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const tasks = await prisma.projectTask.findMany({
      where: { projectId: id, householdId: session.householdId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: id,
        householdId: session.householdId,
        title: body.title,
        description: body.description || null,
        status: body.status || "TODO",
        priority: body.priority || "MEDIUM",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        assignedMemberId: body.assignedMemberId || null,
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "PROJECT_TASK",
      entityId: task.id,
      action: "CREATE",
      actorUserId: session.id,
      metadata: { projectId: id, title: task.title },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: error.message || "Failed to create task" }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;
    const { id } = await params;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!body || !body.taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const existing = await prisma.projectTask.findFirst({
      where: { id: body.taskId, projectId: id, householdId: session.householdId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updated = await prisma.projectTask.update({
      where: { id: body.taskId },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        description: body.description !== undefined ? body.description : undefined,
        status: body.status !== undefined ? body.status : undefined,
        priority: body.priority !== undefined ? body.priority : undefined,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
      },
    });

    await AuditService.record(prisma, {
      householdId: session.householdId,
      entityType: "PROJECT_TASK",
      entityId: updated.id,
      action: "UPDATE",
      actorUserId: session.id,
      metadata: { projectId: id, title: updated.title, status: updated.status },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: error.message || "Failed to update task" }, { status: 400 });
  }
}
