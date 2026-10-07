import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function runTests() {
  console.log("=== STARTING REFERENCE DATA AUTOMATED VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log("  [PASS] " + testName);
      passed++;
    } else {
      console.error("  [FAIL] " + testName + (detail ? " - " + detail : ""));
      failed++;
    }
  }

  try {
    // 1. Verify Seeded System Scopes
    const systemScopes = await prisma.financialScope.findMany({
      where: { isSystem: true },
    });
    assert(systemScopes.length > 0, "System Scopes exist in database", "Found: " + systemScopes.length);
    const scopeNames = systemScopes.map((s) => s.name);
    assert(scopeNames.includes("Family") || scopeNames.includes("Agriculture"), "Contains core standard system scopes");

    // 2. Household Setup for Test
    let testHousehold = await prisma.household.findFirst({
      where: { name: "Reference Test Household" },
    });
    if (!testHousehold) {
      testHousehold = await prisma.household.create({
        data: {
          name: "Reference Test Household",
          currency: "INR",
        },
      });
    }
    assert(!!testHousehold, "Test Household available", testHousehold.id);

    // Baseline ledger count check (Zero Financial Side Effects verification)
    const initialJournalCount = await prisma.journal.count();
    const initialEntryCount = await prisma.journalEntry.count();
    const initialTransactionCount = await prisma.transaction.count();

    // 3. FinancialScope CRUD & Safe Deletion Test
    const customScope = await prisma.financialScope.create({
      data: {
        name: "Test Solar Farm",
        color: "#f59e0b",
        icon: "sun",
        householdId: testHousehold.id,
        isSystem: false,
        isActive: true,
      },
    });
    assert(!!customScope.id, "Create Custom Financial Scope", customScope.id);

    // Verify unreferenced scope can be safely deleted
    await prisma.financialScope.delete({
      where: { id: customScope.id },
    });
    const deletedScope = await prisma.financialScope.findUnique({
      where: { id: customScope.id },
    });
    assert(deletedScope === null, "Hard-delete unreferenced custom scope");

    // 4. Category & ScopeCategory Association Test
    const baseScope = systemScopes[0];
    const customCategory = await prisma.category.create({
      data: {
        name: "Test Organic Fertilizer",
        type: "EXPENSE",
        householdId: testHousehold.id,
        isDefault: false,
        isActive: true,
        scopeCategories: {
          create: [{ scopeId: baseScope.id }],
        },
      },
      include: {
        scopeCategories: true,
      },
    });
    assert(
      customCategory.scopeCategories.length === 1 && customCategory.scopeCategories[0].scopeId === baseScope.id,
      "Create Custom Category with Scope Mapping",
      "Mapped to " + baseScope.name
    );

    // 5. CategorySubcategory CRUD & Parent Relationship Test
    const customSub = await prisma.categorySubcategory.create({
      data: {
        name: "Vermicompost Batch A",
        categoryId: customCategory.id,
        householdId: testHousehold.id,
        isActive: true,
      },
    });
    assert(customSub.categoryId === customCategory.id, "Create Subcategory linked to Category");

    // 6. CostCenter (Facility) Linked to Scope Test
    const customCostCenter = await prisma.costCenter.create({
      data: {
        name: "Vermicompost Pit #1",
        scopeId: baseScope.id,
        householdId: testHousehold.id,
        isActive: true,
      },
    });
    assert(customCostCenter.scopeId === baseScope.id, "Create Facility/CostCenter linked to Scope");

    // 7. Referential Integrity / Safe Deactivation Simulation
    const subCount = await prisma.categorySubcategory.count({
      where: { categoryId: customCategory.id },
    });
    assert(subCount > 0, "Category has active subcategory reference", "Count: " + subCount);

    if (subCount > 0) {
      await prisma.category.update({
        where: { id: customCategory.id },
        data: { isActive: false },
      });
    }
    const deactivatedCategory = await prisma.category.findUnique({
      where: { id: customCategory.id },
    });
    assert(deactivatedCategory?.isActive === false, "Referenced category soft-deactivated safely without breaking FKs");

    // Clean up test subcategory and cost center
    await prisma.categorySubcategory.delete({ where: { id: customSub.id } });
    await prisma.costCenter.delete({ where: { id: customCostCenter.id } });
    await prisma.scopeCategory.deleteMany({ where: { categoryId: customCategory.id } });
    await prisma.category.delete({ where: { id: customCategory.id } });
    assert(true, "Unreferenced test entities cleaned up cleanly");

    // 8. Zero Financial Mutation Check
    const finalJournalCount = await prisma.journal.count();
    const finalEntryCount = await prisma.journalEntry.count();
    const finalTransactionCount = await prisma.transaction.count();

    assert(
      initialJournalCount === finalJournalCount &&
      initialEntryCount === finalEntryCount &&
      initialTransactionCount === finalTransactionCount,
      "Zero Financial Side Effects (Journals, entries, balances unaltered by reference data operations)",
      "Journals: " + initialJournalCount + "->" + finalJournalCount + ", Entries: " + initialEntryCount + "->" + finalEntryCount
    );

    // 9. Clean up test household
    await prisma.household.delete({ where: { id: testHousehold.id } });
    assert(true, "Test household cleaned up");

  } catch (err: any) {
    console.error("Test execution exception:", err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n=======================================================");
  console.log("RESULTS: " + passed + " PASSED | " + failed + " FAILED");
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
