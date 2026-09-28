import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate } from "@/lib/financial-validation";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid employment payload" }, { status: 400 });
    const updates = body as Record<string, unknown>;
    const { employerName, designation, employmentType, joiningDate, salaryFrequency, salaryCreditDate, status } = updates;

    const existing = await prisma.employmentProfile.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });
    }
    if (session.role !== "OWNER" && existing.userId !== session.id) return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });

    if (employerName !== undefined && (typeof employerName !== "string" || !employerName.trim() || employerName.trim().length > 160)) return NextResponse.json({ error: "Employer name must be 1–160 characters" }, { status: 400 });
    if (designation !== undefined && designation !== null && (typeof designation !== "string" || designation.length > 120)) return NextResponse.json({ error: "Designation must be text up to 120 characters" }, { status: 400 });
    if (employmentType !== undefined && !["FULL_TIME", "CONTRACT", "PART_TIME"].includes(String(employmentType))) return NextResponse.json({ error: "Invalid employment type" }, { status: 400 });
    if (salaryFrequency !== undefined && !["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].includes(String(salaryFrequency))) return NextResponse.json({ error: "Invalid salary frequency" }, { status: 400 });
    if (status !== undefined && !["ACTIVE", "ON_LEAVE", "RESIGNED"].includes(String(status))) return NextResponse.json({ error: "Invalid employment status" }, { status: 400 });
    const nextCreditDay = salaryCreditDate === undefined ? existing.salaryCreditDate : salaryCreditDate === null || salaryCreditDate === "" ? null : Number(salaryCreditDate);
    if (nextCreditDay !== null && nextCreditDay !== undefined && (!Number.isInteger(nextCreditDay) || nextCreditDay < 1 || nextCreditDay > 31)) return NextResponse.json({ error: "Salary credit day must be an integer from 1 to 31" }, { status: 400 });
    const nextJoiningDate = joiningDate === undefined ? existing.joiningDate : joiningDate === null || joiningDate === "" ? null : parseIsoDate(joiningDate);
    if (joiningDate !== undefined && joiningDate !== null && joiningDate !== "" && !nextJoiningDate) return NextResponse.json({ error: "Joining date must be a valid ISO date" }, { status: 400 });

    const updated = await prisma.employmentProfile.update({
      where: { id, householdId: session.householdId },
      data: {
        ...(updates.employerName !== undefined && { employerName: (employerName as string).trim() }),
        ...(updates.designation !== undefined && { designation: designation ? (designation as string).trim() : null }),
        ...(updates.employmentType !== undefined && { employmentType: String(employmentType) }),
        ...(updates.joiningDate !== undefined && { joiningDate: nextJoiningDate }),
        ...(updates.salaryFrequency !== undefined && { salaryFrequency: String(salaryFrequency) }),
        ...(updates.salaryCreditDate !== undefined && { salaryCreditDate: nextCreditDay }),
        ...(updates.status !== undefined && { status: String(status) }),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        incomeSource: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update employment profile:", error);
    return NextResponse.json({ error: "Failed to update employment profile" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.employmentProfile.findFirst({
      where: { id, householdId: session.householdId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });
    }
    if (session.role !== "OWNER" && existing.userId !== session.id) return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });

    // Soft update status to RESIGNED to preserve payslips and transaction records
    const deactivated = await prisma.employmentProfile.update({
      where: { id },
      data: { status: "RESIGNED" },
    });

    return NextResponse.json({
      message: "Employment profile marked as RESIGNED (payslips & ledger history preserved)",
      employment: deactivated,
    });
  } catch (error) {
    console.error("Failed to archive employment profile:", error);
    return NextResponse.json({ error: "Failed to archive employment profile" }, { status: 500 });
  }
}
