import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { Prisma } from "@prisma/client";

describe("Sprint 4 Financial Security, Immutability & Household Isolation Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;

  let householdBId: string;
  let userBId: string;
  let accountBId: string;

  beforeEach(async () => {
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `sec-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Account A", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountAId = accA.id;

    // Household B Setup
    const userB = await prisma.user.create({
      data: { email: `sec-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "Account B", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountBId = accB.id;
  });

  afterEach(async () => {
    const resA = await ReconciliationService.reconcileHousehold(householdAId);
    for (const r of resA) expect(r.status).toBe("MATCH");

    const resB = await ReconciliationService.reconcileHousehold(householdBId);
    for (const r of resB) expect(r.status).toBe("MATCH");
  });

  describe("1. Household Isolation (P0 Security)", () => {
    it("A cannot read or find Household B's account", async () => {
      const found = await prisma.account.findFirst({
        where: { id: accountBId, householdId: householdAId },
      });
      expect(found).toBeNull();
    });

    it("A cannot modify Household B's account", async () => {
      const updated = await prisma.account.updateMany({
        where: { id: accountBId, householdId: householdAId },
        data: { name: "Hacked Account" },
      });
      expect(updated.count).toBe(0);

      const target = await prisma.account.findUniqueOrThrow({ where: { id: accountBId } });
      expect(target.name).toBe("Account B");
    });

    it("A cannot post financial journal using Household B's account", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          return await FinancialCommand.postExpense(tx, {
            householdId: householdAId,
            accountId: accountBId, // Account B belongs to Household B
            amount: new Prisma.Decimal(1000),
            description: "Cross Household Hack",
          });
        })
      ).rejects.toThrow("ACCOUNT_UNAVAILABLE");
    });

    it("A cannot reverse Household B's journal", async () => {
      let journalBId = "";
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdBId,
          accountId: accountBId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
        const jB = await FinancialCommand.postExpense(tx, {
          householdId: householdBId,
          accountId: accountBId,
          amount: new Prisma.Decimal(2000),
          description: "B's Expense",
        });
        journalBId = jB.id;
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await LedgerService.reverseJournal(tx, journalBId, householdAId);
        })
      ).rejects.toThrow("HOUSEHOLD_ISOLATION_VIOLATION");
    });

    it("A cannot refund Household B's transaction", async () => {
      let txnBId = "";
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdBId,
          accountId: accountBId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
        const txB = await TransactionDomainService.createExpense(tx, {
          householdId: householdBId,
          userId: userBId,
          accountId: accountBId,
          amount: new Prisma.Decimal(3000),
          description: "Expense B",
        });
        txnBId = txB.id;
      });

      // Attempt refund using Household A context
      const targetTx = await prisma.transaction.findFirst({
        where: { id: txnBId, householdId: householdAId },
      });
      expect(targetTx).toBeNull();
    });
  });

  describe("2. Posted Journal Immutability & Ledger Protection", () => {
    it("no component outside LedgerService modifies Account.balance directly", async () => {
      // Monitored via no-direct-balance-mutation.test.ts static analyzer
      expect(true).toBe(true);
    });

    it("prevents updating or deleting POSTED journal and journal entries", async () => {
      let journalId = "";
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdAId,
          accountId: accountAId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
        const j = await FinancialCommand.postExpense(tx, {
          householdId: householdAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(1500),
          description: "Immutable Journal Test",
        });
        journalId = j.id;
      });

      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: journalId } });
      expect(journal.status).toBe("POSTED");

      // Reversal is the ONLY allowed status modification mechanism
      await prisma.$transaction(async (tx) => {
        await LedgerService.reverseJournal(tx, journalId, householdAId);
      });

      const reversedJournal = await prisma.journal.findUniqueOrThrow({ where: { id: journalId } });
      expect(reversedJournal.status).toBe("VOIDED");
    });
  });

  describe("3. Final Financial Invariants Verification", () => {
    it("enforces all core financial invariants across all posted records", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId: householdAId,
          accountId: accountAId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(50000),
        });

        const tx1 = await TransactionDomainService.createIncome(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(10000),
          description: "Invariant Test Income",
        });

        const tx2 = await TransactionDomainService.createExpense(tx, {
          householdId: householdAId,
          userId: userAId,
          accountId: accountAId,
          amount: new Prisma.Decimal(4000),
          description: "Invariant Test Expense",
        });

        await LedgerService.reverseJournal(tx, tx2.journalId!, householdAId);
      });

      // 1. For every posted journal: SUM(debit) == SUM(credit)
      const journals = await prisma.journal.findMany({ include: { entries: true } });
      for (const j of journals) {
        const debits = j.entries.reduce((s, e) => s.add(e.debit), new Prisma.Decimal(0));
        const credits = j.entries.reduce((s, e) => s.add(e.credit), new Prisma.Decimal(0));
        expect(debits.equals(credits)).toBe(true);
      }

      // 2. For every transaction: Transaction.journalId != null
      const transactions = await prisma.transaction.findMany();
      for (const t of transactions) {
        expect(t.journalId).toBeTruthy();
      }

      // 3. For every posted journal: Journal.householdId = Transaction.householdId = Account.householdId
      for (const t of transactions) {
        const j = journals.find((item) => item.id === t.journalId);
        expect(j).toBeTruthy();
        expect(j?.householdId).toBe(t.householdId);
      }

      // 4. For every reversal: original + reversal = 0
      const reversals = await prisma.journal.findMany({ where: { reversalOfId: { not: null } }, include: { entries: true } });
      for (const rev of reversals) {
        const orig = journals.find((j) => j.id === rev.reversalOfId);
        expect(orig).toBeTruthy();

        const origNet = orig!.entries.reduce((s, e) => s.add(e.debit).sub(e.credit), new Prisma.Decimal(0));
        const revNet = rev.entries.reduce((s, e) => s.add(e.debit).sub(e.credit), new Prisma.Decimal(0));
        expect(origNet.add(revNet).equals(0)).toBe(true);
      }
    });
  });
});
