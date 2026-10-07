import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { IncomeDomainService } from "@/modules/income/income.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { Prisma } from "@prisma/client";

describe("Phase 2.2 Income Lifecycle Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;
  let incomeSourceAId: string;

  let householdBId: string;
  let userBId: string;
  let accountBId: string;
  let incomeSourceBId: string;

  beforeEach(async () => {
    await prisma.incomeLifecycleHistory.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.incomeOccurrence.deleteMany();
    await prisma.incomeSource.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p22-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
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

    const sourceA = await prisma.incomeSource.create({
      data: { householdId: householdAId, name: "Tech Corp Salary", defaultAccountId: accountAId, expectedAmount: new Prisma.Decimal(100000) },
    });
    incomeSourceAId = sourceA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p22-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
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

    const sourceB = await prisma.incomeSource.create({
      data: { householdId: householdBId, name: "Other Consulting", defaultAccountId: accountBId, expectedAmount: new Prisma.Decimal(50000) },
    });
    incomeSourceBId = sourceB.id;

    // Opening Balance for Account A
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(20000),
      });
    });
  });

  afterEach(async () => {
    const resA = await ReconciliationService.reconcileHousehold(householdAId);
    for (const r of resA) expect(r.status).toBe("MATCH");
  });

  describe("1. EXPECTED & CONFIRMED Lifecycle Invariants", () => {
    it("creates expected income and verifies balance remains unchanged (0 ledger activity)", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "October Salary",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(100000),
        });
      });

      expect(occurrence.status).toBe("EXPECTED");
      expect(occurrence.journalId).toBeNull();

      // Account.balance remains unchanged
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(20000);
    });

    it("confirms expected income and verifies balance remains unchanged (0 ledger activity)", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "October Salary",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(100000),
        });
      });

      const confirmed = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.confirm(tx, {
          incomeOccurrenceId: occurrence.id,
          householdId: householdAId,
          userId: userAId,
        });
      });

      expect(confirmed.status).toBe("CONFIRMED");
      expect(confirmed.journalId).toBeNull();

      // Account.balance remains unchanged
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(20000);
    });
  });

  describe("2. CREDITED Lifecycle Operations & Invariants", () => {
    it("credits confirmed income: creates exactly 1 Journal, increases Account.balance once, populates journalId", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        const exp = await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "October Salary",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(100000),
        });
        return await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: householdAId, userId: userAId });
      });

      const journalCountBefore = await prisma.journal.count();
      const idempotencyKey = `inc-cred-${Date.now()}`;

      const credited = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.credit(tx, {
          incomeOccurrenceId: occurrence.id,
          householdId: householdAId,
          accountId: accountAId,
          userId: userAId,
          idempotencyKey,
        });
      });

      expect(credited.status).toBe("CREDITED");
      expect(credited.journalId).toBeTruthy();

      const journalCountAfter = await prisma.journal.count();
      expect(journalCountAfter - journalCountBefore).toBe(1); // Exactly 1 Journal created

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountAId } });
      expect(bank.balance.toNumber()).toBe(120000); // 20,000 + 100,000 = 120,000
    });

    it("prohibits crediting income directly from EXPECTED status without confirmation", async () => {
      const expected = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "Unconfirmed Salary",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(50000),
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await IncomeDomainService.credit(tx, {
            incomeOccurrenceId: expected.id,
            householdId: householdAId,
            accountId: accountAId,
          });
        })
      ).rejects.toThrow("INVALID_TRANSITION");
    });

    it("prohibits crediting an already credited income record twice", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        const exp = await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "Bonus Income",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(25000),
        });
        const conf = await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: householdAId, userId: userAId });
        return await IncomeDomainService.credit(tx, { incomeOccurrenceId: conf.id, householdId: householdAId, accountId: accountAId });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await IncomeDomainService.credit(tx, {
            incomeOccurrenceId: occurrence.id,
            householdId: householdAId,
            accountId: accountAId,
          });
        })
      ).rejects.toThrow("INCOME_ALREADY_CREDITED");
    });
  });

  describe("3. RECONCILE, ARCHIVE & RESTORE Operations", () => {
    it("reconciles credited income without changing balance", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        const exp = await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "Consulting Fee",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(15000),
        });
        const conf = await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: householdAId });
        return await IncomeDomainService.credit(tx, { incomeOccurrenceId: conf.id, householdId: householdAId, accountId: accountAId });
      });

      const balanceBefore = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;

      const reconciled = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.reconcile(tx, { incomeOccurrenceId: occurrence.id, householdId: householdAId });
      });

      expect(reconciled.status).toBe("RECONCILED");

      const balanceAfter = (await prisma.account.findUniqueOrThrow({ where: { id: accountAId } })).balance;
      expect(balanceAfter.equals(balanceBefore)).toBe(true);
    });

    it("archives income preserving historical journal and restores to previous status", async () => {
      const occurrence = await prisma.$transaction(async (tx) => {
        const exp = await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "Archived Income",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(10000),
        });
        const conf = await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: householdAId });
        return await IncomeDomainService.credit(tx, { incomeOccurrenceId: conf.id, householdId: householdAId, accountId: accountAId });
      });

      const archived = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.archive(tx, { incomeOccurrenceId: occurrence.id, householdId: householdAId, userId: userAId });
      });

      expect(archived.status).toBe("ARCHIVED");
      expect(archived.journalId).toBeTruthy();

      // Journal remains preserved in DB
      const journal = await prisma.journal.findUniqueOrThrow({ where: { id: occurrence.journalId! } });
      expect(journal).toBeTruthy();

      // Cannot credit archived income
      await expect(
        prisma.$transaction(async (tx) => {
          await IncomeDomainService.credit(tx, { incomeOccurrenceId: archived.id, householdId: householdAId, accountId: accountAId });
        })
      ).rejects.toThrow();

      // Restore works
      const restored = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.restore(tx, { incomeOccurrenceId: archived.id, householdId: householdAId });
      });

      expect(restored.status).toBe("CREDITED");
    });
  });

  describe("4. Audit History & Household Isolation", () => {
    it("records complete lifecycle audit history entries for all income status transitions", async () => {
      const expected = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.createExpected(tx, {
          householdId: householdAId,
          incomeSourceId: incomeSourceAId,
          name: "Audit Test Salary",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(50000),
        });
      });

      await prisma.$transaction(async (tx) => {
        await IncomeDomainService.confirm(tx, { incomeOccurrenceId: expected.id, householdId: householdAId, userId: userAId });
      });

      await prisma.$transaction(async (tx) => {
        await IncomeDomainService.credit(tx, { incomeOccurrenceId: expected.id, householdId: householdAId, accountId: accountAId, userId: userAId });
      });

      const history = await prisma.incomeLifecycleHistory.findMany({
        where: { incomeOccurrenceId: expected.id },
        orderBy: { createdAt: "asc" },
      });

      expect(history.length).toBe(3);
      expect(history[0].action).toBe("CREATE_EXPECTED");
      expect(history[1].action).toBe("CONFIRM");
      expect(history[2].action).toBe("CREDIT");
    });

    it("enforces Household Isolation — Household A cannot confirm or credit Household B's income", async () => {
      const occurrenceB = await prisma.$transaction(async (tx) => {
        return await IncomeDomainService.createExpected(tx, {
          householdId: householdBId,
          incomeSourceId: incomeSourceBId,
          name: "B Income",
          periodStart: new Date("2026-10-01"),
          periodEnd: new Date("2026-10-31"),
          dueDate: new Date("2026-10-31"),
          expectedAmount: new Prisma.Decimal(50000),
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await IncomeDomainService.confirm(tx, {
            incomeOccurrenceId: occurrenceB.id,
            householdId: householdAId, // Cross household attempt
            userId: userAId,
          });
        })
      ).rejects.toThrow("INCOME_OCCURRENCE_NOT_FOUND");
    });
  });
});
