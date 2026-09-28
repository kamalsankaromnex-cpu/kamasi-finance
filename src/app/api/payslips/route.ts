import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseNonNegativeMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const employmentId = searchParams.get("employmentId");

    const whereClause: any = { householdId: session.householdId };
    if (session.role !== "OWNER") whereClause.userId = session.id;
    if (employmentId) whereClause.employmentId = employmentId;

    const payslips = await prisma.payslipRecord.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true } },
        employment: { select: { id: true, employerName: true, designation: true, employmentType: true } },
        account: { select: { id: true, name: true, type: true, currency: true } },
        transaction: { select: { id: true, date: true, amount: true, type: true, description: true, referenceNo: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return NextResponse.json(payslips);
  } catch (error) {
    console.error("Failed to fetch payslips:", error);
    return NextResponse.json({ error: "Failed to fetch payslips" }, { status: 500 });
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
    const {
      employmentId,
      month,
      year,
      basicSalary,
      hra,
      otherAllowances,
      bonusIncentives,
      overtimeArrears,
      pfDeduction,
      esiDeduction,
      professionalTax,
      tdsTax,
      otherDeductions,
    } = body;

    if (typeof employmentId !== "string" || !employmentId) {
      return NextResponse.json({ error: "Employment ID, Month, and Year are required" }, { status: 400 });
    }
    const parsedMonth = typeof month === "number" || typeof month === "string" ? Number(month) : NaN;
    const parsedYear = typeof year === "number" || typeof year === "string" ? Number(year) : NaN;
    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 ||
        !Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 9999) {
      return NextResponse.json({ error: "Payslip month must be 1–12 and year must be a valid four-digit year" }, { status: 400 });
    }

    const employment = await prisma.employmentProfile.findFirst({
      where: { id: employmentId, householdId: session.householdId },
    });

    if (!employment) {
      return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });
    }
    if (session.role !== "OWNER" && employment.userId !== session.id) return NextResponse.json({ error: "Employment profile not found" }, { status: 404 });

    const components = [basicSalary, hra, otherAllowances, bonusIncentives, overtimeArrears, pfDeduction, esiDeduction, professionalTax, tdsTax, otherDeductions];
    const parsedComponents = components.map((value) => value === undefined || value === null || value === "" ? new Prisma.Decimal(0) : parseNonNegativeMoney(value));
    if (parsedComponents.some((value) => value === null)) {
      return NextResponse.json({ error: "Payslip earnings and deductions must be finite, non-negative amounts" }, { status: 400 });
    }
    const [decBasic, decHra, decAllowances, decBonus, decOvertime, decPf, decEsi, decPt, decTds, decOtherDed] = parsedComponents as Prisma.Decimal[];

    // Auto-calculate Gross, Total Deductions, and Net Salary
    const grossSalary = Prisma.Decimal.add(decBasic, decHra)
      .add(decAllowances)
      .add(decBonus)
      .add(decOvertime);

    const totalDeductions = Prisma.Decimal.add(decPf, decEsi)
      .add(decPt)
      .add(decTds)
      .add(decOtherDed);

    const netSalary = grossSalary.sub(totalDeductions);
    if (!grossSalary.greaterThan(0) || netSalary.isNegative()) {
      return NextResponse.json({ error: "Payslip gross salary must be positive and deductions cannot exceed earnings" }, { status: 400 });
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const payPeriod = `${monthNames[parsedMonth - 1]} ${parsedYear}`;
    const existingPayslip = await prisma.payslipRecord.findUnique({
      where: { employmentId_month_year: { employmentId, month: parsedMonth, year: parsedYear } },
      select: { id: true, status: true },
    });
    if (existingPayslip && existingPayslip.status !== "GENERATED") {
      return NextResponse.json({ error: "A confirmed payslip cannot be regenerated" }, { status: 409 });
    }

    const calculated = {
        basicSalary: decBasic,
        hra: decHra,
        otherAllowances: decAllowances,
        bonusIncentives: decBonus,
        overtimeArrears: decOvertime,
        grossSalary,
        pfDeduction: decPf,
        esiDeduction: decEsi,
        professionalTax: decPt,
        tdsTax: decTds,
        otherDeductions: decOtherDed,
        totalDeductions,
        netSalary,
    };
    let payslip;
    if (existingPayslip) {
      const changed = await prisma.payslipRecord.updateMany({
        where: { id: existingPayslip.id, status: "GENERATED" },
        data: calculated,
      });
      if (changed.count !== 1) return NextResponse.json({ error: "Payslip was already confirmed" }, { status: 409 });
      payslip = await prisma.payslipRecord.findUniqueOrThrow({
        where: { id: existingPayslip.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          employment: { select: { id: true, employerName: true, designation: true, employmentType: true } },
          account: { select: { id: true, name: true, type: true, currency: true } },
        },
      });
    } else {
      try {
        payslip = await prisma.payslipRecord.create({
          data: {
        householdId: session.householdId,
        employmentId,
        userId: employment.userId,
        month: parsedMonth,
        year: parsedYear,
        payPeriod,
        status: "GENERATED",
            ...calculated,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            employment: { select: { id: true, employerName: true, designation: true, employmentType: true } },
            account: { select: { id: true, name: true, type: true, currency: true } },
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return NextResponse.json({ error: "Payslip already exists for this employment period" }, { status: 409 });
        throw error;
      }
    }

    return NextResponse.json(payslip, { status: 201 });
  } catch (error) {
    console.error("Failed to generate payslip:", error);
    return NextResponse.json({ error: "Failed to generate payslip" }, { status: 500 });
  }
}
