import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";
import { parseIsoDate, parsePositiveMoney } from "@/lib/financial-validation";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    const assets = await prisma.asset.findMany({
      where: { householdId: session.householdId },
    });
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Failed to fetch assets:", error);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
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
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid asset payload" }, { status: 400 });
    const { name, type, value, notes, purchaseDate } = body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return NextResponse.json({ error: "Asset name must be 1–120 characters" }, { status: 400 });
    const parsedValue = parsePositiveMoney(value);
    if (!parsedValue) return NextResponse.json({ error: "Asset value must be a positive finite amount" }, { status: 400 });
    if (type !== undefined && !["REAL_ESTATE", "VEHICLE", "GOLD", "JEWELRY", "ELECTRONICS", "OTHER"].includes(String(type))) return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) return NextResponse.json({ error: "Notes must be text up to 2000 characters" }, { status: 400 });
    const parsedPurchaseDate = purchaseDate === undefined || purchaseDate === null || purchaseDate === "" ? null : parseIsoDate(purchaseDate);
    if (purchaseDate !== undefined && purchaseDate !== null && purchaseDate !== "" && !parsedPurchaseDate) return NextResponse.json({ error: "Purchase date must be a valid ISO date" }, { status: 400 });

    const asset = await prisma.asset.create({
      data: {
        householdId: session.householdId,
        name: name.trim(),
        type: String(type || "REAL_ESTATE"),
        value: parsedValue,
        purchaseDate: parsedPurchaseDate,
        notes: notes || null,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Failed to create asset:", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
