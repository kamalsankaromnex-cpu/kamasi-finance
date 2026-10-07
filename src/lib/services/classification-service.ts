import { prisma } from "@/lib/prisma";

export const SYSTEM_SCOPES = [
  { name: "Family", icon: "home", color: "#3b82f6", isSystem: true, sortOrder: 1 },
  { name: "Sericulture", icon: "leaf", color: "#10b981", isSystem: true, sortOrder: 2 },
  { name: "Goat Farming", icon: "beef", color: "#d97706", isSystem: true, sortOrder: 3 },
  { name: "Agriculture", icon: "sprout", color: "#84cc16", isSystem: true, sortOrder: 4 },
  { name: "Property", icon: "building", color: "#8b5cf6", isSystem: true, sortOrder: 5 },
  { name: "Business", icon: "briefcase", color: "#6366f1", isSystem: true, sortOrder: 6 },
  { name: "Personal", icon: "user", color: "#ec4899", isSystem: true, sortOrder: 7 },
  { name: "Other", icon: "layers", color: "#64748b", isSystem: true, sortOrder: 8 },
];

/**
 * Deterministically seed system scopes for a household if they don't exist.
 */
export async function seedSystemScopes(householdId: string) {
  const existingScopes = await prisma.financialScope.findMany({
    where: { householdId },
  });

  if (existingScopes.length === 0) {
    for (const sysScope of SYSTEM_SCOPES) {
      await prisma.financialScope.upsert({
        where: {
          householdId_name: {
            householdId,
            name: sysScope.name,
          },
        },
        update: {},
        create: {
          householdId,
          name: sysScope.name,
          icon: sysScope.icon,
          color: sysScope.color,
          sortOrder: sysScope.sortOrder,
          isSystem: true,
          isActive: true,
        },
      });
    }

    // Starter Cost Center: Family -> Home
    const familyScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId, name: "Family" } },
    });

    if (familyScope) {
      await prisma.costCenter.upsert({
        where: {
          householdId_scopeId_name: {
            householdId,
            scopeId: familyScope.id,
            name: "Home",
          },
        },
        update: {},
        create: {
          householdId,
          scopeId: familyScope.id,
          name: "Home",
          description: "Primary Residence / Household Facility",
          icon: "home",
          isSystem: true,
          isActive: true,
        },
      });
    }
  }

  return prisma.financialScope.findMany({
    where: { householdId },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Validate full classification relationship combination.
 * Enforces:
 * 1. Scope belongs to household.
 * 2. Category belongs to household.
 * 3. Scope ↔ Category compatibility (if scope has mapped categories, category must be allowed).
 * 4. Subcategory belongs to Category and household.
 * 5. CostCenter belongs to Scope and household.
 * 6. Active check for new records.
 */
export async function validateClassificationCombination(params: {
  householdId: string;
  scopeId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  costCenterId?: string | null;
  isNewRecord?: boolean;
}): Promise<{ valid: boolean; error?: string }> {
  const { householdId, scopeId, categoryId, subcategoryId, costCenterId, isNewRecord = false } = params;

  // 1. Validate Scope if provided
  let scope = null;
  if (scopeId) {
    scope = await prisma.financialScope.findFirst({
      where: { id: scopeId, householdId },
    });

    if (!scope) {
      return { valid: false, error: "Financial scope not found in household" };
    }
    if (isNewRecord && !scope.isActive) {
      return { valid: false, error: "Financial scope is inactive" };
    }
  }

  // 2. Validate Category if provided
  let category = null;
  if (categoryId) {
    category = await prisma.category.findFirst({
      where: { id: categoryId, householdId },
    });

    if (!category) {
      return { valid: false, error: "Category not found in household" };
    }
    if (isNewRecord && !category.isActive) {
      return { valid: false, error: "Category is inactive" };
    }
  }

  // 3. Scope ↔ Category relationship check
  if (scopeId && categoryId) {
    const mappingsCount = await prisma.scopeCategory.count({
      where: { scopeId },
    });

    // If mappings exist for this scope, verify category is allowed
    if (mappingsCount > 0) {
      const isMapped = await prisma.scopeCategory.findUnique({
        where: {
          scopeId_categoryId: {
            scopeId,
            categoryId,
          },
        },
      });

      if (!isMapped) {
        return { valid: false, error: "Selected category is not allowed for this financial scope" };
      }
    }
  }

  // 4. Subcategory ↔ Category relationship check
  if (subcategoryId) {
    const subcategory = await prisma.categorySubcategory.findFirst({
      where: { id: subcategoryId, householdId },
    });

    if (!subcategory) {
      return { valid: false, error: "Subcategory not found in household" };
    }
    if (isNewRecord && !subcategory.isActive) {
      return { valid: false, error: "Subcategory is inactive" };
    }
    if (categoryId && subcategory.categoryId !== categoryId) {
      return { valid: false, error: "Subcategory does not belong to the selected category" };
    }
  }

  // 5. CostCenter ↔ Scope relationship check
  if (costCenterId) {
    const costCenter = await prisma.costCenter.findFirst({
      where: { id: costCenterId, householdId },
    });

    if (!costCenter) {
      return { valid: false, error: "Cost center / Location not found in household" };
    }
    if (isNewRecord && !costCenter.isActive) {
      return { valid: false, error: "Cost center / Location is inactive" };
    }
    if (scopeId && costCenter.scopeId !== scopeId) {
      return { valid: false, error: "Location / Cost center does not belong to the selected financial scope" };
    }
  }

  return { valid: true };
}
