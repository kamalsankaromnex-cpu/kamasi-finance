import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseNonNegativeMoney, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const investments = await prisma.investment.findMany({
      where: { householdId: session.householdId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(investments);
  } catch (error) {
    console.error("Failed to fetch investments:", error);
    return NextResponse.json({ error: "Failed to fetch investments" }, { status: 500 });
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
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid investment payload" }, { status: 400 });
    const { name, symbol, type, quantity, purchasePrice, currentPrice, notes, accountId } = body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Investment name must be 1–120 characters" }, { status: 400 });
    const purchase = parsePositiveMoney(purchasePrice);
    const current = currentPrice === undefined || currentPrice === null || currentPrice === "" ? purchase : parseNonNegativeMoney(currentPrice);
    const units = quantity === undefined || quantity === null || quantity === "" ? new Prisma.Decimal(1) : parsePositiveMoney(quantity);
    if (!purchase || !current || !units) return NextResponse.json({ error: "Purchase price and quantity must be positive; current price must be non-negative" }, { status: 400 });
    const allowedTypes = ["STOCK", "MUTUAL_FUND", "FIXED_DEPOSIT", "GOLD", "EPF_PPF", "OTHER"];
    if (type !== undefined && !allowedTypes.includes(String(type))) return NextResponse.json({ error: "Invalid investment type" }, { status: 400 });
    if (symbol !== undefined && symbol !== null && (typeof symbol !== "string" || symbol.length > 32)) return NextResponse.json({ error: "Symbol must be text up to 32 characters" }, { status: 400 });
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) return NextResponse.json({ error: "Notes must be text up to 2000 characters" }, { status: 400 });
    let linkedAccountId: string | null = null;
    if (accountId !== undefined && accountId !== null && accountId !== "") {
      if (typeof accountId !== "string") return NextResponse.json({ error: "Investment account is invalid" }, { status: 400 });
      const account = await prisma.account.findFirst({ where: { id: accountId, householdId: session.householdId, OR: [{ isShared: true }, { userId: session.id }], isArchived: false, type: "INVESTMENT" }, select: { id: true } });
      if (!account) return NextResponse.json({ error: "Investment account is unavailable" }, { status: 400 });
      linkedAccountId = account.id;
    }

    const inv = await prisma.investment.create({
      data: {
        householdId: session.householdId,
        name: name.trim(),
        accountId: linkedAccountId,
        symbol: symbol || null,
        type: String(type || "MUTUAL_FUND"),
        quantity: units,
        purchasePrice: purchase,
        currentPrice: current,
        notes: notes || null,
      },
    });

    return NextResponse.json(inv, { status: 201 });
  } catch (error) {
    console.error("Failed to create investment:", error);
    return NextResponse.json({ error: "Failed to create investment" }, { status: 500 });
  }
}
