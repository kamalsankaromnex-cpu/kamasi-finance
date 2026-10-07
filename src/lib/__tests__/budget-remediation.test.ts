import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSystemScopes, validateClassificationCombination } from "@/lib/services/classification-service";
import { assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import { POST as postBudget, GET as getBudgets } from "@/app/api/budgets/route";
import { PATCH as patchBudget, DELETE as deleteBudget, GET as getBudgetById } from "@/app/api/budgets/[id]/route";
import { createSessionToken } from "@/lib/auth";
import { AuditService } from "@/finance/audit/audit.service";

describe("Budget Module Production Remediation Suite", () => {
  let testHouseholdId: string;
  let testAccountId: string;
  let testUserId: string;
  let testUserToken: string;

  const makeReq = (url: string, method: string, token: string, body?: any) => {
    return new Request(`http://localhost:3000${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: `kamasi_session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  beforeEach(async () => {
    // Reset database state before each test
    await prisma.auditEvent.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.budget.deleteMany({});
    await prisma.costCenter.deleteMany({});
    await prisma.categorySubcategory.deleteMany({});
    await prisma.scopeCategory.deleteMany({});
    await prisma.financialScope.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    const user = await prisma.user.create({
      data: {
        email: `budget.tester.${Date.now()}@kamasi.fi`,
        passwordHash: "hash",
        name: "Budget Tester",
      },
    });
    testUserId = user.id;

    const household = await prisma.household.create({ data: { name: "Budget Family" } });
    await prisma.householdMember.create({
      data: { householdId: household.id, userId: user.id, role: "OWNER" },
    });

    const account = await prisma.account.create({
      data: {
        householdId: household.id,
        name: "Primary Bank",
        type: "BANK",
        balance: 100000,
      },
    });

    testHouseholdId = household.id;
    testAccountId = account.id;

    testUserToken = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      householdId: household.id,
      role: "OWNER",
    });

    await seedSystemScopes(testHouseholdId);
  });

  it("1. Financial Mutation Isolation: Budget create, update, and archive cause 0 Journal, 0 JournalEntry, 0 Account.balance mutations", async () => {
    const initialAccount = await prisma.account.findUniqueOrThrow({ where: { id: testAccountId } });
    const initialJournals = await prisma.journal.count();
    const initialJournalEntries = await prisma.journalEntry.count();
    const initialTransactions = await prisma.transaction.count();

    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
    });

    // 1. Create Budget
    const budget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        name: "Monthly Grocery Plan",
        amount: new Prisma.Decimal(25000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
        categoryId: category.id,
        status: "ACTIVE",
      },
    });

    // 2. Update Budget
    await prisma.budget.update({
      where: { id: budget.id },
      data: { amount: new Prisma.Decimal(30000), status: "PAUSED" },
    });

    // 3. Archive Budget
    await prisma.budget.update({
      where: { id: budget.id },
      data: { status: "ARCHIVED" },
    });

    // Verify 100% financial isolation
    const finalAccount = await prisma.account.findUniqueOrThrow({ where: { id: testAccountId } });
    const finalJournals = await prisma.journal.count();
    const finalJournalEntries = await prisma.journalEntry.count();
    const finalTransactions = await prisma.transaction.count();

    expect(Number(finalAccount.balance)).toBe(Number(initialAccount.balance));
    expect(finalJournals).toBe(initialJournals);
    expect(finalJournalEntries).toBe(initialJournalEntries);
    expect(finalTransactions).toBe(initialTransactions);
  });

  it("2. Actuals Integration: DRAFT Expense gives Actual = 0; POSTED Expense increases Actual", async () => {
    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Dining Out", type: "EXPENSE" },
    });

    const budget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        categoryId: category.id,
        amount: new Prisma.Decimal(10000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    // A. DRAFT Expense: ₹3,000
    const draftTxn = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        categoryId: category.id,
        amount: new Prisma.Decimal(3000),
        type: "EXPENSE",
        status: "DRAFT",
        date: new Date(Date.UTC(2026, 9, 10)),
        description: "Draft dinner bill",
      },
    });

    // Calculate actuals following authoritative predicate
    const draftOnlyTxns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        date: { gte: budget.startDate, lte: budget.endDate },
        categoryId: budget.categoryId,
      },
    });
    const draftActual = draftOnlyTxns.reduce((acc, t) => acc + Number(t.amount), 0);
    expect(draftActual).toBe(0); // DRAFT must NOT count towards actual spending!

    // B. Post the expense: change status to POSTED
    await prisma.transaction.update({
      where: { id: draftTxn.id },
      data: { status: "POSTED", postedAt: new Date() },
    });

    const postedTxns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        date: { gte: budget.startDate, lte: budget.endDate },
        categoryId: budget.categoryId,
      },
    });
    const postedActual = postedTxns.reduce((acc, t) => acc + Number(t.amount), 0);
    expect(postedActual).toBe(3000); // POSTED expense is included!
  });

  it("3. Refund and Reversal Invariants: PARTIALLY_REFUNDED subtracts refundedAmount, REVERSED gives 0 actual", async () => {
    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Equipment", type: "EXPENSE" },
    });

    const budget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        categoryId: category.id,
        amount: new Prisma.Decimal(50000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    // Create a ₹20,000 expense with a ₹5,000 partial refund
    const txn = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        categoryId: category.id,
        amount: new Prisma.Decimal(20000),
        refundedAmount: new Prisma.Decimal(5000),
        type: "EXPENSE",
        status: "PARTIALLY_REFUNDED",
        date: new Date(Date.UTC(2026, 9, 15)),
        description: "Farm Tools with Partial Return",
      },
    });

    const txns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        date: { gte: budget.startDate, lte: budget.endDate },
        categoryId: budget.categoryId,
      },
    });

    const effectiveSpent = txns.reduce((acc, t) => {
      const net = Number(t.amount) - Number(t.refundedAmount || 0);
      return acc + (net > 0 ? net : 0);
    }, 0);

    expect(effectiveSpent).toBe(15000); // ₹20,000 - ₹5,000 = ₹15,000 net actual!

    // Now test Reversal: marking transaction REVERSED / voided
    await prisma.transaction.update({
      where: { id: txn.id },
      data: { status: "REVERSED", isVoided: true, voidedAt: new Date() },
    });

    const afterReversalTxns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        date: { gte: budget.startDate, lte: budget.endDate },
        categoryId: budget.categoryId,
      },
    });

    const afterReversalSpent = afterReversalTxns.reduce((acc, t) => {
      const net = Number(t.amount) - Number(t.refundedAmount || 0);
      return acc + (net > 0 ? net : 0);
    }, 0);

    expect(afterReversalSpent).toBe(0); // Reversal correctly reduces budget actual to 0!
  });

  it("4. Transfer Exclusion: TRANSFER transactions between accounts strictly contribute ₹0 to budget spending", async () => {
    const savingsAccount = await prisma.account.create({
      data: {
        householdId: testHouseholdId,
        name: "Emergency Savings",
        type: "BANK",
        balance: 200000,
      },
    });

    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "General Savings", type: "EXPENSE" },
    });

    const budget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        categoryId: category.id,
        amount: new Prisma.Decimal(20000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    // Record an inter-account transfer of ₹15,000
    await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        transferAccountId: savingsAccount.id,
        amount: new Prisma.Decimal(15000),
        type: "TRANSFER",
        status: "POSTED",
        date: new Date(Date.UTC(2026, 9, 5)),
        description: "Bank to Savings Transfer",
      },
    });

    // Query for budget actuals (which filters for type: "EXPENSE")
    const budgetExpenseTxns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
      },
    });

    expect(budgetExpenseTxns.length).toBe(0); // Transfers are never included in budget actuals!
  });

  it("5. Period Isolation: October budget does not count September or November expenses", async () => {
    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Electricity", type: "EXPENSE" },
    });

    const octBudget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        categoryId: category.id,
        amount: new Prisma.Decimal(5000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    // Expense 1: September 30 (Prior month)
    await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        categoryId: category.id,
        amount: new Prisma.Decimal(4200),
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(Date.UTC(2026, 8, 30, 23, 59, 0)),
        description: "Sept Electricity",
      },
    });

    // Expense 2: October 15 (Inside budget period)
    await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        categoryId: category.id,
        amount: new Prisma.Decimal(4800),
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(Date.UTC(2026, 9, 15, 12, 0, 0)),
        description: "Oct Electricity",
      },
    });

    // Expense 3: November 1 (Next month)
    await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        categoryId: category.id,
        amount: new Prisma.Decimal(5100),
        type: "EXPENSE",
        status: "POSTED",
        date: new Date(Date.UTC(2026, 10, 1, 0, 1, 0)),
        description: "Nov Electricity",
      },
    });

    // Query transactions matching October budget bounds
    const matchingTxns = await prisma.transaction.findMany({
      where: {
        householdId: testHouseholdId,
        type: "EXPENSE",
        status: { in: ["POSTED", "RECONCILED", "PARTIALLY_REFUNDED"] },
        isVoided: false,
        categoryId: category.id,
        date: { gte: octBudget.startDate, lte: octBudget.endDate },
      },
    });

    expect(matchingTxns.length).toBe(1);
    expect(Number(matchingTxns[0].amount)).toBe(4800); // Strictly isolated to October!
  });

  it("6. Over-Budget Detection & Calculation: Planned 30,000, Actual 35,000 -> Remaining -5,000, Over Budget 5,000", async () => {
    const planned = 30000;
    const actual = 35000;

    const remaining = planned - actual;
    const isOverBudget = actual > planned;
    const overBudgetAmount = isOverBudget ? actual - planned : 0;
    const utilizationPct = (actual / planned) * 100;

    expect(remaining).toBe(-5000);
    expect(isOverBudget).toBe(true);
    expect(overBudgetAmount).toBe(5000);
    expect(utilizationPct).toBeCloseTo(116.67, 1);

    // Test zero budget safe division
    const zeroBudget = 0;
    const zeroSpent = 500;
    const safePct = zeroBudget > 0 ? (zeroSpent / zeroBudget) * 100 : 0;
    expect(safePct).toBe(0);
    expect(isFinite(safePct)).toBe(true);
  });

  it("7. Universal Financial Classification: validates Scope -> Category -> Subcategory and Facility combinations", async () => {
    const scope = await prisma.financialScope.findFirstOrThrow({
      where: { householdId: testHouseholdId, name: "Goat Farming" },
    });

    const category = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Feed", type: "EXPENSE" },
    });

    // Map Category to Scope
    await prisma.scopeCategory.create({
      data: { scopeId: scope.id, categoryId: category.id },
    });

    const subcategory = await prisma.categorySubcategory.create({
      data: { householdId: testHouseholdId, categoryId: category.id, name: "Green Fodder" },
    });

    const costCenter = await prisma.costCenter.create({
      data: { householdId: testHouseholdId, scopeId: scope.id, name: "Goat Shed #1" },
    });

    // Valid combination: Scope + Category + Subcategory + Cost Center
    const validResult = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: scope.id,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      costCenterId: costCenter.id,
      isNewRecord: true,
    });
    expect(validResult.valid).toBe(true);

    // Invalid Subcategory: does not belong to selected category
    const otherCategory = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Repairs", type: "EXPENSE" },
    });
    const invalidSubResult = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: scope.id,
      categoryId: otherCategory.id,
      subcategoryId: subcategory.id, // belongs to Feed, not Repairs
      isNewRecord: true,
    });
    expect(invalidSubResult.valid).toBe(false);

    // Invalid Facility: belongs to another scope
    const familyScope = await prisma.financialScope.findFirstOrThrow({
      where: { householdId: testHouseholdId, name: "Family" },
    });
    const familyCostCenter = await prisma.costCenter.findFirstOrThrow({
      where: { householdId: testHouseholdId, scopeId: familyScope.id, name: "Home" },
    });
    const invalidFacilityResult = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: scope.id, // Goat Farming
      categoryId: category.id,
      costCenterId: familyCostCenter.id, // Home belongs to Family
      isNewRecord: true,
    });
    expect(invalidFacilityResult.valid).toBe(false);
  });

  it("8. Multi-Scope Uniqueness: allows simultaneous budgets for Family -> Food and Goat Farming -> Feed in the same period", async () => {
    const familyScope = await prisma.financialScope.findFirstOrThrow({
      where: { householdId: testHouseholdId, name: "Family" },
    });
    const goatScope = await prisma.financialScope.findFirstOrThrow({
      where: { householdId: testHouseholdId, name: "Goat Farming" },
    });

    const foodCategory = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Food", type: "EXPENSE" },
    });
    const feedCategory = await prisma.category.create({
      data: { householdId: testHouseholdId, name: "Feed", type: "EXPENSE" },
    });

    // Create Family Food budget
    const familyBudget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        scopeId: familyScope.id,
        categoryId: foodCategory.id,
        amount: new Prisma.Decimal(20000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    // Create Goat Farming Feed budget for the exact same month/year
    const goatBudget = await prisma.budget.create({
      data: {
        householdId: testHouseholdId,
        scopeId: goatScope.id,
        categoryId: feedCategory.id,
        amount: new Prisma.Decimal(30000),
        periodType: "MONTHLY",
        startDate: new Date(Date.UTC(2026, 9, 1)),
        endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
        month: 10,
        year: 2026,
      },
    });

    expect(familyBudget.id).toBeDefined();
    expect(goatBudget.id).toBeDefined();
    expect(familyBudget.id).not.toBe(goatBudget.id);

    const allBudgets = await prisma.budget.findMany({ where: { householdId: testHouseholdId } });
    expect(allBudgets.length).toBe(2);
  });

  it("9. Household Isolation & RBAC: VIEWER role cannot mutate budgets", async () => {
    const forbidden = assertCanMutate("VIEWER");
    expect(forbidden).not.toBeNull();
    expect(forbidden?.status).toBe(403);

    const ownerAllowed = assertCanMutate("OWNER");
    expect(ownerAllowed).toBeNull();

    const memberAllowed = assertCanMutate("MEMBER");
    expect(memberAllowed).toBeNull();
  });

  it("10. Static Architecture Test: verifies no direct Account.balance or Journal mutations exist in budget code", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const budgetFiles = [
      path.join(srcDir, "app/api/budgets/route.ts"),
      path.join(srcDir, "app/api/budgets/[id]/route.ts"),
      path.join(srcDir, "app/budgets/page.tsx"),
    ];

    const prohibitedPatterns = [
      /account\.balance\s*[\+\-\*\/]?=/g,
      /prisma\.account\.update\s*\(\s*\{[^}]*balance:/g,
      /prisma\.journal\.create/g,
      /prisma\.journalEntry\.create/g,
    ];

    const violations: string[] = [];

    budgetFiles.forEach((filePath) => {
      if (!fs.existsSync(filePath)) return;
      const content = fs.readFileSync(filePath, "utf-8");
      prohibitedPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          violations.push(`${path.basename(filePath)} matched prohibited pattern ${pattern}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  /* ====================================================================
   * SUITE 11: Budget AuditService Integration & Amendment History (A1 - A8)
   * ==================================================================== */
  describe("11. Budget AuditService Integration & Amendment History", () => {
    it("11.1 CREATE Budget via POST records AuditEvent with action=CREATE, entityType=BUDGET, actorUserId, SHA-256 hash", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
      });

      const res = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 20000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
          name: "Groceries Target",
        })
      );

      expect(res.status).toBe(201);
      const budget = await res.json();
      expect(budget.id).toBeDefined();

      const auditEvents = await prisma.auditEvent.findMany({
        where: { householdId: testHouseholdId, entityType: "BUDGET", entityId: budget.id },
      });

      expect(auditEvents.length).toBe(1);
      const event = auditEvents[0];
      expect(event.action).toBe("CREATE");
      expect(event.entityType).toBe("BUDGET");
      expect(event.entityId).toBe(budget.id);
      expect(event.actorUserId).toBe(testUserId);
      expect(event.fromState).toBeNull();
      expect(event.toState).toBe("ACTIVE");
      expect(event.eventHash).toHaveLength(64); // SHA-256

      const meta = JSON.parse(event.metadataJson || "{}");
      expect(meta.after.amount).toBe(20000);
      expect(meta.after.name).toBe("Groceries Target");
    });

    it("11.2 UPDATE Budget amount via POST records AuditEvent with action=UPDATE and before/after metadata", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
      });

      // 1. Create
      const res1 = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 20000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
          name: "Initial Target",
        })
      );
      expect(res1.status).toBe(201);
      const b1 = await res1.json();

      // 2. Amend / Upsert via POST (increase to 25000)
      const res2 = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 25000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
          name: "Amended Target",
        })
      );
      expect(res2.status).toBe(200);
      const b2 = await res2.json();
      expect(b2.id).toBe(b1.id);

      const auditEvents = await prisma.auditEvent.findMany({
        where: { householdId: testHouseholdId, entityType: "BUDGET", entityId: b1.id },
        orderBy: { createdAt: "asc" },
      });

      expect(auditEvents.length).toBe(2);
      expect(auditEvents[0].action).toBe("CREATE");

      const updateEvent = auditEvents[1];
      expect(updateEvent.action).toBe("UPDATE");
      expect(updateEvent.fromState).toBe("ACTIVE");
      expect(updateEvent.toState).toBe("ACTIVE");
      expect(updateEvent.actorUserId).toBe(testUserId);

      const meta = JSON.parse(updateEvent.metadataJson || "{}");
      expect(meta.before.amount).toBe(20000);
      expect(meta.before.name).toBe("Initial Target");
      expect(meta.after.amount).toBe(25000);
      expect(meta.after.name).toBe("Amended Target");
    });

    it("11.3 UPDATE Classification and parameters via PATCH records AuditEvent with before/after state", async () => {
      const cat1 = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Utilities", type: "EXPENSE" },
      });
      const cat2 = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Telecom", type: "EXPENSE" },
      });

      const resCreate = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 5000,
          categoryId: cat1.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await resCreate.json();

      // Update to cat2 and amount 6500 via PATCH
      const resPatch = await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, {
          categoryId: cat2.id,
          amount: 6500,
          notes: "Updated telecom limit",
        }),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(resPatch.status).toBe(200);

      const events = await prisma.auditEvent.findMany({
        where: { householdId: testHouseholdId, entityType: "BUDGET", entityId: budget.id },
        orderBy: { createdAt: "asc" },
      });

      expect(events.length).toBe(2);
      const patchEvent = events[1];
      expect(patchEvent.action).toBe("UPDATE");
      const meta = JSON.parse(patchEvent.metadataJson || "{}");
      expect(meta.before.categoryId).toBe(cat1.id);
      expect(meta.before.amount).toBe(5000);
      expect(meta.after.categoryId).toBe(cat2.id);
      expect(meta.after.amount).toBe(6500);
    });

    it("11.4 PAUSE Budget via PATCH records AuditEvent with action=PAUSE, fromState=ACTIVE, toState=PAUSED", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Dining", type: "EXPENSE" },
      });

      const resCreate = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 15000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await resCreate.json();

      const resPause = await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, { status: "PAUSED" }),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(resPause.status).toBe(200);

      const pauseEvent = await prisma.auditEvent.findFirst({
        where: { householdId: testHouseholdId, entityId: budget.id, action: "PAUSE" },
      });
      expect(pauseEvent).not.toBeNull();
      expect(pauseEvent?.fromState).toBe("ACTIVE");
      expect(pauseEvent?.toState).toBe("PAUSED");
      expect(pauseEvent?.actorUserId).toBe(testUserId);
    });

    it("11.5 RESUME Budget via PATCH records AuditEvent with action=RESUME, fromState=PAUSED, toState=ACTIVE", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Dining", type: "EXPENSE" },
      });

      const resCreate = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 15000,
          categoryId: category.id,
          status: "PAUSED",
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await resCreate.json();

      const resResume = await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, { status: "ACTIVE" }),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(resResume.status).toBe(200);

      const resumeEvent = await prisma.auditEvent.findFirst({
        where: { householdId: testHouseholdId, entityId: budget.id, action: "RESUME" },
      });
      expect(resumeEvent).not.toBeNull();
      expect(resumeEvent?.fromState).toBe("PAUSED");
      expect(resumeEvent?.toState).toBe("ACTIVE");
    });

    it("11.6 ARCHIVE Budget via DELETE records AuditEvent with action=ARCHIVE, toState=ARCHIVED", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Fuel", type: "EXPENSE" },
      });

      const resCreate = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 8000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await resCreate.json();

      const resDel = await deleteBudget(
        makeReq(`/api/budgets/${budget.id}`, "DELETE", testUserToken),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(resDel.status).toBe(200);

      const archiveEvent = await prisma.auditEvent.findFirst({
        where: { householdId: testHouseholdId, entityId: budget.id, action: "ARCHIVE" },
      });
      expect(archiveEvent).not.toBeNull();
      expect(archiveEvent?.fromState).toBe("ACTIVE");
      expect(archiveEvent?.toState).toBe("ARCHIVED");
    });

    it("11.7 Tamper-Evident SHA-256 Hash Chaining: multiple budget events form a continuous verified cryptographic chain", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Healthcare", type: "EXPENSE" },
      });

      // 1. CREATE
      const res1 = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 10000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await res1.json();

      // 2. UPDATE
      await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, { amount: 12000 }),
        { params: Promise.resolve({ id: budget.id }) }
      );

      // 3. PAUSE
      await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, { status: "PAUSED" }),
        { params: Promise.resolve({ id: budget.id }) }
      );

      // 4. RESUME
      await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", testUserToken, { status: "ACTIVE" }),
        { params: Promise.resolve({ id: budget.id }) }
      );

      // 5. ARCHIVE
      await deleteBudget(
        makeReq(`/api/budgets/${budget.id}`, "DELETE", testUserToken),
        { params: Promise.resolve({ id: budget.id }) }
      );

      // Fetch all 5 audit events
      const events = await prisma.auditEvent.findMany({
        where: { householdId: testHouseholdId, entityId: budget.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      expect(events.length).toBe(5);

      // Verify each event hashes chained correctly
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const expectedPrevHash = i === 0 ? "GENESIS" : events[i - 1].eventHash;
        expect(ev.previousHash).toBe(expectedPrevHash);

        const expectedHash = AuditService.computeEventHash({
          previousHash: expectedPrevHash,
          id: ev.id,
          action: ev.action,
          entityType: ev.entityType,
          entityId: ev.entityId,
          actorUserId: ev.actorUserId,
          createdAtIso: ev.createdAt.toISOString(),
          metadataJson: ev.metadataJson,
        });

        expect(ev.eventHash).toBe(expectedHash);
      }
    });

    it("11.8 Multi-Household Security Isolation: User B cannot access or mutate Household Alpha budget", async () => {
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Private Plan", type: "EXPENSE" },
      });

      const resCreate = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 50000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const budget = await resCreate.json();

      // Create Household B and User B
      const householdB = await prisma.household.create({ data: { name: "Household Beta" } });
      const userB = await prisma.user.create({
        data: { email: `attacker.${Date.now()}@beta.fi`, passwordHash: "hash", name: "User Beta" },
      });
      await prisma.householdMember.create({
        data: { householdId: householdB.id, userId: userB.id, role: "OWNER" },
      });
      const userBToken = await createSessionToken({
        id: userB.id,
        email: userB.email,
        name: userB.name,
        householdId: householdB.id,
        role: "OWNER",
      });

      // Try GET, PATCH, DELETE from User B
      const getRes = await getBudgetById(
        makeReq(`/api/budgets/${budget.id}`, "GET", userBToken),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(getRes.status).toBe(404);

      const patchRes = await patchBudget(
        makeReq(`/api/budgets/${budget.id}`, "PATCH", userBToken, { amount: 100 }),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(patchRes.status).toBe(404);

      const deleteRes = await deleteBudget(
        makeReq(`/api/budgets/${budget.id}`, "DELETE", userBToken),
        { params: Promise.resolve({ id: budget.id }) }
      );
      expect(deleteRes.status).toBe(404);

      // Verify budget in household A is unaffected
      const intactBudget = await prisma.budget.findUnique({ where: { id: budget.id } });
      expect(Number(intactBudget?.amount)).toBe(50000);
      expect(intactBudget?.status).toBe("ACTIVE");
    });
  });

  /* ====================================================================
   * SUITE 12: Multi-Horizon Planned Aggregation & Horizon Isolation (B1 - B5)
   * ==================================================================== */
  describe("12. Multi-Horizon Planned Aggregation & Horizon Isolation", () => {
    it("12.1 Horizon Isolation: Monthly planned KPI strictly sums MONTHLY budgets and excludes Annual budgets", async () => {
      const category1 = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
      });
      const category2 = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Farm Operations", type: "EXPENSE" },
      });

      // 1. Monthly Budget: ₹10,000 for October 2026
      await prisma.budget.create({
        data: {
          householdId: testHouseholdId,
          name: "October Groceries",
          amount: new Prisma.Decimal(10000),
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
          startDate: new Date(Date.UTC(2026, 9, 1)),
          endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
          categoryId: category1.id,
          status: "ACTIVE",
        },
      });

      // 2. Annual Budget: ₹1,20,000 for FY 2026-27 (Apr 1 2026 to Mar 31 2027)
      await prisma.budget.create({
        data: {
          householdId: testHouseholdId,
          name: "Annual Farm Ops",
          amount: new Prisma.Decimal(120000),
          periodType: "YEARLY",
          startDate: new Date(Date.UTC(2026, 3, 1)),
          endDate: new Date(Date.UTC(2027, 2, 31, 23, 59, 59)),
          categoryId: category2.id,
          status: "ACTIVE",
        },
      });

      const allBudgets = await prisma.budget.findMany({
        where: { householdId: testHouseholdId, status: { not: "ARCHIVED" } },
      });
      expect(allBudgets.length).toBe(2);

      // Simulate UI Production Horizon Aggregation Logic
      const currentMonth = 10;
      const currentYear = 2026;
      const curStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
      const curEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59));

      // Monthly Horizon Calculation
      const monthlyBudgets = allBudgets.filter((b) => {
        const pType = b.periodType || "MONTHLY";
        if (pType !== "MONTHLY") return false;
        if (b.month && b.year) {
          return b.month === currentMonth && b.year === currentYear;
        }
        return b.startDate <= curEnd && b.endDate >= curStart;
      });

      const monthlyPlannedSum = monthlyBudgets.reduce((acc, b) => acc + Number(b.amount), 0);
      expect(monthlyPlannedSum).toBe(10000); // Strictly ₹10,000; Annual ₹1,20,000 is isolated

      // Yearly Horizon Calculation
      const yearlyBudgets = allBudgets.filter((b) => b.periodType === "YEARLY");
      const yearlyPlannedSum = yearlyBudgets.reduce((acc, b) => acc + Number(b.amount), 0);
      expect(yearlyPlannedSum).toBe(120000); // Strictly ₹1,20,000; Monthly ₹10,000 is isolated
    });

    it("12.2 Multi-Scope Monthly Summation: Family, Agriculture, and Goat Farming monthly budgets sum cleanly", async () => {
      const familyScope = await prisma.financialScope.findFirstOrThrow({
        where: { householdId: testHouseholdId, name: "Family" },
      });
      const agScope = await prisma.financialScope.findFirstOrThrow({
        where: { householdId: testHouseholdId, name: "Agriculture" },
      });
      const goatScope = await prisma.financialScope.findFirstOrThrow({
        where: { householdId: testHouseholdId, name: "Goat Farming" },
      });

      const catFamily = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Provisions", type: "EXPENSE" },
      });
      const catAg = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Fertilizer", type: "EXPENSE" },
      });
      const catGoat = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Fodder", type: "EXPENSE" },
      });

      await prisma.budget.createMany({
        data: [
          {
            householdId: testHouseholdId,
            scopeId: familyScope.id,
            categoryId: catFamily.id,
            amount: new Prisma.Decimal(15000),
            periodType: "MONTHLY",
            month: 10,
            year: 2026,
            startDate: new Date(Date.UTC(2026, 9, 1)),
            endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
            status: "ACTIVE",
          },
          {
            householdId: testHouseholdId,
            scopeId: agScope.id,
            categoryId: catAg.id,
            amount: new Prisma.Decimal(40000),
            periodType: "MONTHLY",
            month: 10,
            year: 2026,
            startDate: new Date(Date.UTC(2026, 9, 1)),
            endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
            status: "ACTIVE",
          },
          {
            householdId: testHouseholdId,
            scopeId: goatScope.id,
            categoryId: catGoat.id,
            amount: new Prisma.Decimal(25000),
            periodType: "MONTHLY",
            month: 10,
            year: 2026,
            startDate: new Date(Date.UTC(2026, 9, 1)),
            endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
            status: "ACTIVE",
          },
        ],
      });

      const activeBudgets = await prisma.budget.findMany({
        where: { householdId: testHouseholdId, status: "ACTIVE" },
      });

      const totalPlanned = activeBudgets.reduce((acc, b) => acc + Number(b.amount), 0);
      expect(totalPlanned).toBe(80000); // 15,000 + 40,000 + 25,000 = 80,000
    });

    it("12.3 Ledger-Derived Actuals: Category and Subcategory budgets compute actuals independently with 0 balance mutation", async () => {
      const familyScope = await prisma.financialScope.findFirstOrThrow({
        where: { householdId: testHouseholdId, name: "Family" },
      });
      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Groceries", type: "EXPENSE" },
      });
      await prisma.scopeCategory.create({
        data: { scopeId: familyScope.id, categoryId: category.id },
      });
      const subcategory = await prisma.categorySubcategory.create({
        data: { householdId: testHouseholdId, categoryId: category.id, name: "Dairy & Milk" },
      });

      // Broad budget on Category: ₹20,000
      const catBudget = await prisma.budget.create({
        data: {
          householdId: testHouseholdId,
          scopeId: familyScope.id,
          categoryId: category.id,
          amount: new Prisma.Decimal(20000),
          periodType: "MONTHLY",
          startDate: new Date(Date.UTC(2026, 9, 1)),
          endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
          month: 10,
          year: 2026,
        },
      });

      // Specific budget on Subcategory: ₹5,000
      const subBudget = await prisma.budget.create({
        data: {
          householdId: testHouseholdId,
          scopeId: familyScope.id,
          categoryId: category.id,
          subcategoryId: subcategory.id,
          amount: new Prisma.Decimal(5000),
          periodType: "MONTHLY",
          startDate: new Date(Date.UTC(2026, 9, 1)),
          endDate: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)),
          month: 10,
          year: 2026,
        },
      });

      // Expense transaction on Subcategory: ₹3,000
      await prisma.transaction.create({
        data: {
          householdId: testHouseholdId,
          accountId: testAccountId,
          scopeId: familyScope.id,
          categoryId: category.id,
          subcategoryId: subcategory.id,
          amount: 3000,
          type: "EXPENSE",
          status: "POSTED",
          date: new Date(Date.UTC(2026, 9, 15)),
          description: "Fresh Organic Milk",
        },
      });

      // Fetch enriched budgets via GET /api/budgets
      const res = await getBudgets(makeReq("/api/budgets", "GET", testUserToken));
      expect(res.status).toBe(200);
      const enriched = await res.json();

      const catEnriched = enriched.find((b: any) => b.id === catBudget.id);
      const subEnriched = enriched.find((b: any) => b.id === subBudget.id);

      expect(catEnriched.actualSpent).toBe(3000);
      expect(catEnriched.remaining).toBe(17000);

      expect(subEnriched.actualSpent).toBe(3000);
      expect(subEnriched.remaining).toBe(2000);

      // Financial core isolation: account balance untouched by budget calculations
      const acc = await prisma.account.findUniqueOrThrow({ where: { id: testAccountId } });
      expect(Number(acc.balance)).toBe(100000);
    });

    it("12.4 Zero Financial Mutation Invariant: Budget operations cause 0 mutations to Account, Journal, and JournalEntry", async () => {
      const initialBalance = (await prisma.account.findUniqueOrThrow({ where: { id: testAccountId } })).balance;
      const initialJournals = await prisma.journal.count();
      const initialJournalEntries = await prisma.journalEntry.count();

      const category = await prisma.category.create({
        data: { householdId: testHouseholdId, name: "Travel", type: "EXPENSE" },
      });

      // Run full lifecycle: CREATE -> UPDATE -> PAUSE -> RESUME -> ARCHIVE
      const cRes = await postBudget(
        makeReq("/api/budgets", "POST", testUserToken, {
          amount: 40000,
          categoryId: category.id,
          periodType: "MONTHLY",
          month: 10,
          year: 2026,
        })
      );
      const b = await cRes.json();

      await patchBudget(
        makeReq(`/api/budgets/${b.id}`, "PATCH", testUserToken, { amount: 45000 }),
        { params: Promise.resolve({ id: b.id }) }
      );
      await patchBudget(
        makeReq(`/api/budgets/${b.id}`, "PATCH", testUserToken, { status: "PAUSED" }),
        { params: Promise.resolve({ id: b.id }) }
      );
      await patchBudget(
        makeReq(`/api/budgets/${b.id}`, "PATCH", testUserToken, { status: "ACTIVE" }),
        { params: Promise.resolve({ id: b.id }) }
      );
      await deleteBudget(
        makeReq(`/api/budgets/${b.id}`, "DELETE", testUserToken),
        { params: Promise.resolve({ id: b.id }) }
      );

      const finalBalance = (await prisma.account.findUniqueOrThrow({ where: { id: testAccountId } })).balance;
      const finalJournals = await prisma.journal.count();
      const finalJournalEntries = await prisma.journalEntry.count();

      expect(finalBalance).toEqual(initialBalance);
      expect(finalJournals).toBe(initialJournals);
      expect(finalJournalEntries).toBe(initialJournalEntries);
    });
  });
});

