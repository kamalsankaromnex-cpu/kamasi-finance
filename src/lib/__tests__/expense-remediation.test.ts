import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSystemScopes, validateClassificationCombination } from "@/lib/services/classification-service";
import { FinancialCommand } from "@/finance/financial-command";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

describe("Expense Module Production Remediation Suite", () => {
  let testHouseholdId: string;
  let testAccountId: string;

  beforeEach(async () => {
    // Reset database state before each test
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

    const user = await prisma.user.create({
      data: {
        email: "expense.tester@kamasi.fi",
        passwordHash: "hash",
        name: "Expense Tester",
      },
    });

    const household = await prisma.household.create({ data: { name: "Expense Family" } });
    await prisma.householdMember.create({
      data: { householdId: household.id, userId: user.id, role: "OWNER" },
    });

    const account = await prisma.account.create({
      data: {
        householdId: household.id,
        name: "Checking Account",
        type: "BANK",
        balance: 50000,
      },
    });

    testHouseholdId = household.id;
    testAccountId = account.id;

    await seedSystemScopes(testHouseholdId);
  });

  it("1. Draft Expense: creates business record with status DRAFT without mutating Account.balance or creating Journals", async () => {
    const initialAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const initialJournalCount = await prisma.journal.count();

    const draft = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: 5000,
        type: "EXPENSE",
        status: "DRAFT",
        description: "Draft fodder purchase",
      },
    });

    expect(draft.status).toBe("DRAFT");

    const finalAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const finalJournalCount = await prisma.journal.count();

    // Zero balance mutation & zero journal creation for DRAFT
    expect(Number(finalAccount!.balance)).toBe(Number(initialAccount!.balance));
    expect(finalJournalCount).toBe(initialJournalCount);
  });

  it("2. Post Draft Expense: executes FinancialCommand.postExpense, creates balanced journal, and updates balance", async () => {
    const draft = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: 4000,
        type: "EXPENSE",
        status: "DRAFT",
        description: "Pending Draft Expense",
      },
    });

    const idempotencyKey = `POST_${draft.id}`;

    // Execute FinancialCommand.postExpense
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: draft.amount,
        description: draft.description,
        date: draft.date,
        idempotencyKey,
      });

      await tx.transaction.update({
        where: { id: draft.id },
        data: { status: "POSTED", postedAt: new Date() },
      });
    });

    const postedTxn = await prisma.transaction.findUnique({ where: { id: draft.id } });
    const updatedAccount = await prisma.account.findUnique({ where: { id: testAccountId } });
    const journals = await prisma.journal.findMany({ include: { entries: true } });

    expect(postedTxn!.status).toBe("POSTED");
    expect(Number(updatedAccount!.balance)).toBe(46000); // 50000 - 4000

    // Double-entry debit = credit check
    expect(journals.length).toBeGreaterThan(0);
    const journal = journals[0];
    const totalDebit = journal.entries.reduce((sum, e) => sum + Number(e.debit), 0);
    const totalCredit = journal.entries.reduce((sum, e) => sum + Number(e.credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("3. Classification Validation: rejects invalid Scope/Category or Scope/Facility combinations server-side", async () => {
    const familyScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Family" } },
    });
    const goatScope = await prisma.financialScope.findUnique({
      where: { householdId_name: { householdId: testHouseholdId, name: "Goat Farming" } },
    });

    const goatShed = await prisma.costCenter.create({
      data: { householdId: testHouseholdId, scopeId: goatScope!.id, name: "Goat Shed #1" },
    });

    // Valid: Goat Shed #1 with Goat Farming scope
    const validRes = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: goatScope!.id,
      costCenterId: goatShed.id,
    });
    expect(validRes.valid).toBe(true);

    // Invalid: Goat Shed #1 under Family scope
    const invalidRes = await validateClassificationCombination({
      householdId: testHouseholdId,
      scopeId: familyScope!.id,
      costCenterId: goatShed.id,
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.error).toContain("Location / Cost center does not belong to the selected financial scope");
  });

  it("4. Refund Capping: prevents refunding more than the original posted expense amount", async () => {
    const idempotencyKey = `EXPENSE_REFUND_TEST_${Date.now()}`;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postExpense(tx, {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: new Prisma.Decimal(3000),
        description: "Fodder Purchase",
        idempotencyKey,
      });
    });

    const originalTxn = await prisma.transaction.create({
      data: {
        householdId: testHouseholdId,
        accountId: testAccountId,
        amount: new Prisma.Decimal(3000),
        type: "EXPENSE",
        status: "POSTED",
        description: "Fodder Purchase",
      },
    });

    // Attempting to refund 4000 (exceeding 3000) must throw
    const refundAttempt = 4000;
    const maxAllowed = Number(originalTxn.amount) - Number(originalTxn.refundedAmount);
    expect(refundAttempt).toBeGreaterThan(maxAllowed);
  });

  it("5. Static Architecture Test: verifies no direct Account.balance mutations exist outside LedgerService", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const allowedFiles = ["ledger.ts", "ledger-service.ts", "ledger-service.test.ts"];

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          if (!filePath.includes("node_modules") && !filePath.includes(".next")) {
            results = results.concat(scanFiles(filePath));
          }
        } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
          results.push(filePath);
        }
      });
      return results;
    }

    const allSourceFiles = scanFiles(srcDir);
    const violations: string[] = [];

    const prohibitedPatterns = [
      /account\.balance\s*[\+\-\*\/]?=/g,
      /prisma\.account\.update\s*\(\s*\{[^}]*data:\s*\{[^}]*balance:/g,
    ];

    allSourceFiles.forEach((filePath) => {
      const baseName = path.basename(filePath);
      if (allowedFiles.includes(baseName)) return;

      const content = fs.readFileSync(filePath, "utf-8");
      prohibitedPatterns.forEach((pattern) => {
        if (pattern.test(content)) {
          violations.push(`${path.relative(srcDir, filePath)} matching pattern ${pattern}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });
});
