import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parseNonNegativeMoney, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const liabilities = await prisma.liability.findMany({
      where: { householdId: session.householdId },
    });
    return NextResponse.json(liabilities);
  } catch (error) {
    console.error("Failed to fetch liabilities:", error);
    return NextResponse.json({ error: "Failed to fetch liabilities" }, { status: 500 });
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
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid liability payload" }, { status: 400 });
    const { name, type, amount, interestRate, monthlyPayment, notes, dueDate } = body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Liability name must be 1–120 characters" }, { status: 400 });
    const parsedAmount = parsePositiveMoney(amount);
    const parsedRate = interestRate === undefined || interestRate === null || interestRate === "" ? null : parseNonNegativeMoney(interestRate);
    const parsedPayment = monthlyPayment === undefined || monthlyPayment === null || monthlyPayment === "" ? null : parseNonNegativeMoney(monthlyPayment);
    if (!parsedAmount || (interestRate !== undefined && interestRate !== null && interestRate !== "" && (!parsedRate || parsedRate.greaterThan(100))) || (monthlyPayment !== undefined && monthlyPayment !== null && monthlyPayment !== "" && !parsedPayment)) return NextResponse.json({ error: "Liability amount, rate, or payment is invalid" }, { status: 400 });
    if (type !== undefined && !["MORTGAGE", "PERSONAL_LOAN", "CAR_LOAN", "EDUCATION_LOAN", "CREDIT_CARD_DEBT", "OTHER"].includes(String(type))) return NextResponse.json({ error: "Invalid liability type" }, { status: 400 });
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) return NextResponse.json({ error: "Notes must be text up to 2000 characters" }, { status: 400 });
    const parsedDueDate = dueDate === undefined || dueDate === null || dueDate === "" ? null : parseIsoDate(dueDate);
    if (dueDate !== undefined && dueDate !== null && dueDate !== "" && !parsedDueDate) return NextResponse.json({ error: "Due date must be a valid ISO date" }, { status: 400 });

    const liability = await prisma.liability.create({
      data: {
        householdId: session.householdId,
        name: name.trim(),
        type: String(type || "MORTGAGE"),
        amount: parsedAmount,
        interestRate: parsedRate,
        monthlyPayment: parsedPayment,
        dueDate: parsedDueDate,
        notes: notes || null,
      },
    });

    return NextResponse.json(liability, { status: 201 });
  } catch (error) {
    console.error("Failed to create liability:", error);
    return NextResponse.json({ error: "Failed to create liability" }, { status: 500 });
  }
}
