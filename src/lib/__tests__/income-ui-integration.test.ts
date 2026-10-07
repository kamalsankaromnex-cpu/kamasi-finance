import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

describe("Income UI API Integration & Lifecycle Test Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany({});
    await prisma.incomeLifecycleHistory.deleteMany({});
    await prisma.incomeOccurrence.deleteMany({});
    await prisma.incomeSource.deleteMany({});
    await prisma.journalEntry.deleteMany({});
    await prisma.journal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.householdMember.deleteMany({});
    await prisma.household.deleteMany({});
    await prisma.user.deleteMany({});

    const user = await prisma.user.create({
      data: {
        email: "income.tester@kamasi.test",
        name: "Income Tester",
        passwordHash: "dummy_hash",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Test Income Household",
        members: {
          create: {
            userId: userId,
            role: "OWNER",
          },
        },
      },
    });
    householdId = household.id;

    const bankAccount = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: "Main HDFC Account",
        type: "BANK",
        balance: new Prisma.Decimal(100000),
      },
    });
    bankAccountId = bankAccount.id;
  });

  it("Executes strict lifecycle transitions EXPECTED -> CONFIRMED -> CREDITED -> RECONCILED -> ARCHIVED", async () => {
    const { IncomeDomainService } = await import("@/modules/income/income.service");

    // 1. Create Income Source & EXPECTED occurrence
    const source = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.createSource(tx, {
        householdId,
        name: "Monthly Salary Stream",
        category: "SALARY",
        defaultAccountId: bankAccountId,
        expectedAmount: new Prisma.Decimal(85000),
        userId,
      });
    });

    const occurrence = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.createExpected(tx, {
        householdId,
        incomeSourceId: source.id,
        name: "Salary - Oct 2026",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(85000),
        userId,
      });
    });

    expect(occurrence.status).toBe("EXPECTED");

    // Initial account balance check: balance should remain exactly ₹100,000
    let account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(100000);

    // 2. Transition EXPECTED -> CONFIRMED
    const confirmed = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.confirm(tx, {
        incomeOccurrenceId: occurrence.id,
        householdId,
        userId,
      });
    });
    expect(confirmed.status).toBe("CONFIRMED");

    // Balance remains ₹100,000 (no financial ledger posting)
    account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(100000);

    // 3. Transition CONFIRMED -> CREDITED (Mark as Received)
    const credited = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: occurrence.id,
        householdId,
        accountId: bankAccountId,
        amount: new Prisma.Decimal(85000),
        userId,
      });
    });
    expect(credited.status).toBe("CREDITED");
    expect(credited.journalId).not.toBeNull();

    // Balance MUST increase by exactly ₹85,000 to ₹185,000
    account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(185000);

    // Verify Journal & Entries created
    const journal = await prisma.journal.findUnique({
      where: { id: credited.journalId! },
      include: { entries: true },
    });
    expect(journal).not.toBeNull();
    expect(journal?.entries.length).toBe(2);

    const debitEntry = journal?.entries.find((e) => Number(e.debit) > 0);
    const creditEntry = journal?.entries.find((e) => Number(e.credit) > 0);
    expect(Number(debitEntry?.debit)).toBe(85000);
    expect(Number(creditEntry?.credit)).toBe(85000);
    expect(debitEntry?.accountId).toBe(bankAccountId);

    // 4. Transition CREDITED -> RECONCILED
    const reconciled = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.reconcile(tx, {
        incomeOccurrenceId: occurrence.id,
        householdId,
        userId,
      });
    });
    expect(reconciled.status).toBe("RECONCILED");

    // Balance stays ₹185,000
    account = await prisma.account.findUnique({ where: { id: bankAccountId } });
    expect(Number(account?.balance)).toBe(185000);

    // 5. Transition RECONCILED -> ARCHIVED
    const archived = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.archive(tx, {
        incomeOccurrenceId: occurrence.id,
        householdId,
        userId,
      });
    });
    expect(archived.status).toBe("ARCHIVED");
  });
});
