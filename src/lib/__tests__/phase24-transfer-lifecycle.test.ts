import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { TransferDomainService } from "@/modules/transfers/transfer.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { Prisma } from "@prisma/client";

describe("Phase 2.4 Transfer Lifecycle Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountA1Id: string; // Source Bank A
  let accountA2Id: string; // Destination Bank B

  let householdBId: string;
  let userBId: string;
  let accountB1Id: string;

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
      data: { email: `p24-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA1 = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Bank A1", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountA1Id = accA1.id;

    const accA2 = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "ICICI Bank A2", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountA2Id = accA2.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p24-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB1 = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "Axis Bank B1", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountB1Id = accB1.id;

    // Opening Balances for Household A:
    // Bank A1 = ₹50,000
    // Bank A2 = ₹20,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountA1Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000),
      });

      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountA2Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(20000),
      });
    });
  });

  afterEach(async () => {
    const resA = await ReconciliationService.reconcileHousehold(householdAId);
    for (const r of resA) expect(r.status).toBe("MATCH");
  });

  describe("1. Validation & Input Rules", () => {
    it("rejects same-account transfers (source === destination)", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.createDraft(tx, {
            householdId: householdAId,
            userId: userAId,
            sourceAccountId: accountA1Id,
            destinationAccountId: accountA1Id,
            amount: new Prisma.Decimal(5000),
            description: "Self transfer",
          });
        })
      ).rejects.toThrow("INVALID_TRANSFER_ACCOUNTS");
    });

    it("rejects invalid amounts (amount <= 0)", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.createDraft(tx, {
            householdId: householdAId,
            userId: userAId,
            sourceAccountId: accountA1Id,
            destinationAccountId: accountA2Id,
            amount: new Prisma.Decimal(0),
            description: "Zero amount transfer",
          });
        })
      ).rejects.toThrow("INVALID_AMOUNT");

      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.createDraft(tx, {
            householdId: householdAId,
            userId: userAId,
            sourceAccountId: accountA1Id,
            destinationAccountId: accountA2Id,
            amount: new Prisma.Decimal(-100),
            description: "Negative transfer",
          });
        })
      ).rejects.toThrow("INVALID_AMOUNT");
    });
  });

  describe("2. Transfer Draft Operations", () => {
    it("creates draft transfer without changing account balances", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(10000),
          description: "Savings Transfer Draft",
        });
      });

      expect(draft.status).toBe("DRAFT");
      expect(draft.journalId).toBeNull();
      expect(draft.type).toBe("TRANSFER");

      const acc1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
      const acc2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

      expect(acc1.balance.toNumber()).toBe(50000);
      expect(acc2.balance.toNumber()).toBe(20000);
    });

    it("edits draft transfer while status === DRAFT", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(10000),
          description: "Initial Draft",
        });
      });

      const updated = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.updateDraft(tx, {
          transferId: draft.id,
          householdId: householdAId,
          userId: userAId,
          data: { amount: new Prisma.Decimal(15000), description: "Updated Draft" },
        });
      });

      expect(updated.amount.toNumber()).toBe(15000);
      expect(updated.description).toBe("Updated Draft");
    });

    it("prohibits editing a posted transfer directly", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(5000),
          description: "Draft to Post",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, {
          transferId: draft.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.updateDraft(tx, {
            transferId: posted.id,
            householdId: householdAId,
            userId: userAId,
            data: { amount: new Prisma.Decimal(8000) },
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });
  });

  describe("3. Transfer Posting & Core Invariants", () => {
    it("posts transfer: Bank A ₹50k -> ₹40k, Bank B ₹20k -> ₹30k, Total ₹70k unchanged", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(10000),
          description: "Inter-bank Transfer",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, {
          transferId: draft.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(posted.status).toBe("POSTED");
      expect(posted.journalId).toBeTruthy();

      const acc1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
      const acc2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

      expect(acc1.balance.toNumber()).toBe(40000); // 50,000 - 10,000 = 40,000
      expect(acc2.balance.toNumber()).toBe(30000); // 20,000 + 10,000 = 30,000

      const totalAssets = acc1.balance.add(acc2.balance);
      expect(totalAssets.toNumber()).toBe(70000); // Total unchanged!

      // Verify Journal & JournalEntries: 1 Journal, exactly 2 JournalEntries
      const journal = await prisma.journal.findUniqueOrThrow({
        where: { id: posted.journalId! },
        include: { entries: true },
      });

      expect(journal.entries.length).toBe(2);

      const destEntry = journal.entries.find((e) => e.accountId === accountA2Id)!;
      const sourceEntry = journal.entries.find((e) => e.accountId === accountA1Id)!;

      expect(destEntry.debit.toNumber()).toBe(10000);
      expect(destEntry.credit.toNumber()).toBe(0);

      expect(sourceEntry.debit.toNumber()).toBe(0);
      expect(sourceEntry.credit.toNumber()).toBe(10000);

      // Verify ZERO Income or Expense records were created
      const incomeCount = await prisma.transaction.count({
        where: { householdId: householdAId, type: "INCOME" },
      });
      const expenseCount = await prisma.transaction.count({
        where: { householdId: householdAId, type: "EXPENSE" },
      });

      expect(incomeCount).toBe(0);
      expect(expenseCount).toBe(0);
    });

    it("rejects transfer posting if source balance is insufficient", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(60000), // Exceeds ₹50,000 balance
          description: "Overdraft Transfer",
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.postDraft(tx, {
            transferId: draft.id,
            householdId: householdAId,
            userId: userAId,
          });
        })
      ).rejects.toThrow("INSUFFICIENT_FUNDS");
    });
  });

  describe("4. Reversal Lifecycle & Hardening", () => {
    it("reverses transfer: restores Bank A ₹50k & Bank B ₹20k while preserving original Journal", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(10000),
          description: "Transfer to Reverse",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, {
          transferId: draft.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      const origJournalId = posted.journalId!;

      const reversed = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.reverseTransfer(tx, {
          transferId: posted.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(reversed.status).toBe("REVERSED");
      expect(reversed.isVoided).toBe(true);

      // Balances restored to ₹50k and ₹20k
      const acc1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
      const acc2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

      expect(acc1.balance.toNumber()).toBe(50000);
      expect(acc2.balance.toNumber()).toBe(20000);

      // Original journal is VOIDED (linked), entries untouched
      const origJournal = await prisma.journal.findUniqueOrThrow({
        where: { id: origJournalId },
        include: { entries: true },
      });
      expect(origJournal.status).toBe("VOIDED");
      expect(origJournal.entries.length).toBe(2);

      // Compensating reversal journal created
      const reversalJournal = await prisma.journal.findFirstOrThrow({
        where: { reversalOfId: origJournalId },
        include: { entries: true },
      });

      expect(reversalJournal).toBeTruthy();
      expect(reversalJournal.entries.length).toBe(2);

      // Cannot reverse a reversed transfer twice
      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.reverseTransfer(tx, {
            transferId: reversed.id,
            householdId: householdAId,
            userId: userAId,
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });
  });

  describe("5. RECONCILE, ARCHIVE & RESTORE Operations", () => {
    it("reconciles posted transfer without changing balances", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(5000),
          description: "Transfer to Reconcile",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, { transferId: draft.id, householdId: householdAId, userId: userAId });
      });

      const reconciled = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.reconcileTransfer(tx, { transferId: posted.id, householdId: householdAId, userId: userAId });
      });

      expect(reconciled.status).toBe("RECONCILED");

      const acc1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
      const acc2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });

      expect(acc1.balance.toNumber()).toBe(45000);
      expect(acc2.balance.toNumber()).toBe(25000);
    });

    it("archives transfer softly preserving historical journals and restores back", async () => {
      const draft = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          sourceAccountId: accountA1Id,
          destinationAccountId: accountA2Id,
          amount: new Prisma.Decimal(4000),
          description: "Transfer to Archive",
        });
      });

      const posted = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, { transferId: draft.id, householdId: householdAId, userId: userAId });
      });

      const archived = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.archiveTransfer(tx, { transferId: posted.id, householdId: householdAId, userId: userAId });
      });

      expect(archived.status).toBe("ARCHIVED");

      // Historical journal is preserved
      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: posted.journalId! } });
      expect(journal).toBeTruthy();

      // Restores back to POSTED
      const restored = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.restoreTransfer(tx, { transferId: archived.id, householdId: householdAId, userId: userAId });
      });

      expect(restored.status).toBe("POSTED");
    });
  });

  describe("6. Household Isolation", () => {
    it("enforces Household Isolation — Household A cannot reverse or manage Household B's transfer", async () => {
      // Opening Balance for Household B Bank B1: ₹10,000
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdBId,
          accountId: accountB1Id,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
      });

      const accB2 = await prisma.account.create({
        data: { householdId: householdBId, userId: userBId, name: "Axis Bank B2", type: "BANK", balance: new Prisma.Decimal(0) },
      });

      const draftB = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.createDraft(tx, {
          householdId: householdBId,
          userId: userBId,
          sourceAccountId: accountB1Id,
          destinationAccountId: accB2.id,
          amount: new Prisma.Decimal(2000),
          description: "B's Transfer",
        });
      });

      const postedB = await prisma.$transaction(async (tx) => {
        return await TransferDomainService.postDraft(tx, { transferId: draftB.id, householdId: householdBId, userId: userBId });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await TransferDomainService.reverseTransfer(tx, {
            transferId: postedB.id,
            householdId: householdAId, // Cross-household attempt
            userId: userAId,
          });
        })
      ).rejects.toThrow("TRANSFER_NOT_FOUND");
    });
  });
});
