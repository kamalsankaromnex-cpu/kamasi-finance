import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parsePositiveMoney } from "@/lib/financial-validation";

export async function POST(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const forbidden = assertCanMutate(session.role);
    if (forbidden) return forbidden;

    const body = await req.json();
    const {
      payslipId,
      accountId,
      actualCreditDate,
      actualAmountCredited,
      transactionRef,
      notes,
    } = body;

    if (!payslipId || !accountId) {
      return NextResponse.json({ error: "Payslip ID and Bank Account ID are required" }, { status: 400 });
    }

    const payslip = await prisma.payslipRecord.findFirst({
      where: { id: payslipId, householdId: session.householdId },
      include: { employment: true, user: { select: { id: true, name: true, email: true } } },
    });

    if (!payslip) {
      return NextResponse.json({ error: "Payslip record not found" }, { status: 404 });
    }
    if (session.role !== "OWNER" && payslip.userId !== session.id) {
      return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
    }
    if (payslip.status !== "GENERATED") {
      return NextResponse.json({ error: "Payslip has already been confirmed" }, { status: 409 });
    }

    // IDOR Check: Verify receiving bank account belongs to user's household
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId: session.householdId, OR: [{ isShared: true }, { userId: session.id }] },
    });

    if (!account || account.isArchived) {
      return NextResponse.json({ error: "Bank account does not belong to household" }, { status: 403 });
    }

    const creditDate = actualCreditDate === undefined || actualCreditDate === null || actualCreditDate === ""
      ? new Date()
      : parseIsoDate(actualCreditDate);
    if (!creditDate) return NextResponse.json({ error: "Credit date must be a valid ISO date or timestamp" }, { status: 400 });

    const decCredited = actualAmountCredited === undefined || actualAmountCredited === null || actualAmountCredited === ""
      ? payslip.netSalary
      : parsePositiveMoney(actualAmountCredited);
    if (!decCredited || decCredited.greaterThan(payslip.netSalary)) {
      return NextResponse.json({ error: "Credited amount must be positive and cannot exceed the payslip net salary" }, { status: 400 });
    }
    if (!payslip.netSalary.greaterThan(0)) {
      return NextResponse.json({ error: "Payslip net salary must be positive before confirmation" }, { status: 400 });
    }
    if ((transactionRef !== undefined && transactionRef !== null && typeof transactionRef !== "string") ||
        (notes !== undefined && notes !== null && typeof notes !== "string")) {
      return NextResponse.json({ error: "Transaction reference and notes must be text" }, { status: 400 });
    }

    // Single Atomic Transaction updating Ledger, Account Balance (EXACTLY ONCE), and Payslip Status
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.payslipRecord.updateMany({
        where: { id: payslipId, householdId: session.householdId, status: "GENERATED" },
        data: { status: "PROCESSING" },
      });
      if (claim.count !== 1) throw new Error("PAYSLIP_ALREADY_CONFIRMED");

      // 1. Create Canonical Income Transaction
      const transaction = await tx.transaction.create({
        data: {
          householdId: session.householdId,
          accountId,
          userId: payslip.userId,
          incomeSourceId: payslip.employment.incomeSourceId,
          date: creditDate,
          amount: decCredited,
          type: "INCOME",
          paymentMethod: "BANK_TRANSFER",
          referenceNo: transactionRef || null,
          merchant: payslip.employment.employerName,
          description: `Salary Credit: ${payslip.employment.employerName} (${payslip.payPeriod})`,
          notes: notes || `Net Salary Credited for ${payslip.user.name}`,
        },
      });

      // 2. Canonical Single Balance Increment (INCREMENTED ONCE AND ONLY ONCE)
      const updatedAccount = await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: decCredited } },
      });

      // 3. Update PayslipRecord Status & Link Transaction ID
      const status = decCredited.gte(payslip.netSalary) ? "CONFIRMED_CREDITED" : "PARTIALLY_CREDITED";

      const updatedPayslip = await tx.payslipRecord.update({
        where: { id: payslipId },
        data: {
          actualCreditDate: creditDate,
          actualAmountCredited: decCredited,
          accountId,
          transactionRef: transactionRef || null,
          status,
          transactionId: transaction.id,
        },
        include: {
          account: { select: { id: true, name: true, type: true, currency: true } },
          employment: { select: { id: true, employerName: true, designation: true, employmentType: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return {
        payslip: updatedPayslip,
        transaction,
        accountBalance: updatedAccount.balance,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYSLIP_ALREADY_CONFIRMED") {
      return NextResponse.json({ error: "Payslip has already been confirmed" }, { status: 409 });
    }
    console.error("Failed to confirm salary bank credit:", error);
    return NextResponse.json({ error: "Failed to confirm salary bank credit" }, { status: 500 });
  }
}
