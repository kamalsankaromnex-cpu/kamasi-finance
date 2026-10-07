import { describe, it, expect } from "vitest";
import {
  transactionSchema,
  accountSchema,
  budgetSchema,
  billSchema,
  goalSchema,
  positiveAmountSchema,
} from "../validation-schemas";

describe("Global Entry Validation & Financial Business Rules Suite", () => {
  it("VALIDATES POSITIVE AMOUNT SCHEMA: rejects zero, negative numbers, and non-numeric strings", () => {
    expect(positiveAmountSchema.safeParse(100).success).toBe(true);
    expect(positiveAmountSchema.safeParse("1500.50").success).toBe(true);

    expect(positiveAmountSchema.safeParse(0).success).toBe(false);
    expect(positiveAmountSchema.safeParse(-50).success).toBe(false);
    expect(positiveAmountSchema.safeParse("invalid").success).toBe(false);
  });

  it("VALIDATES TRANSACTION SCHEMA: enforces required fields, positive amount, and distinct transfer accounts", () => {
    // Valid Expense
    const validExpense = transactionSchema.safeParse({
      accountId: "acc-123",
      amount: 1500,
      type: "EXPENSE",
      description: "Grocery purchase",
    });
    expect(validExpense.success).toBe(true);

    // Valid Transfer
    const validTransfer = transactionSchema.safeParse({
      accountId: "acc-1",
      transferAccountId: "acc-2",
      amount: 5000,
      type: "TRANSFER",
      description: "Transfer to Savings",
    });
    expect(validTransfer.success).toBe(true);

    // Invalid Transfer (Same Source & Destination Account)
    const sameAccountTransfer = transactionSchema.safeParse({
      accountId: "acc-1",
      transferAccountId: "acc-1",
      amount: 5000,
      type: "TRANSFER",
      description: "Same account transfer attempt",
    });
    expect(sameAccountTransfer.success).toBe(false);
    if (!sameAccountTransfer.success) {
      expect(sameAccountTransfer.error.issues[0].message).toContain("distinct destination account");
    }
  });

  it("VALIDATES ACCOUNT SCHEMA: requires valid account type and non-negative credit limits for Credit Accounts", () => {
    const validBank = accountSchema.safeParse({
      name: "HDFC Checking",
      type: "BANK",
      balance: 10000,
    });
    expect(validBank.success).toBe(true);

    const validCredit = accountSchema.safeParse({
      name: "HDFC Credit Card",
      type: "CREDIT",
      balance: -5000,
      creditLimit: 50000,
    });
    expect(validCredit.success).toBe(true);

    // Invalid Credit Limit (Negative)
    const invalidCredit = accountSchema.safeParse({
      name: "HDFC Credit Card",
      type: "CREDIT",
      balance: -5000,
      creditLimit: -10000,
    });
    expect(invalidCredit.success).toBe(false);
  });

  it("VALIDATES BUDGET SCHEMA: enforces valid month range (1-12) and positive limit amount", () => {
    const validBudget = budgetSchema.safeParse({
      month: 9,
      year: 2026,
      amount: 10000,
      categoryId: "cat-123",
    });
    expect(validBudget.success).toBe(true);

    const invalidMonth = budgetSchema.safeParse({
      month: 13,
      year: 2026,
      amount: 10000,
      categoryId: "cat-123",
    });
    expect(invalidMonth.success).toBe(false);
  });

  it("VALIDATES RECURRING BILL SCHEMA: requires valid payment frequency and account ID", () => {
    const validBill = billSchema.safeParse({
      name: "Electricity Bill",
      amount: 3500,
      frequency: "MONTHLY",
      accountId: "acc-1",
    });
    expect(validBill.success).toBe(true);

    const missingAccount = billSchema.safeParse({
      name: "Electricity Bill",
      amount: 3500,
      frequency: "MONTHLY",
      accountId: "",
    });
    expect(missingAccount.success).toBe(false);
  });
});
