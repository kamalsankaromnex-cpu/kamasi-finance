import { describe, it, expect } from "vitest";
import {
  TransactionLifecycle,
  IncomeLifecycle,
  ExpenseLifecycle,
  GoalLifecycle,
} from "@/finance/lifecycle";

describe("Phase 2.0 Central Lifecycle Engine State Machines & Invariants", () => {
  describe("TransactionLifecycle", () => {
    it("allows editing and posting only in DRAFT status", () => {
      expect(TransactionLifecycle.canEdit("DRAFT")).toBe(true);
      expect(TransactionLifecycle.canEdit("POSTED")).toBe(false);
      expect(TransactionLifecycle.canEdit("RECONCILED")).toBe(false);

      expect(TransactionLifecycle.canPost("DRAFT")).toBe(true);
      expect(TransactionLifecycle.canPost("POSTED")).toBe(false);
    });

    it("allows reversal only in POSTED or RECONCILED status", () => {
      expect(TransactionLifecycle.canReverse("POSTED")).toBe(true);
      expect(TransactionLifecycle.canReverse("RECONCILED")).toBe(true);
      expect(TransactionLifecycle.canReverse("REVERSED")).toBe(false);
      expect(TransactionLifecycle.canReverse("DRAFT")).toBe(false);
    });

    it("enforces transition matrix rules and throws on invalid transitions", () => {
      expect(() => TransactionLifecycle.assertCanTransition("POSTED", "RECONCILED", "reconcile")).not.toThrow();
      expect(() => TransactionLifecycle.assertCanTransition("POSTED", "REVERSED", "reverse")).not.toThrow();
      expect(() => TransactionLifecycle.assertCanTransition("POSTED", "DRAFT", "edit")).toThrow();
      expect(() => TransactionLifecycle.assertCanTransition("REVERSED", "POSTED", "repost")).toThrow();
    });
  });

  describe("IncomeLifecycle", () => {
    it("allows crediting only when status is CONFIRMED", () => {
      expect(IncomeLifecycle.canCredit("CONFIRMED")).toBe(true);
      expect(IncomeLifecycle.canCredit("EXPECTED")).toBe(false);
      expect(IncomeLifecycle.canCredit("CREDITED")).toBe(false);

      expect(() => IncomeLifecycle.assertCanTransition("CONFIRMED", "CREDITED", "credit")).not.toThrow();
      expect(() => IncomeLifecycle.assertCanTransition("EXPECTED", "CREDITED", "credit")).toThrow("Income must be CONFIRMED");
    });
  });

  describe("ExpenseLifecycle", () => {
    it("allows refund and reversal only on POSTED or PARTIALLY_REFUNDED expenses", () => {
      expect(ExpenseLifecycle.canRefund("POSTED")).toBe(true);
      expect(ExpenseLifecycle.canRefund("PARTIALLY_REFUNDED")).toBe(true);
      expect(ExpenseLifecycle.canRefund("REFUNDED")).toBe(false);

      expect(ExpenseLifecycle.canReverse("POSTED")).toBe(true);
      expect(ExpenseLifecycle.canReverse("REVERSED")).toBe(false);
    });
  });

  describe("GoalLifecycle", () => {
    it("disallows contributions and withdrawals for PAUSED, COMPLETED, or ARCHIVED goals", () => {
      expect(GoalLifecycle.canContribute("ACTIVE")).toBe(true);
      expect(GoalLifecycle.canContribute("PAUSED")).toBe(false);
      expect(GoalLifecycle.canContribute("COMPLETED")).toBe(false);
      expect(GoalLifecycle.canContribute("ARCHIVED")).toBe(false);

      expect(GoalLifecycle.canWithdraw("ACTIVE")).toBe(true);
      expect(GoalLifecycle.canWithdraw("PAUSED")).toBe(false);
      expect(GoalLifecycle.canWithdraw("ARCHIVED")).toBe(false);
    });
  });
});
