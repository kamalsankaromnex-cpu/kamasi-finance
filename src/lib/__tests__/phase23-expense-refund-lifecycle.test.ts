import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { ExpenseDomainService } from "@/modules/expenses/expense.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { Prisma } from "@prisma/client";

describe("Phase 2.3 Expense & Refund Lifecycle Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;

  let householdBId: string;
  let userBId: string;
  let accountBId: string;

  beforeEach(async () => {
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p23-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Bank A", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountAId = accA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p23-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "ICICI Bank B", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountBId = accB.id;

    // Opening Balance for Account A: ₹50,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000),
      });
    });
  });

  afterEach(async () => {
    const resA = await ReconciliationService.reconcileHousehold(householdAId);
    for (const r of resA) expect(r.status).toBe("MATCH");
  });

  describe("1. Expense Lifecycle Operations", () => {
    it("creates draft expense without changing balance", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          description: "Office Supplies Draft",
        });
      });

      expect(draft.status).toBe("DRAFT");
      expect(draft.journalId).toBeNull();

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(50000);
    });

    it("edits draft expense while status === DRAFT", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          description: "Initial Draft",
        });
      });

      const updated = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.updateDraft(tx, {
          expenseId: draft.id,
          householdId: householdAId,
          userId: userAId,
          data: { amount: new Prisma.Decimal(7500), description: "Updated Draft" },
        });
      });

      expect(updated.amount.toNumber()).toBe(7500);
      expect(updated.description).toBe("Updated Draft");
    });

    it("posts draft expense: creates 1 Journal, decreases balance once", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
          description: "Laptop Monitor",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
      });

      expect(posted.status).toBe("POSTED");
      expect(posted.journalId).toBeTruthy();

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(40000); // 50,000 - 10,000 = 40,000
    });

    it("prohibits editing a posted expense directly", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
          description: "Laptop Monitor",
        });
      });
      const posted = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await ExpenseDomainService.updateDraft(tx, {
            expenseId: posted.id,
            householdId: householdAId,
            userId: userAId,
            data: { amount: new Prisma.Decimal(12000) },
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });
  });

  describe("2. Refund Lifecycle Operations & Ledger Invariants", () => {
    it("rejects refunding a DRAFT expense before posting", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          description: "Draft Expense",
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await ExpenseDomainService.refundExpense(tx, {
            expenseId: draft.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(2000),
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });

    it("runs complete refund scenario: Expense ₹10,000 (bal ₹40k) -> Refund ₹4,000 (bal ₹44k) -> Refund ₹6,000 (bal ₹50k, REFUNDED)", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
          description: "Flight Ticket",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
      });

      const origJournalId = posted.journalId!;
      let bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(40000);

      // Refund 1: ₹4,000
      const refKey1 = `ref-1-${Date.now()}`;
      const refund1Tx = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.refundExpense(tx, {
          expenseId: posted.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(4000),
          description: "Partial Flight Refund 1",
          idempotencyKey: refKey1,
        });
      });

      bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(44000);

      let updatedExpense = await prisma.transaction.findUniqueOrThrow({ where: { id: posted.id } });
      expect(updatedExpense.status).toBe("PARTIALLY_REFUNDED");
      expect(updatedExpense.refundedAmount.toNumber()).toBe(4000);

      // Duplicate refund idempotency check
      const duplicateRefund = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.refundExpense(tx, {
          expenseId: posted.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(4000),
          description: "Duplicate Refund Attempt",
          idempotencyKey: refKey1,
        });
      });
      expect(duplicateRefund.id).toBe(refund1Tx.id);

      // Over-refund attempt (exceeds remaining ₹6,000) rejected with REFUND_EXCEEDS_MAX
      await expect(
        prisma.$transaction(async (tx) => {
          await ExpenseDomainService.refundExpense(tx, {
            expenseId: posted.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(7000),
          });
        })
      ).rejects.toThrow("REFUND_EXCEEDS_MAX");

      // Refund 2: ₹6,000 (Reaches full refund)
      const refKey2 = `ref-2-${Date.now()}`;
      const refund2Tx = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.refundExpense(tx, {
          expenseId: posted.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(6000),
          description: "Full Flight Refund 2",
          idempotencyKey: refKey2,
        });
      });

      bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(50000); // Fully restored to ₹50,000

      updatedExpense = await prisma.transaction.findUniqueOrThrow({ where: { id: posted.id } });
      expect(updatedExpense.status).toBe("REFUNDED");
      expect(updatedExpense.refundedAmount.toNumber()).toBe(10000);

      // Refund attempt when status is REFUNDED rejected with INVALID_TRANSITION
      await expect(
        prisma.$transaction(async (tx) => {
          await ExpenseDomainService.refundExpense(tx, {
            expenseId: posted.id,
            householdId: householdAId,
            userId: userAId,
            amount: new Prisma.Decimal(1),
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");

      // Verify Original Journal remains 100% UNTOUCHED
      const origJournal = await prisma.journal.findUniqueOrThrow({ where: { id: origJournalId } });
      expect(origJournal.status).toBe("POSTED");

      // Verify Refund Journals are distinct
      expect(refund1Tx.journalId).toBeTruthy();
      expect(refund2Tx.journalId).toBeTruthy();
      expect(refund1Tx.journalId).not.toBe(origJournalId);
      expect(refund2Tx.journalId).not.toBe(origJournalId);
      expect(refund1Tx.journalId).not.toBe(refund2Tx.journalId);

      // Verify double-entry balance across all posted journals
      const journals = await prisma.journal.findMany({ include: { entries: true } });
      for (const j of journals) {
        const debits = j.entries.reduce((s, e) => s.add(e.debit), new Prisma.Decimal(0));
        const credits = j.entries.reduce((s, e) => s.add(e.credit), new Prisma.Decimal(0));
        expect(debits.equals(credits)).toBe(true);
      }
    });
  });

  describe("3. RECONCILE, ARCHIVE & RESTORE Operations", () => {
    it("reconciles posted/refunded expense without balance mutation", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(3000),
          description: "Utility Bill",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
      });

      const balanceBefore = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;

      const reconciled = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.reconcileExpense(tx, { expenseId: posted.id, householdId: householdAId, userId: userAId });
      });

      expect(reconciled.status).toBe("RECONCILED");

      const balanceAfter = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;
      expect(balanceAfter.equals(balanceBefore)).toBe(true);
    });

    it("archives expense softly preserving historical journals and restores back", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(2000),
          description: "Restaurant Bill",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
      });

      const archived = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.archiveExpense(tx, { expenseId: posted.id, householdId: householdAId, userId: userAId });
      });

      expect(archived.status).toBe("ARCHIVED");

      // Historical journal is preserved
      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: posted.journalId! } });
      expect(journal).toBeTruthy();

      // Restores back to POSTED
      const restored = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.restoreExpense(tx, { expenseId: archived.id, householdId: householdAId, userId: userAId });
      });

      expect(restored.status).toBe("POSTED");
    });
  });

  describe("4. Household Isolation", () => {
    it("enforces Household Isolation — Household A cannot refund or manage Household B's expense", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdBId,
          accountId: accountBId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
      });

      const draftB = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.createDraft(tx, {
          householdId: householdBId,
          userId: userBId,
          accountId: accountBId,
          amount: new Prisma.Decimal(1000),
          description: "B's Expense",
        });
      });

      const postedB = await prisma.$transaction(async (tx) => {
        return await ExpenseDomainService.postDraft(tx, { expenseId: draftB.id, householdId: householdBId, userId: userBId });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await ExpenseDomainService.refundExpense(tx, {
            expenseId: postedB.id,
            householdId: householdAId, // Cross household attempt
            userId: userAId,
            amount: new Prisma.Decimal(500),
          });
        })
      ).rejects.toThrow("EXPENSE_NOT_FOUND");
    });
  });
});
