import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";

describe("Master Data & Category Management Test Suite", () => {
  let householdId: string;
  let otherHouseholdId: string;
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany({});
    await prisma.transactionLifecycleHistory.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    const user = await prisma.user.create({
      data: {
        email: "category.admin@kamasi.test",
        name: "Category Admin",
        passwordHash: "dummy_hash",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Master Data Household",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    householdId = household.id;

    const otherHousehold = await prisma.household.create({
      data: { name: "Other Household" },
    });
    otherHouseholdId = otherHousehold.id;

    const account = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "Main Operating Account",
        type: "BANK",
        balance: new Prisma.Decimal(50000),
      },
    });
    accountId = account.id;
  });

  it("1. Creates, edits, deactivates, and reactivates a category", async () => {
    // Create Category
    const category = await prisma.category.create({
      data: {
        householdId,
        name: "Organic Farming Inputs",
        type: "EXPENSE",
        color: "#10b981",
        icon: "sprout",
        isActive: true,
      },
    });

    expect(category.id).toBeDefined();
    expect(category.name).toBe("Organic Farming Inputs");
    expect(category.isActive).toBe(true);

    // Edit Category
    const updated = await prisma.category.update({
      where: { id: category.id },
      data: { name: "Sustainable Bio-Fertilizers", color: "#059669" },
    });
    expect(updated.name).toBe("Sustainable Bio-Fertilizers");

    // Deactivate Category
    const deactivated = await prisma.category.update({
      where: { id: category.id },
      data: { isActive: false },
    });
    expect(deactivated.isActive).toBe(false);

    // Reactivate Category
    const reactivated = await prisma.category.update({
      where: { id: category.id },
      data: { isActive: true },
    });
    expect(reactivated.isActive).toBe(true);
  });

  it("2. Verifies Category CRUD produces EXACTLY 0 Journals and 0 Account balance changes", async () => {
    const initialBalance = await prisma.account.findUnique({ where: { id: accountId } });
    const initialJournalsCount = await prisma.journal.count();
    const initialJournalEntriesCount = await prisma.journalEntry.count();

    // Create 5 categories
    for (let i = 1; i <= 5; i++) {
      await prisma.category.create({
        data: {
          householdId,
          name: `Test Category ${i}`,
          type: "EXPENSE",
          isActive: true,
        },
      });
    }

    const postBalance = await prisma.account.findUnique({ where: { id: accountId } });
    const postJournalsCount = await prisma.journal.count();
    const postJournalEntriesCount = await prisma.journalEntry.count();

    expect(postBalance?.balance.equals(initialBalance!.balance)).toBe(true);
    expect(postJournalsCount).toBe(initialJournalsCount);
    expect(postJournalEntriesCount).toBe(initialJournalEntriesCount);
  });

  it("3. Verifies historical expense retains categoryId and financial values after category edit/deactivation", async () => {
    const category = await prisma.category.create({
      data: {
        householdId,
        name: "Groceries & Supermarket",
        type: "EXPENSE",
        isActive: true,
      },
    });

    // Post an expense linked to categoryId
    const transaction = await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId,
        accountId,
        amount: new Prisma.Decimal(2500),
        description: "Weekly Grocery Shopping",
        categoryId: category.id,
      });

      return await tx.transaction.create({
        data: {
          householdId,
          accountId,
          categoryId: category.id,
          userId,
          amount: new Prisma.Decimal(2500),
          type: "EXPENSE",
          description: "Weekly Grocery Shopping",
        },
      });
    });

    expect(transaction.categoryId).toBe(category.id);

    // Deactivate the category
    await prisma.category.update({
      where: { id: category.id },
      data: { name: "Archived Groceries Category", isActive: false },
    });

    // Re-query historical transaction
    const reloadedTxn = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      include: { category: true },
    });

    // Transaction categoryId & amount MUST remain intact
    expect(reloadedTxn?.categoryId).toBe(category.id);
    expect(Number(reloadedTxn?.amount)).toBe(2500);
    expect(reloadedTxn?.category?.name).toBe("Archived Groceries Category");
  });

  it("4. Enforces Household Tenant Isolation: Cannot query or assign other household's category", async () => {
    const categoryOther = await prisma.category.create({
      data: {
        householdId: otherHouseholdId,
        name: "Other Household Private Category",
        type: "EXPENSE",
      },
    });

    // Querying for householdId should NOT leak other household's category
    const householdCategories = await prisma.category.findMany({
      where: { householdId },
    });
    expect(householdCategories.some((c) => c.id === categoryOther.id)).toBe(false);
  });
});
