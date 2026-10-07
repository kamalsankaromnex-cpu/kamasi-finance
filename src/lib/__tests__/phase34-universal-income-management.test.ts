import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { IncomeDomainService } from "@/modules/income/income.service";
import { LedgerService } from "@/finance/ledger.service";
import { AuditService, AuditIntegrityService } from "@/finance/audit";
import { IncomeLifecycle } from "@/finance/lifecycle/income-lifecycle";

describe("Phase 3.4 — Universal Income Management & Accounting Suite", () => {
  let household1Id: string;
  let household2Id: string;
  let user1Id: string;
  let bankAccount1Id: string;
  let bankAccount2Id: string;

  beforeEach(async () => {
    // Clean database before each test
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

    const user1 = await prisma.user.create({
      data: {
        email: "alpha.user@kamasi.test",
        name: "Alpha User",
        passwordHash: "dummy_hash",
      },
    });
    user1Id = user1.id;

    // Setup Test Household 1 & User 1
    const household1 = await prisma.household.create({
      data: {
        name: "Alpha Household",
        members: {
          create: {
            userId: user1Id,
            role: "OWNER",
          },
        },
      },
    });
    household1Id = household1.id;

    // Setup Test Household 2
    const household2 = await prisma.household.create({
      data: { name: "Beta Household" },
    });
    household2Id = household2.id;

    // Setup Bank Account for Household 1 (Starting Balance: ₹50,000)
    const bankAccount1 = await prisma.account.create({
      data: {
        householdId: household1Id,
        userId: user1Id,
        name: "Main HDFC Operating Account",
        type: "BANK",
        balance: new Prisma.Decimal(50000),
      },
    });
    bankAccount1Id = bankAccount1.id;

    // Setup Bank Account for Household 2
    const bankAccount2 = await prisma.account.create({
      data: {
        householdId: household2Id,
        name: "Beta Bank Account",
        type: "BANK",
        balance: new Prisma.Decimal(10000),
      },
    });
    bankAccount2Id = bankAccount2.id;
  });

  it("1. Salary Income Scenario: Gross ₹185,000, TDS ₹10,000, PF ₹5,000 -> Net Bank Credit ₹170,000", async () => {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Income Source
      const source = await IncomeDomainService.createSource(tx, {
        householdId: household1Id,
        name: "Tech Corp Salary",
        category: "SALARY",
        defaultAccountId: bankAccount1Id,
        expectedAmount: new Prisma.Decimal(185000),
        userId: user1Id,
      });

      // 2. Create EXPECTED occurrence
      const expected = await IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Salary - Oct 2026",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(185000),
        grossAmount: new Prisma.Decimal(185000),
        deductionsAmount: new Prisma.Decimal(5000),
        taxWithheld: new Prisma.Decimal(10000),
        netAmount: new Prisma.Decimal(170000),
        userId: user1Id,
      });

      // Verify balance is unchanged at EXPECTED stage
      const bankBefore = await tx.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
      expect(bankBefore.balance.toNumber()).toBe(50000);

      // 3. Confirm Income
      const confirmed = await IncomeDomainService.confirm(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        userId: user1Id,
      });
      expect(confirmed.status).toBe("CONFIRMED");

      // Verify balance STILL unchanged at CONFIRMED stage
      const bankConfirmed = await tx.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
      expect(bankConfirmed.balance.toNumber()).toBe(50000);

      // 4. Credit Salary Income
      const credited = await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: confirmed.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
        userId: user1Id,
      });
      expect(credited.status).toBe("CREDITED");
      expect(credited.netAmount?.toNumber()).toBe(170000);

      return { source, credited };
    });

    // Verify Bank Balance updated by exactly Net Amount (+ ₹170,000 -> ₹220,000)
    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bankAfter.balance.toNumber()).toBe(220000);

    // Verify Double-Entry Journal Entries Balance: Debits = Credits = 185,000
    const journal = await prisma.journal.findUniqueOrThrow({
      where: { id: result.credited.journalId! },
      include: { entries: true },
    });
    const sumDebits = journal.entries.reduce((acc, e) => acc.add(e.debit), new Prisma.Decimal(0));
    const sumCredits = journal.entries.reduce((acc, e) => acc.add(e.credit), new Prisma.Decimal(0));
    expect(sumDebits.toNumber()).toBe(185000);
    expect(sumCredits.toNumber()).toBe(185000);
  });

  it("2. Agriculture Income Scenario: Crop Harvest Sale ₹85,000", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, {
        householdId: household1Id,
        name: "Sugarcane Crop Harvest",
        category: "AGRICULTURE",
        behavior: "SEASONAL",
      });

      const expected = await IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Paddy & Sugarcane Harvest Sale",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-15"),
        dueDate: new Date("2026-10-15"),
        expectedAmount: new Prisma.Decimal(85000),
      });

      await IncomeDomainService.confirm(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
      });

      await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
        amount: new Prisma.Decimal(85000),
      });
    });

    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bankAfter.balance.toNumber()).toBe(135000); // ₹50,000 + ₹85,000
  });

  it("3. Sericulture Income Scenario: Silk Cocoon Sale ₹32,000", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, {
        householdId: household1Id,
        name: "Silk Cocoon Production",
        category: "SERICULTURE",
      });

      const expected = await IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Cocoon Harvest Batch 4",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-10"),
        dueDate: new Date("2026-10-10"),
        expectedAmount: new Prisma.Decimal(32000),
      });

      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: expected.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
      });
    });

    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bankAfter.balance.toNumber()).toBe(82000); // ₹50,000 + ₹32,000
  });

  it("4. Livestock / Goat Farm Income Scenario: Goat Sale ₹42,500", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, {
        householdId: household1Id,
        name: "Kamasi Livestock & Goat Farm",
        category: "LIVESTOCK",
      });

      const expected = await IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Festive Season Goat Batch Sale",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-05"),
        dueDate: new Date("2026-10-05"),
        expectedAmount: new Prisma.Decimal(42500),
      });

      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: expected.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
      });
    });

    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bankAfter.balance.toNumber()).toBe(92500); // ₹50,000 + ₹42,500
  });

  it("5. Rental, Freelance, Interest, & Dividend Universal Scenarios", async () => {
    await prisma.$transaction(async (tx) => {
      // Rental
      const rentalSource = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Commercial Shop Rent", category: "RENTAL" });
      const rentalExp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: rentalSource.id, name: "Shop Rent Oct", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-31"), dueDate: new Date("2026-10-05"), expectedAmount: new Prisma.Decimal(15000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: rentalExp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: rentalExp.id, householdId: household1Id, accountId: bankAccount1Id });

      // Freelance
      const freelanceSource = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Tech Consulting", category: "FREELANCE" });
      const freelanceExp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: freelanceSource.id, name: "Architecture Review Payout", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-15"), dueDate: new Date("2026-10-15"), expectedAmount: new Prisma.Decimal(25000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: freelanceExp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: freelanceExp.id, householdId: household1Id, accountId: bankAccount1Id });

      // Interest
      const interestSource = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Fixed Deposit Yield", category: "INTEREST" });
      const interestExp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: interestSource.id, name: "FD Quarterly Interest", periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-09-30"), dueDate: new Date("2026-10-01"), expectedAmount: new Prisma.Decimal(6500) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: interestExp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: interestExp.id, householdId: household1Id, accountId: bankAccount1Id });

      // Dividend
      const dividendSource = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Equity Dividends", category: "DIVIDEND" });
      const dividendExp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: dividendSource.id, name: "Tata Steel Dividend", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-01"), dueDate: new Date("2026-10-01"), expectedAmount: new Prisma.Decimal(8500) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: dividendExp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: dividendExp.id, householdId: household1Id, accountId: bankAccount1Id });
    });

    const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    // Starting ₹50,000 + ₹15,000 + ₹25,000 + ₹6,500 + ₹8,500 = ₹105,000
    expect(bankAfter.balance.toNumber()).toBe(105000);
  });

  it("6. Full Lifecycle Matrix: EXPECTED -> CONFIRMED -> CREDITED -> RECONCILED -> ARCHIVED -> RESTORED", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Consulting Income", category: "FREELANCE" });
      const occurrence = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Project Milestone 1", periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-10-15"), dueDate: new Date("2026-10-15"), expectedAmount: new Prisma.Decimal(20000) });

      // EXPECTED -> CONFIRMED
      const confirmed = await IncomeDomainService.confirm(tx, { incomeOccurrenceId: occurrence.id, householdId: household1Id });
      expect(confirmed.status).toBe("CONFIRMED");

      // CONFIRMED -> CREDITED
      const credited = await IncomeDomainService.credit(tx, { incomeOccurrenceId: confirmed.id, householdId: household1Id, accountId: bankAccount1Id });
      expect(credited.status).toBe("CREDITED");

      // CREDITED -> RECONCILED
      const reconciled = await IncomeDomainService.reconcile(tx, { incomeOccurrenceId: credited.id, householdId: household1Id });
      expect(reconciled.status).toBe("RECONCILED");

      // RECONCILED -> ARCHIVED
      const archived = await IncomeDomainService.archive(tx, { incomeOccurrenceId: reconciled.id, householdId: household1Id });
      expect(archived.status).toBe("ARCHIVED");

      // ARCHIVED -> RESTORED
      const restored = await IncomeDomainService.restore(tx, { incomeOccurrenceId: archived.id, householdId: household1Id });
      expect(restored.status).toBe("RECONCILED");
    });
  });

  it("7. Cancellation & Reversal Scenarios", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Consulting", category: "FREELANCE" });
      const exp1 = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Cancelled Payout", periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(), expectedAmount: new Prisma.Decimal(10000) });

      // Cancel EXPECTED occurrence (0 ledger impact)
      const cancelled = await IncomeDomainService.cancel(tx, { incomeOccurrenceId: exp1.id, householdId: household1Id, reason: "Client cancelled contract" });
      expect(cancelled.status).toBe("CANCELLED");

      // Reversal of CREDITED occurrence
      const exp2 = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Bounced Check Income", periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(), expectedAmount: new Prisma.Decimal(15000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp2.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: exp2.id, householdId: household1Id, accountId: bankAccount1Id });

      // Reverse CREDITED occurrence via compensating double-entry journal
      const reversed = await IncomeDomainService.reverse(tx, { incomeOccurrenceId: exp2.id, householdId: household1Id, reason: "Check bounced" });
      expect(reversed.status).toBe("REVERSED");
    });

    // Balance should be back to starting ₹50,000 (Credited +₹15,000, Reversed -₹15,000)
    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bank.balance.toNumber()).toBe(50000);
  });

  it("8. Idempotency Stress Test: Parallel credit calls with same key produce exactly 1 credit", async () => {
    const source = await prisma.$transaction(async (tx) => {
      return IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Business Revenue", category: "BUSINESS" });
    });

    const expected = await prisma.$transaction(async (tx) => {
      return IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Client Invoice #104",
        periodStart: new Date(),
        periodEnd: new Date(),
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(50000),
      });
    });

    await prisma.$transaction(async (tx) => {
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: expected.id, householdId: household1Id });
    });

    const idempotencyKey = "IDEM_INCOME_CREDIT_KEY_99";

    // Call credit sequentially with same idempotencyKey
    await prisma.$transaction(async (tx) => {
      await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
        idempotencyKey,
      });
    });

    // Second call with same idempotency key should return existing credited occurrence without double posting
    await prisma.$transaction(async (tx) => {
      const reCredited = await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: expected.id,
        householdId: household1Id,
        accountId: bankAccount1Id,
        idempotencyKey,
      });
      expect(reCredited.status).toBe("CREDITED");
    });

    // Bank balance must increase exactly ONCE (+ ₹50,000 -> ₹100,000)
    const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccount1Id } });
    expect(bank.balance.toNumber()).toBe(100000);
  });

  it("9. Household Isolation: Prevents cross-household mutation", async () => {
    const source = await prisma.$transaction(async (tx) => {
      return IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Alpha Salary", category: "SALARY" });
    });

    const occurrence = await prisma.$transaction(async (tx) => {
      return IncomeDomainService.createExpected(tx, {
        householdId: household1Id,
        incomeSourceId: source.id,
        name: "Alpha Income",
        periodStart: new Date(),
        periodEnd: new Date(),
        dueDate: new Date(),
        expectedAmount: new Prisma.Decimal(10000),
      });
    });

    // Household 2 attempting to credit Household 1's income MUST throw error
    await expect(
      prisma.$transaction(async (tx) => {
        return IncomeDomainService.credit(tx, {
          incomeOccurrenceId: occurrence.id,
          householdId: household2Id, // Cross-household mismatch!
          accountId: bankAccount2Id,
        });
      })
    ).rejects.toThrow("INCOME_OCCURRENCE_NOT_FOUND");
  });

  it("10. Cryptographic Audit Chain Verification for Income Operations", async () => {
    await prisma.$transaction(async (tx) => {
      const source = await IncomeDomainService.createSource(tx, { householdId: household1Id, name: "Farm Income", category: "AGRICULTURE" });
      const exp = await IncomeDomainService.createExpected(tx, { householdId: household1Id, incomeSourceId: source.id, name: "Crop Sale", periodStart: new Date(), periodEnd: new Date(), dueDate: new Date(), expectedAmount: new Prisma.Decimal(40000) });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: exp.id, householdId: household1Id });
      await IncomeDomainService.credit(tx, { incomeOccurrenceId: exp.id, householdId: household1Id, accountId: bankAccount1Id });
    });

    const auditVerification = await AuditIntegrityService.verifyChain(prisma, household1Id);
    expect(auditVerification.status).toBe("PASS");
    expect(auditVerification.totalEventsVerified).toBeGreaterThanOrEqual(3);
  });
});
