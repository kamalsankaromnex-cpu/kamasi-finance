import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const employments = await prisma.employmentProfile.findMany({
      where: { householdId: session.householdId, ...(session.role === "OWNER" ? {} : { userId: session.id }) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        incomeSource: true,
        payslips: { orderBy: { year: "desc" }, take: 12 },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(employments);
  } catch (error: any) {
    console.error("Failed to fetch employment profiles:", error);
    return NextResponse.json({ error: error?.message || "Failed to fetch employment profiles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid employment payload" }, { status: 400 });
    const {
      userId,
      employerName,
      designation,
      employmentType,
      joiningDate,
      salaryFrequency,
      salaryCreditDate,
      status,
      expectedMonthlySalary,
      defaultAccountId,
    } = body as Record<string, unknown>;

    if (!employerName || typeof employerName !== "string" || !employerName.trim()) {
      return NextResponse.json({ error: "Employer Name is required" }, { status: 400 });
    }
    if (employerName.trim().length > 160 || (designation !== undefined && designation !== null && (typeof designation !== "string" || designation.length > 120))) return NextResponse.json({ error: "Employer name or designation is too long or invalid" }, { status: 400 });
    if (employmentType !== undefined && !["FULL_TIME", "CONTRACT", "PART_TIME"].includes(String(employmentType))) return NextResponse.json({ error: "Invalid employment type" }, { status: 400 });
    if (salaryFrequency !== undefined && !["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].includes(String(salaryFrequency))) return NextResponse.json({ error: "Invalid salary frequency" }, { status: 400 });
    if (status !== undefined && !["ACTIVE", "ON_LEAVE", "RESIGNED"].includes(String(status))) return NextResponse.json({ error: "Invalid employment status" }, { status: 400 });
    const creditDay = salaryCreditDate === undefined || salaryCreditDate === null || salaryCreditDate === "" ? 1 : Number(salaryCreditDate);
    if (!Number.isInteger(creditDay) || creditDay < 1 || creditDay > 31) return NextResponse.json({ error: "Salary credit day must be an integer from 1 to 31" }, { status: 400 });
    const joining = joiningDate === undefined || joiningDate === null || joiningDate === "" ? null : parseIsoDate(joiningDate);
    if (joiningDate !== undefined && joiningDate !== null && joiningDate !== "" && !joining) return NextResponse.json({ error: "Joining date must be a valid ISO date" }, { status: 400 });
    const expectedSalary = expectedMonthlySalary === undefined || expectedMonthlySalary === null || expectedMonthlySalary === "" ? null : parsePositiveMoney(expectedMonthlySalary);
    if (expectedMonthlySalary !== undefined && expectedMonthlySalary !== null && expectedMonthlySalary !== "" && !expectedSalary) return NextResponse.json({ error: "Expected monthly salary must be a positive finite amount" }, { status: 400 });

    // 1. Resolve & Validate Target User ID
    let finalUserId = session.id;
    if (userId && typeof userId === "string" && userId.trim() !== "") {
      if (session.role !== "OWNER") return NextResponse.json({ error: "Only an OWNER can create another member's employment profile" }, { status: 403 });
      const userMembership = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: session.householdId, userId: userId.trim() } },
        select: { userId: true },
      });
      if (!userMembership) return NextResponse.json({ error: "User is not a member of this household" }, { status: 404 });
      finalUserId = userMembership.userId;
    }

    // 2. Resolve & Validate Credit Day Int
    const finalCreditDay = creditDay;

    // 3. Resolve & Validate Joining Date
    const finalJoiningDate: Date | null = joining;

    // 4. Resolve & Validate Expected Salary Decimal
    const finalExpectedSalary: Prisma.Decimal | null = expectedSalary;

    // 5. Resolve & Validate Default Account ID
    let finalAccountId: string | null = null;
    if (defaultAccountId && typeof defaultAccountId === "string" && defaultAccountId.trim() !== "") {
      const acc = await prisma.account.findFirst({
        where: { id: defaultAccountId.trim(), householdId: session.householdId, OR: [{ isShared: true }, { userId: session.id }] },
      });
      if (!acc || acc.isArchived) return NextResponse.json({ error: "Default account is unavailable" }, { status: 400 });
      finalAccountId = acc.id;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create or find IncomeSource for Salary
      let incomeSource = await tx.incomeSource.findFirst({
        where: {
          householdId: session.householdId,
          name: `${employerName.trim()} Salary (${designation ? designation.trim() : "Salary"})`,
        },
      });

      if (!incomeSource) {
        incomeSource = await tx.incomeSource.create({
          data: {
            householdId: session.householdId,
            name: `${employerName.trim()} Salary (${designation ? designation.trim() : "Salary"})`,
            category: "Salary",
            behavior: "RECURRING",
            frequency: String(salaryFrequency || "MONTHLY"),
            expectedAmount: finalExpectedSalary,
            defaultAccountId: finalAccountId,
            expectedDay: finalCreditDay,
          },
        });
      }

      // Create Employment Profile
      const employment = await tx.employmentProfile.create({
        data: {
          householdId: session.householdId,
          userId: finalUserId,
          employerName: employerName.trim(),
          designation: typeof designation === "string" ? designation.trim() : null,
          employmentType: String(employmentType || "FULL_TIME"),
          joiningDate: finalJoiningDate,
          salaryFrequency: String(salaryFrequency || "MONTHLY"),
          salaryCreditDate: finalCreditDay,
          status: String(status || "ACTIVE"),
          incomeSourceId: incomeSource.id,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          incomeSource: true,
        },
      });

      return employment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create employment profile:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create employment profile" },
      { status: 500 }
    );
  }
}
