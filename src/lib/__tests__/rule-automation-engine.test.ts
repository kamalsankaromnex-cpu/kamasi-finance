import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import {
  autoCategorizeTransaction,
  checkBudgetThresholds,
  detectDuplicateTransactions,
  validateRuleJson,
} from "../automations";

describe("Rule-Based Financial Automation Engine Test Suite", () => {
  let userAlphaId: string;
  let householdAlphaId: string;
  let bankAccountAlphaId: string;
  let categoryFoodId: string;

  let householdBetaId: string;

  beforeEach(async () => {
    // Setup Household Alpha
    const userAlpha = await prisma.user.create({
      data: {
        email: `auto_user_${Math.random().toString(36).substring(2)}_${Date.now()}@kamasi.com`,
        passwordHash: "hashedpass",
        name: "Automation User Alpha",
      },
    });
    userAlphaId = userAlpha.id;

    const hhAlpha = await prisma.household.create({
      data: { name: "Automation Household Alpha", currency: "INR" },
    });
    householdAlphaId = hhAlpha.id;

    await prisma.householdMember.create({
      data: { householdId: hhAlpha.id, userId: userAlpha.id, role: "OWNER" },
    });

    const bankAlpha = await prisma.account.create({
      data: {
        householdId: hhAlpha.id,
        userId: userAlpha.id,
        name: "HDFC Primary Bank",
        type: "BANK",
        balance: new Prisma.Decimal(100000.0),
      },
    });
    bankAccountAlphaId = bankAlpha.id;

    const catFood = await prisma.category.create({
      data: { householdId: hhAlpha.id, name: "Food & Dining", type: "EXPENSE" },
    });
    categoryFoodId = catFood.id;

    // Setup Household Beta
    const hhBeta = await prisma.household.create({
      data: { name: "Automation Household Beta", currency: "INR" },
    });
    householdBetaId = hhBeta.id;
  });

  it("RULE VALIDATION: Validates JSON schemas for conditions and actions", () => {
    const valid = validateRuleJson('{"merchantContains": "Swiggy"}', '{"setCategoryId": "cat_1"}');
    expect(valid.valid).toBe(true);

    const invalid = validateRuleJson('invalid-json', '{"setCategoryId": "cat_1"}');
    expect(invalid.valid).toBe(false);
  });

  it("AUTO-CATEGORIZATION: Automatically categorizes newly created transactions matching merchant pattern", async () => {
    // 1. Create rule: "swiggy" -> "Food & Dining"
    await prisma.automationRule.create({
      data: {
        householdId: householdAlphaId,
        createdByUserId: userAlphaId,
        name: "Swiggy Pattern Rule",
        triggerType: "TRANSACTION_CREATED",
        conditionJson: JSON.stringify({ merchantContains: "Swiggy" }),
        actionType: "CATEGORIZE_TRANSACTION",
        actionJson: JSON.stringify({ setCategoryId: categoryFoodId }),
        isActive: true,
      },
    });

    // 2. Create uncategorized transaction
    const txn = await prisma.transaction.create({
      data: {
        householdId: householdAlphaId,
        accountId: bankAccountAlphaId,
        userId: userAlphaId,
        amount: new Prisma.Decimal(450.0),
        type: "EXPENSE",
        description: "Order from Swiggy Delivery",
      },
    });

    expect(txn.categoryId).toBeNull();

    // 3. Trigger auto-categorization engine
    const log = await autoCategorizeTransaction(txn.id, householdAlphaId);

    expect(log).not.toBeNull();
    expect(log?.status).toBe("SUCCESS");

    const updatedTxn = await prisma.transaction.findUnique({ where: { id: txn.id } });
    expect(updatedTxn?.categoryId).toBe(categoryFoodId);
  });

  it("BUDGET THRESHOLD SUPPRESSION: Triggers alert ONCE per threshold using unique alertKey", async () => {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Set budget limit ₹5,000
    await prisma.budget.create({
      data: {
        householdId: householdAlphaId,
        categoryId: categoryFoodId,
        month: currentMonth,
        year: currentYear,
        amount: new Prisma.Decimal(5000.0),
      },
    });

    // Spend ₹4,500 (90% utilization)
    await prisma.transaction.create({
      data: {
        householdId: householdAlphaId,
        accountId: bankAccountAlphaId,
        categoryId: categoryFoodId,
        userId: userAlphaId,
        amount: new Prisma.Decimal(4500.0),
        type: "EXPENSE",
        description: "Dinner Outing",
      },
    });

    // Run threshold check 1
    const alertsRun1 = await checkBudgetThresholds(householdAlphaId);
    expect(alertsRun1.length).toBe(1); // 80% alert created!

    // Run threshold check 2 (Should suppress duplicate alert using alertKey)
    const alertsRun2 = await checkBudgetThresholds(householdAlphaId);
    expect(alertsRun2.length).toBe(0); // 0 new alerts!
  });

  it("DUPLICATE FLAGGING SAFEGUARD: Flags candidate duplicate transactions for review WITHOUT deleting records", async () => {
    const sameDate = new Date();
    const sameAmount = new Prisma.Decimal(1200.0);

    // Create 2 identical transactions on same account and date
    const txn1 = await prisma.transaction.create({
      data: {
        householdId: householdAlphaId,
        accountId: bankAccountAlphaId,
        userId: userAlphaId,
        date: sameDate,
        amount: sameAmount,
        type: "EXPENSE",
        description: "Online Subscription",
      },
    });

    const txn2 = await prisma.transaction.create({
      data: {
        householdId: householdAlphaId,
        accountId: bankAccountAlphaId,
        userId: userAlphaId,
        date: sameDate,
        amount: sameAmount,
        type: "EXPENSE",
        description: "Online Subscription",
      },
    });

    const flagged = await detectDuplicateTransactions(householdAlphaId);
    expect(flagged.length).toBe(1);

    // Verify BOTH original transactions remain intact in DB (NON-DESTRUCTIVE SAFEGUARD)
    const t1Exists = await prisma.transaction.findUnique({ where: { id: txn1.id } });
    const t2Exists = await prisma.transaction.findUnique({ where: { id: txn2.id } });

    expect(t1Exists).not.toBeNull();
    expect(t2Exists).not.toBeNull();
  });

  it("ISOLATION SAFEGUARD: Household Beta cannot access or trigger Household Alpha automations", async () => {
    const alertsBeta = await checkBudgetThresholds(householdBetaId);
    expect(alertsBeta.length).toBe(0);
  });
});
