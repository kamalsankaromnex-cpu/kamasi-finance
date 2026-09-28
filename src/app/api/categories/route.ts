import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, assertCanMutate } from "@/lib/rbac";

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req);
    if ("errorResponse" in auth) return auth.errorResponse;
    const { session } = auth;

    let categories = await prisma.category.findMany({
      where: { householdId: session.householdId },
      include: { subcategories: true },
      orderBy: { name: "asc" },
    });

    // Seed default categories if none exist for this household
    if (categories.length === 0) {
      const defaults = [
        // Household
        { name: "Rent & Housing", icon: "home", color: "#ef4444", type: "EXPENSE", isDefault: true },
        { name: "Groceries & Food", icon: "shopping-cart", color: "#f59e0b", type: "EXPENSE", isDefault: true },
        { name: "Utilities & Bills", icon: "zap", color: "#3b82f6", type: "EXPENSE", isDefault: true },
        // Personal & Family
        { name: "Education & Tuition", icon: "book-open", color: "#8b5cf6", type: "EXPENSE", isDefault: true },
        { name: "Healthcare & Insurance", icon: "heart-pulse", color: "#ec4899", type: "EXPENSE", isDefault: true },
        { name: "Travel & Transport", icon: "car", color: "#06b6d4", type: "EXPENSE", isDefault: true },
        // Agriculture & Sericulture
        { name: "Seeds & Crop Cultivation", icon: "sprout", color: "#10b981", type: "EXPENSE", isDefault: true },
        { name: "Fertilizers & Pesticides", icon: "flask-conical", color: "#84cc16", type: "EXPENSE", isDefault: true },
        { name: "Sericulture & Mulberry", icon: "leaf", color: "#059669", type: "EXPENSE", isDefault: true },
        // Livestock & Goat Farming
        { name: "Goat Feed & Livestock", icon: "beef", color: "#d97706", type: "EXPENSE", isDefault: true },
        { name: "Veterinary & Medicine", icon: "stethoscope", color: "#e11d48", type: "EXPENSE", isDefault: true },
        // Business & Operating
        { name: "Business Operating Costs", icon: "briefcase", color: "#6366f1", type: "EXPENSE", isDefault: true },
        // Financial
        { name: "Loan Interest & EMI", icon: "percent", color: "#64748b", type: "EXPENSE", isDefault: true },
      ];

      for (const d of defaults) {
        await prisma.category.create({
          data: { ...d, householdId: session.householdId },
        });
      }

      categories = await prisma.category.findMany({
        where: { householdId: session.householdId },
        include: { subcategories: true },
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
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
    const { name, icon, color, type, parentId } = body;

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        householdId: session.householdId,
        name: name.trim(),
        icon: icon || "tag",
        color: color || "#64748b",
        type: type || "EXPENSE",
        parentId: parentId || null,
        isDefault: false,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
