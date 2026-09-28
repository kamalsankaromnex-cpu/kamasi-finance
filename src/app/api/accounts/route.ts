import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { maskAccountNumber, parseFiniteMoney, parseIsoDate, parseNonNegativeMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "true";

    const accounts = await prisma.account.findMany({
      where: {
        householdId: session.householdId,
        OR: [{ isShared: true }, { userId: session.id }],
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        userHolder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(accounts.map(maskAccountNumber));
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
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
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid account payload" }, { status: 400 });
    const {
      name,
      type,
      balance,
      accountNumber,
      currency,
      isShared,
      creditLimit,
      billingCycleDay,
      paymentDueDate,
      interestRate,
      maturityDate,
    } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Account name must be 1–120 characters" }, { status: 400 });
    const allowedTypes = ["BANK", "CREDIT", "INVESTMENT", "CASH", "LOAN"];
    if (type !== undefined && !allowedTypes.includes(String(type))) return NextResponse.json({ error: "Invalid account type" }, { status: 400 });
    const openingBalance = parseFiniteMoney(balance ?? 0);
    if (!openingBalance) return NextResponse.json({ error: "Account balance must be a finite decimal" }, { status: 400 });
    if (accountNumber !== undefined && accountNumber !== null && (typeof accountNumber !== "string" || accountNumber.length > 64 || /[\r\n]/.test(accountNumber))) return NextResponse.json({ error: "Account number is invalid" }, { status: 400 });
    if (currency !== undefined && (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))) return NextResponse.json({ error: "Currency must be a three-letter code" }, { status: 400 });
    if (isShared !== undefined && typeof isShared !== "boolean") return NextResponse.json({ error: "Sharing setting must be boolean" }, { status: 400 });
    const decCreditLimit = creditLimit === undefined || creditLimit === null || creditLimit === "" ? null : parseNonNegativeMoney(creditLimit);
    const decInterestRate = interestRate === undefined || interestRate === null || interestRate === "" ? null : parseNonNegativeMoney(interestRate);
    if (creditLimit !== undefined && creditLimit !== null && creditLimit !== "" && !decCreditLimit) return NextResponse.json({ error: "Credit limit must be non-negative" }, { status: 400 });
    if (interestRate !== undefined && interestRate !== null && interestRate !== "" && (!decInterestRate || decInterestRate.greaterThan(100))) return NextResponse.json({ error: "Interest rate must be from 0 to 100" }, { status: 400 });
    const parseDay = (value: unknown) => value === undefined || value === null || value === "" ? null : Number(value);
    const cycleDay = parseDay(billingCycleDay);
    const dueDay = parseDay(paymentDueDate);
    if ((cycleDay !== null && (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 31)) || (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31))) return NextResponse.json({ error: "Billing and due days must be integers from 1 to 31" }, { status: 400 });
    const maturity = maturityDate === undefined || maturityDate === null || maturityDate === "" ? null : parseIsoDate(maturityDate);
    if (maturityDate !== undefined && maturityDate !== null && maturityDate !== "" && !maturity) return NextResponse.json({ error: "Maturity date must be a valid ISO date" }, { status: 400 });

    const account = await prisma.account.create({
      data: {
        householdId: session.householdId,
        userId: session.id,
        name: name.trim(),
        type: String(type || "BANK"),
        balance: openingBalance,
        accountNumber: typeof accountNumber === "string" && accountNumber.trim() ? accountNumber.trim() : null,
        currency: (currency || "INR").toUpperCase(),
        isShared: isShared ?? true,
        creditLimit: decCreditLimit,
        billingCycleDay: cycleDay,
        paymentDueDate: dueDay,
        interestRate: decInterestRate,
        maturityDate: maturity,
        isArchived: false,
      },
    });

    return NextResponse.json(maskAccountNumber(account), { status: 201 });
  } catch (error) {
    console.error("Failed to create account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
