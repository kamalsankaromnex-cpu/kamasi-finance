import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSystemScopes, validateClassificationCombination } from "@/lib/services/classification-service";

describe("Universal Financial Classification Architecture", () => {
  let testHouseholdId: string;
  let otherHouseholdId: string;

  beforeEach(async () => {
    // Clean database before each test
    await prisma.transaction.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.costCenter.deleteMany({});
    await prisma.categorySubcategory.deleteMany({});
    await prisma.scopeCategory.deleteMany({});
    await prisma.financialScope.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test user and households
    const user = await prisma.user.create({
      data: {
        email: "test.classifier@kamasi.fi",
        passwordHash: "hash",
        name: "Classification Tester",
      },
    });

    const h1 = await prisma.household.create({ data: { name: "Primary Family" } });
    const h2 = await prisma.household.create({ data: { name: "Secondary Family" } });

    await prisma.householdMember.create({
      data: { householdId: h1.id, userId: user.id, role: "OWNER" },
    });

    testHouseholdId = h1.id;
    otherHouseholdId = h2.id;
  });

  it("1. Deterministically seeds system scopes for a household", async () => {
    const scopes = await seedSystemScopes(testHouseholdId);

    expect(scopes.length).toBe(8);
    const scopeNames = scopes.map((s) => s.name);
    expect(scopeNames).toContain("Family");
    expect(scopeNames).toContain("Sericulture");
    expect(scopeNames).toContain("Goat Farming");
    expect(scopeNames).toContain("Agriculture");
    expect(scopeNames).toContain("Property");
    expect(scopeNames).toContain("Business");
    expect(scopeNames).toContain("Personal");
    expect(scopeNames).toContain("Other");

    // Calling seed twice does not duplicate system scopes
    await seedSystemScopes(testHouseholdId);
    const reFetched = await prisma.financialScope.findMany({ where: { householdId: testHouseholdId } });
    expect(reFetched.length).toBe(8);
  });

  it("2. Enforces UNIQUE(householdId, name) on FinancialScope", async () => {
    await seedSystemScopes(testHouseholdId);

    await expect(
      prisma.financialScope.create({
        data: {
          householdId: testHouseholdId,
          name: "Family",
        },
      })
    ).rejects.toThrow();
  });

  it("3. Enforces Scope ↔ Category relationship mapping", async () => {
    await seedSystemScopes(testHouseholdId);

    const familyScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Family" } },
    });

    const cat1 = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
    });

    const cat2 = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Goat Feed", type: "EXPENSE" },
    });

    // Map Groceries to Family scope
    await prisma.scopeCategory.create({
      data: { scopeId: familyScope!.id, categoryId: cat1.id },
    });

    // Validation should accept Groceries for Family
    const v1 = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: familyScope!.id,
      categoryId: cat1.id,
    });
    expect(v1.valid).toBe(true);

    // Validation should reject Goat Feed for Family (since mappings exist and Goat Feed is not mapped)
    const v2 = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: familyScope!.id,
      categoryId: cat2.id,
    });
    expect(v2.valid).toBe(false);
    expect(v2.error).toContain("category is not allowed");
  });

  it("4. Enforces Subcategory belonging to Category", async () => {
    const cat1 = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Utilities", type: "EXPENSE" },
    });

    const cat2 = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Food", type: "EXPENSE" },
    });

    const sub1 = await prisma.categorySubcategory.create({
      data: { categoryId: cat1.id, householdId: testHouseholdId, name: "Electricity" },
    });

    // Valid: sub1 belongs to cat1
    const v1 = await validateClassificationCombination({
      householdId: testHouseholdId,
      categoryId: cat1.id,
      subcategoryId: sub1.id,
    });
    expect(v1.valid).toBe(true);

    // Invalid: sub1 does not belong to cat2
    const v2 = await validateClassificationCombination({
      householdId: testHouseholdId,
      categoryId: cat2.id,
      subcategoryId: sub1.id,
    });
    expect(v2.valid).toBe(false);
    expect(v2.error).toContain("Subcategory does not belong to the selected category");
  });

  it("5. Enforces Scope ownership of Cost Center (Location/Facility)", async () => {
    await seedSystemScopes(testHouseholdId);

    const familyScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Family" } },
    });
    const goatScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Goat Farming" } },
    });

    const goatShed = await prisma.costCenter.create({
      data: {
        householdId: testHouseholdId,
        scopeId: goatScope!.id,
        name: "Goat Shed #1",
      },
    });

    // Valid: Goat Shed #1 belongs to Goat Farming scope
    const v1 = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: goatScope!.id,
      costCenterId: goatShed.id,
    });
    expect(v1.valid).toBe(true);

    // Invalid: Goat Shed #1 does NOT belong to Family scope
    const v2 = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: familyScope!.id,
      costCenterId: goatShed.id,
    });
    expect(v2.valid).toBe(false);
    expect(v2.error).toContain("Location / Cost center does not belong to the selected financial scope");
  });

  it("6. Enforces household tenant isolation across all classification models", async () => {
    await seedSystemScopes(testHouseholdId);
    await seedSystemScopes(otherHouseholdId);

    const otherScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: otherHouseholdId, name: "Family" } },
    });

    // Trying to validate otherHousehold's scope under testHouseholdId must fail
    const v = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: otherScope!.id,
    });

    expect(v.valid).toBe(false);
    expect(v.error).toContain("Financial scope not found in household");
  });

  it("7. Zero Financial Impact: Classification edits do not mutate journals or account balances", async () => {
    await seedSystemScopes(testHouseholdId);

    const familyScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Family" } },
    });

    const account = await prisma.account.create({
      data: {
        householdId: testHouseholdId,
        name: "Checking",
        type: "BANK",
        balance: 10000,
      },
    });

    const initialJournalCount = await prisma.journal.count();
    const initialEntryCount = await prisma.journalEntry.count();

    // Update Scope metadata
    await prisma.financialScope.update({
      where: { id: familyScope!.id },
      data: { name: "Family & Home", color: "#123456" },
    });

    // Create Cost Center
    await prisma.costCenter.create({
      data: {
        householdId: testHouseholdId,
        scopeId: familyScope!.id,
        name: "Main Residence",
      },
    });

    const updatedAccount = await prisma.account.findUnique({ where: { id: account.id } });
    const finalJournalCount = await prisma.journal.count();
    const finalEntryCount = await prisma.journalEntry.count();

    expect(Number(updatedAccount!.balance)).toBe(10000);
    expect(finalJournalCount).toBe(initialJournalCount);
    expect(finalEntryCount).toBe(initialEntryCount);
  });
});
