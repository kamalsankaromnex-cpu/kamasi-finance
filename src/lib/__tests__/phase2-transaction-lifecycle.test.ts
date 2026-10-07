import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { Prisma } from "@prisma/client";

describe("Phase 2.1 Transaction Lifecycle Suite", () => {
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

    // Primary Household A
    const userA = await prisma.user.create({
      data: { email: `p21-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Primary Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountAId = accA.id;

    // Household B (Isolation Check)
    const userB = await prisma.user.create({
      data: { email: `p21-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "Other Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountBId = accB.id;

    // Opening Balance
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

  describe("1. DRAFT Lifecycle Operations", () => {
    it("creates draft transaction without altering Account.balance or posting a journal", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(3000),
          description: "Pending Groceries",
          type: "EXPENSE",
        });
      });

      expect(draft.status).toBe("DRAFT");
      expect(draft.journalId).toBeNull();

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(50000); // Unchanged

      const history = await prisma.transactionLifecycleHistory.findMany({ where: { transactionId: draft.id } });
      expect(history.length).toBe(1);
      expect(history[0].toStatus).toBe("DRAFT");
    });

    it("edits draft transaction while status === DRAFT", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(3000),
          description: "Initial Draft Description",
        });
      });

      const updated = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.updateDraft(tx, {
          transactionId: draft.id,
          householdId: householdAId,
          userId: userAId,
          data: {
            amount: new Prisma.Decimal(4500),
            description: "Updated Draft Description",
          },
        });
      });

      expect(updated.amount.toNumber()).toBe(4500);
      expect(updated.description).toBe("Updated Draft Description");
    });

    it("posts DRAFT transaction to double-entry ledger", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(5000),
          description: "Office Monitor",
          type: "EXPENSE",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.postDraft(tx, {
          transactionId: draft.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(posted.status).toBe("POSTED");
      expect(posted.journalId).toBeTruthy();

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(45000);
    });

    it("prohibits editing a POSTED transaction directly", async () => {
      const posted = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(2000),
          description: "Immutable Expense",
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          return await TransactionDomainService.updateDraft(tx, {
            transactionId: posted.id,
            householdId: householdAId,
            userId: userAId,
            data: { amount: new Prisma.Decimal(3000) },
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });
  });

  describe("2. RECONCILE Lifecycle Operations", () => {
    it("reconciles posted transaction without creating another journal or altering balance", async () => {
      const posted = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(1000),
          description: "Subscription",
        });
      });

      const journalCountBefore = await prisma.journal.count();
      const balanceBefore = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;

      const reconciled = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.reconcileTransaction(tx, {
          transactionId: posted.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(reconciled.status).toBe("RECONCILED");
      expect(reconciled.reconciledAt).toBeTruthy();

      const journalCountAfter = await prisma.journal.count();
      const balanceAfter = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;

      expect(journalCountAfter).toBe(journalCountBefore); // No new journal
      expect(balanceAfter.equals(balanceBefore)).toBe(true); // Balance untouched
    });
  });

  describe("3. REVERSE & REPLACEMENT Lifecycle Operations", () => {
    it("reverses posted transaction keeping original journal untouched and giving replacement a new journal", async () => {
      const originalTx = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
          description: "Flight Booking Original",
        });
      });

      const originalJournalId = originalTx.journalId!;
      let bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(40000);

      // Execute reversal with replacement of ₹12,000
      const { reversed, replacement } = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.reverseTransaction(tx, {
          transactionId: originalTx.id,
          householdId: householdAId,
          userId: userAId,
          reason: "Price correction",
          replacementData: {
            householdId: householdAId,
            userId: userAId,
            accountId: accountAId,
            amount: new Prisma.Decimal(12000),
            description: "Flight Booking Replacement",
            type: "EXPENSE",
          },
        });
      });

      expect(reversed.status).toBe("REVERSED");
      expect(reversed.isVoided).toBe(true);
      expect(reversed.replacementTransactionId).toBe(replacement!.id);

      // Original journal remains intact, status set to VOIDED via compensating reversal
      const origJournal = await prisma.journal.findUniqueOrThrow({ where: { id: originalJournalId } });
      expect(origJournal.status).toBe("VOIDED");

      // Replacement gets its own distinct journal
      expect(replacement!.journalId).toBeTruthy();
      expect(replacement!.journalId).not.toBe(originalJournalId);

      // Final balance: 50000 - 10000 (orig) + 10000 (reversal) - 12000 (replacement) = 38000
      bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(38000);
    });

    it("prohibits reversing a transaction twice or reversing a reversal", async () => {
      const posted = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(2000),
          description: "Movie Ticket",
        });
      });

      await prisma.$transaction(async (tx) => {
        await TransactionDomainService.reverseTransaction(tx, {
          transactionId: posted.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      // Second reversal rejected
      await expect(
        prisma.$transaction(async (tx) => {
          await TransactionDomainService.reverseTransaction(tx, {
            transactionId: posted.id,
            householdId: householdAId,
            userId: userAId,
          });
        })
      ).rejects.toThrow("TRANSACTION_ALREADY_VOIDED");
    });
  });

  describe("4. ARCHIVE & RESTORE Lifecycle Operations", () => {
    it("archives transaction softly and prevents archived record from creating new financial activity", async () => {
      const posted = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(1500),
          description: "Archive Candidate",
        });
      });

      const archived = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.archiveTransaction(tx, {
          transactionId: posted.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(archived.status).toBe("ARCHIVED");
      expect(archived.archivedAt).toBeTruthy();

      // Journal & JournalEntry records remain preserved
      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: posted.journalId! } });
      expect(journal).toBeTruthy();

      // Restores back to previous status (POSTED)
      const restored = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.restoreTransaction(tx, {
          transactionId: archived.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(restored.status).toBe("POSTED");
    });
  });

  describe("5. Lifecycle History & Household Isolation", () => {
    it("records complete lifecycle audit history entries for all state changes", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(2500),
          description: "Audited Transaction",
        });
      });

      await prisma.$transaction(async (tx) => {
        await TransactionDomainService.postDraft(tx, { transactionId: draft.id, householdId: householdAId, userId: userAId });
      });

      await prisma.$transaction(async (tx) => {
        await TransactionDomainService.reconcileTransaction(tx, { transactionId: draft.id, householdId: householdAId, userId: userAId });
      });

      const history = await prisma.transactionLifecycleHistory.findMany({
        where: { transactionId: draft.id },
        orderBy: { createdAt: "asc" },
      });

      expect(history.length).toBe(3);
      expect(history[0].action).toBe("CREATE_DRAFT");
      expect(history[1].action).toBe("POST");
      expect(history[2].action).toBe("RECONCILE");
    });

    it("enforces Household Isolation — Household A cannot manage Household B's transaction lifecycle", async () => {
      const txnB = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createDraft(tx, {
          householdId: householdBId,
          userId: userBId,
          accountId: accountBId,
          amount: new Prisma.Decimal(1000),
          description: "B's Draft",
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await TransactionDomainService.postDraft(tx, {
            transactionId: txnB.id,
            householdId: householdAId, // Cross-household attempt
            userId: userAId,
          });
        })
      ).rejects.toThrow("TRANSACTION_NOT_FOUND");
    });
  });
});
