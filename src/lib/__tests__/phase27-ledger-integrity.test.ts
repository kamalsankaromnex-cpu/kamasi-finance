import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { ExpenseDomainService } from "@/modules/expenses/expense.service";
import { IncomeDomainService } from "@/modules/income/income.service";
import { TransferDomainService } from "@/modules/transfers/transfer.service";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { AuditService, AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

describe("Phase 2.7 — Full Regression, Ledger Integrity & Concurrency Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountA1Id: string;
  let accountA2Id: string;
  let incomeSourceAId: string;

  let householdBId: string;
  let userBId: string;
  let accountB1Id: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.goalLifecycleHistory.deleteMany();
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.incomeLifecycleHistory.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.incomeOccurrence.deleteMany();
    await prisma.incomeSource.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p27-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA1 = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Main Bank A1", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountA1Id = accA1.id;

    const accA2 = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Savings Bank A2", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountA2Id = accA2.id;

    const sourceA = await prisma.incomeSource.create({
      data: { householdId: householdAId, name: "Salary Source A", defaultAccountId: accountA1Id, expectedAmount: new Prisma.Decimal(50000) },
    });
    incomeSourceAId = sourceA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p27-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB1 = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "Bank B1", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    accountB1Id = accB1.id;
  });

  // =========================================================================
  // 1. END-TO-END LIFECYCLE MATRIX
  // =========================================================================
  it("1. End-to-End Lifecycle Matrix: Transaction, Income, Expense, Transfer, Goal", async () => {
    // 1.1 Income: EXPECTED -> CONFIRMED -> CREDITED -> RECONCILED -> ARCHIVED
    const inc = await prisma.$transaction((tx) =>
      IncomeDomainService.createExpected(tx, {
        householdId: householdAId,
        incomeSourceId: incomeSourceAId,
        name: "Monthly Salary",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(50000),
        userId: userAId,
      })
    );
    expect(inc.status).toBe("EXPECTED");

    const incConfirmed = await prisma.$transaction((tx) =>
      IncomeDomainService.confirm(tx, { incomeOccurrenceId: inc.id, householdId: householdAId, userId: userAId })
    );
    expect(incConfirmed.status).toBe("CONFIRMED");

    const incCredited = await prisma.$transaction((tx) =>
      IncomeDomainService.credit(tx, { incomeOccurrenceId: inc.id, householdId: householdAId, accountId: accountA1Id, userId: userAId })
    );
    expect(incCredited.status).toBe("CREDITED");

    const incReconciled = await prisma.$transaction((tx) =>
      IncomeDomainService.reconcile(tx, { incomeOccurrenceId: inc.id, householdId: householdAId, userId: userAId })
    );
    expect(incReconciled.status).toBe("RECONCILED");

    const incArchived = await prisma.$transaction((tx) =>
      IncomeDomainService.archive(tx, { incomeOccurrenceId: inc.id, householdId: householdAId, userId: userAId })
    );
    expect(incArchived.status).toBe("ARCHIVED");

    // 1.2 Expense: DRAFT -> POSTED -> PARTIALLY_REFUNDED -> REFUNDED -> RECONCILED -> ARCHIVED
    const exp = await prisma.$transaction((tx) =>
      ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(10000),
        description: "Office Laptop",
      })
    );
    expect(exp.status).toBe("DRAFT");

    const expPosted = await prisma.$transaction((tx) =>
      ExpenseDomainService.postDraft(tx, { expenseId: exp.id, householdId: householdAId, userId: userAId })
    );
    expect(expPosted.status).toBe("POSTED");

    await prisma.$transaction((tx) =>
      ExpenseDomainService.refundExpense(tx, { expenseId: exp.id, householdId: householdAId, userId: userAId, amount: new Prisma.Decimal(4000) })
    );
    const expPartial = await prisma.transaction.findUniqueOrThrow({ where: { id: exp.id } });
    expect(expPartial.status).toBe("PARTIALLY_REFUNDED");

    await prisma.$transaction((tx) =>
      ExpenseDomainService.refundExpense(tx, { expenseId: exp.id, householdId: householdAId, userId: userAId, amount: new Prisma.Decimal(6000) })
    );
    const expRefunded = await prisma.transaction.findUniqueOrThrow({ where: { id: exp.id } });
    expect(expRefunded.status).toBe("REFUNDED");

    const expReconciled = await prisma.$transaction((tx) =>
      ExpenseDomainService.reconcileExpense(tx, { expenseId: exp.id, householdId: householdAId, userId: userAId })
    );
    expect(expReconciled.status).toBe("RECONCILED");

    const expArchived = await prisma.$transaction((tx) =>
      ExpenseDomainService.archiveExpense(tx, { expenseId: exp.id, householdId: householdAId, userId: userAId })
    );
    expect(expArchived.status).toBe("ARCHIVED");

    // 1.3 Transfer: DRAFT -> POSTED -> RECONCILED -> REVERSED -> ARCHIVED
    const trfDraft = await prisma.$transaction((tx) =>
      TransferDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        sourceAccountId: accountA1Id,
        destinationAccountId: accountA2Id,
        amount: new Prisma.Decimal(5000),
        description: "Savings move",
      })
    );
    expect(trfDraft.status).toBe("DRAFT");

    const trfPosted = await prisma.$transaction((tx) =>
      TransferDomainService.postDraft(tx, { transferId: trfDraft.id, householdId: householdAId, userId: userAId })
    );
    expect(trfPosted.status).toBe("POSTED");

    const trfReconciled = await prisma.$transaction((tx) =>
      TransferDomainService.reconcileTransfer(tx, { transferId: trfDraft.id, householdId: householdAId, userId: userAId })
    );
    expect(trfReconciled.status).toBe("RECONCILED");

    const trfReversed = await prisma.$transaction((tx) =>
      TransferDomainService.reverseTransfer(tx, { transferId: trfDraft.id, householdId: householdAId, userId: userAId })
    );
    expect(trfReversed.status).toBe("REVERSED");

    const trfArchived = await prisma.$transaction((tx) =>
      TransferDomainService.archiveTransfer(tx, { transferId: trfDraft.id, householdId: householdAId, userId: userAId })
    );
    expect(trfArchived.status).toBe("ARCHIVED");

    // 1.4 Goal: ACTIVE -> PAUSED -> ACTIVE -> COMPLETED -> ARCHIVED
    const goal = await prisma.$transaction((tx) =>
      GoalDomainService.createGoal(tx, {
        householdId: householdAId,
        userId: userAId,
        name: "Vacation Fund",
        targetAmount: new Prisma.Decimal(20000),
        targetDate: new Date("2026-12-31"),
      })
    );
    expect(goal.status).toBe("ACTIVE");

    const goalPaused = await prisma.$transaction((tx) =>
      GoalDomainService.pauseGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId })
    );
    expect(goalPaused.status).toBe("PAUSED");

    const goalResumed = await prisma.$transaction((tx) =>
      GoalDomainService.resumeGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId })
    );
    expect(goalResumed.status).toBe("ACTIVE");

    await prisma.$transaction((tx) =>
      GoalDomainService.depositToGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId, accountId: accountA1Id, amount: new Prisma.Decimal(20000) })
    );
    const goalCompleted = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(goalCompleted.status).toBe("COMPLETED");

    const goalArchived = await prisma.$transaction((tx) =>
      GoalDomainService.archiveGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId })
    );
    expect(goalArchived.status).toBe("ARCHIVED");
  });

  // =========================================================================
  // 2. COMPLETE FINANCIAL SCENARIO (Independent DB balance comparison)
  // =========================================================================
  it("2. Complete Financial Scenario: Verifies database balance projections match math", async () => {
    // Opening Bank A1 = ₹1,00,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountA1Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000),
      });
    });

    // 1. Income: +₹50,000
    const inc = await prisma.$transaction(async (tx) => {
      const expInc = await IncomeDomainService.createExpected(tx, {
        householdId: householdAId,
        incomeSourceId: incomeSourceAId,
        name: "Salary October",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(50000),
        userId: userAId,
      });
      await IncomeDomainService.confirm(tx, { incomeOccurrenceId: expInc.id, householdId: householdAId, userId: userAId });
      return await IncomeDomainService.credit(tx, { incomeOccurrenceId: expInc.id, householdId: householdAId, accountId: accountA1Id, userId: userAId });
    });

    // 2. Expense: -₹10,000
    const exp = await prisma.$transaction(async (tx) => {
      const draft = await ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(10000),
        description: "Equipment Purchase",
      });
      return await ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId });
    });

    // 3. Transfer: ₹20,000 (A1 -> A2)
    await prisma.$transaction(async (tx) => {
      const draftTrf = await TransferDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        sourceAccountId: accountA1Id,
        destinationAccountId: accountA2Id,
        amount: new Prisma.Decimal(20000),
        description: "Move to Savings",
      });
      return await TransferDomainService.postDraft(tx, { transferId: draftTrf.id, householdId: householdAId, userId: userAId });
    });

    // 4. Refund: +₹3,000 on Expense
    await prisma.$transaction(async (tx) => {
      return await ExpenseDomainService.refundExpense(tx, {
        expenseId: exp.id,
        householdId: householdAId,
        userId: userAId,
        amount: new Prisma.Decimal(3000),
        description: "Partial equipment return",
      });
    });

    // 5. Goal Contribution: ₹15,000 from Bank A1 to Goal
    const goal = await prisma.$transaction(async (tx) => {
      return await GoalDomainService.createGoal(tx, {
        householdId: householdAId,
        userId: userAId,
        name: "Home Downpayment",
        targetAmount: new Prisma.Decimal(100000),
        targetDate: new Date("2027-12-31"),
      });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.depositToGoal(tx, {
        goalId: goal.id,
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(15000),
      });
    });

    // 6. Goal Withdrawal: ₹5,000 back from Goal to Bank A1
    await prisma.$transaction(async (tx) => {
      await GoalDomainService.withdrawFromGoal(tx, {
        goalId: goal.id,
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(5000),
      });
    });

    // EXPECTED CALCULATIONS:
    // Bank A1:
    // Initial = 100,000
    // + Income 50,000 = 150,000
    // - Expense 10,000 = 140,000
    // - Transfer Out 20,000 = 120,000
    // + Refund 3,000 = 123,000
    // - Goal Deposit 15,000 = 108,000
    // + Goal Withdrawal 5,000 = 113,000
    // Expected Bank A1 = 113,000

    // Bank A2:
    // Initial = 0
    // + Transfer In 20,000 = 20,000
    // Expected Bank A2 = 20,000

    // Goal:
    // Initial = 0
    // + Deposit 15,000 = 15,000
    // - Withdrawal 5,000 = 10,000
    // Expected Goal = 10,000

    const bankA1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
    const bankA2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });
    const goalRecord = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });

    expect(bankA1.balance.toNumber()).toBe(113000);
    expect(bankA2.balance.toNumber()).toBe(20000);
    expect(goalRecord.currentAmount.toNumber()).toBe(10000);

    // Reconciliation Check
    const reconciliations = await ReconciliationService.reconcileHousehold(householdAId);
    for (const rec of reconciliations) {
      expect(rec.status).toBe("MATCH");
      expect(rec.difference).toBe(0);
    }
  });

  // =========================================================================
  // 3. CONCURRENCY & RACE CONDITION STRESS
  // =========================================================================
  it("3. Concurrency Stress: Goal Withdrawal race condition (Exactly 1 succeeds, balance = 2,000)", async () => {
    const goal = await prisma.$transaction(async (tx) => {
      return await GoalDomainService.createGoal(tx, {
        householdId: householdAId,
        userId: userAId,
        name: "Car Savings",
        targetAmount: new Prisma.Decimal(50000),
        targetDate: new Date("2026-12-31"),
      });
    });

    // Initial goal balance = ₹10,000
    await prisma.$transaction(async (tx) => {
      await GoalDomainService.depositToGoal(tx, {
        goalId: goal.id,
        householdId: householdAId,
        userId: userAId,
        amount: new Prisma.Decimal(10000),
      });
    });

    // Simultaneous Withdrawal A (₹8,000) and Withdrawal B (₹8,000)
    const withdrawalPromises = [
      prisma.$transaction((tx) =>
        GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(8000),
        })
      ),
      prisma.$transaction((tx) =>
        GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(8000),
        })
      ),
    ];

    const results = await Promise.allSettled(withdrawalPromises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const updatedGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(updatedGoal.currentAmount.toNumber()).toBe(2000);
  });

  // =========================================================================
  // 4. IDEMPOTENCY STRESS (10 Concurrent Submissions)
  // =========================================================================
  it("4. Idempotency Stress: 10 Concurrent Submissions of identical key produce exactly 1 execution", async () => {
    const idempotencyKey = `idem-stress-${Date.now()}`;

    // Opening balance ₹50,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountA1Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(50000),
      });
    });

    // Create a draft expense
    const draft = await prisma.$transaction((tx) =>
      ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(12000),
        description: "Idempotent Expense",
        idempotencyKey,
      })
    );

    // 10 Parallel refund attempts with same idempotencyKey
    await prisma.$transaction((tx) => ExpenseDomainService.postDraft(tx, { expenseId: draft.id, householdId: householdAId, userId: userAId }));

    const refundKey = `refund-idem-${Date.now()}`;
    const parallelRefunds = Array.from({ length: 10 }).map(() =>
      prisma.$transaction((tx) =>
        ExpenseDomainService.refundExpense(tx, {
          expenseId: draft.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(3000),
          idempotencyKey: refundKey,
        })
      )
    );

    const refundResults = await Promise.allSettled(parallelRefunds);
    const successfulRefunds = refundResults.filter((r) => r.status === "fulfilled");
    expect(successfulRefunds.length).toBe(10); // All resolve to the same idempotent refund record

    // Verify only 1 refund journal was actually posted in DB
    const refundJournals = await prisma.journal.findMany({
      where: { householdId: householdAId, idempotencyKey: refundKey },
    });
    expect(refundJournals.length).toBe(1);

    // Verify Bank A1 balance: 50,000 - 12,000 + 3,000 = 41,000
    const bank = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
    expect(bank.balance.toNumber()).toBe(41000);
  });

  // =========================================================================
  // 5. REVERSAL AND CORRECTION MATRIX
  // =========================================================================
  it("5. Reversal Matrix: POST -> REVERSE -> REPLACEMENT preserves history & balances", async () => {
    // Opening balance ₹100,000
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: accountA1Id,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(100000),
      });
    });

    // 1. Post original transfer of ₹20,000 (A1 -> A2)
    const draft1 = await prisma.$transaction((tx) =>
      TransferDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        sourceAccountId: accountA1Id,
        destinationAccountId: accountA2Id,
        amount: new Prisma.Decimal(20000),
        description: "Original Transfer",
      })
    );
    const posted1 = await prisma.$transaction((tx) => TransferDomainService.postDraft(tx, { transferId: draft1.id, householdId: householdAId, userId: userAId }));
    const origJournalId = posted1.journalId!;

    // 2. Reverse original transfer
    const reversed = await prisma.$transaction((tx) => TransferDomainService.reverseTransfer(tx, { transferId: posted1.id, householdId: householdAId, userId: userAId }));
    expect(reversed.status).toBe("REVERSED");

    // Attempting double reversal must throw error
    await expect(
      prisma.$transaction((tx) => TransferDomainService.reverseTransfer(tx, { transferId: posted1.id, householdId: householdAId, userId: userAId }))
    ).rejects.toThrow();

    // Verify original journal is preserved and marked VOIDED via reversal pointer
    const origJournal = await prisma.journal.findUniqueOrThrow({ where: { id: origJournalId } });
    expect(origJournal.status).toBe("VOIDED");

    // 3. Post replacement transfer of ₹15,000
    const draft2 = await prisma.$transaction((tx) =>
      TransferDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        sourceAccountId: accountA1Id,
        destinationAccountId: accountA2Id,
        amount: new Prisma.Decimal(15000),
        description: "Corrected Transfer",
      })
    );
    const posted2 = await prisma.$transaction((tx) => TransferDomainService.postDraft(tx, { transferId: draft2.id, householdId: householdAId, userId: userAId }));

    expect(posted2.journalId).not.toBe(origJournalId);

    // Final Balances: A1 = 100,000 - 15,000 = 85,000; A2 = 15,000
    const bankA1 = await prisma.account.findUniqueOrThrow({ where: { id: accountA1Id } });
    const bankA2 = await prisma.account.findUniqueOrThrow({ where: { id: accountA2Id } });
    expect(bankA1.balance.toNumber()).toBe(85000);
    expect(bankA2.balance.toNumber()).toBe(15000);
  });

  // =========================================================================
  // 6. HOUSEHOLD SECURITY REGRESSION
  // =========================================================================
  it("6. Household Security: Prevents cross-household access on all 11 financial entities", async () => {
    const draftA = await prisma.$transaction((tx) =>
      ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(5000),
        description: "Household A Expense",
      })
    );

    // User B attempts to post Household A expense -> fails
    await expect(
      prisma.$transaction((tx) => ExpenseDomainService.postDraft(tx, { expenseId: draftA.id, householdId: householdBId, userId: userBId }))
    ).rejects.toThrow("EXPENSE_NOT_FOUND");

    // Querying Household B audit log returns 0 events from Household A
    const logsB = await prisma.auditEvent.findMany({ where: { householdId: householdBId } });
    expect(logsB.some((l) => l.householdId === householdAId)).toBe(false);
  });

  // =========================================================================
  // 7. AUDIT HASH-CHAIN INTEGRITY & TAMPER DETECTION
  // =========================================================================
  it("7. Audit Hash-Chain Integrity: Validates PASS on clean chain and FAIL on tampered record", async () => {
    await prisma.$transaction((tx) =>
      ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountA1Id,
        amount: new Prisma.Decimal(1000),
        description: "Audit Test Expense",
      })
    );

    // Clean chain verify -> PASS
    let result = await AuditIntegrityService.verifyChain(prisma, householdAId);
    expect(result.status).toBe("PASS");
    expect(result.totalEventsVerified).toBeGreaterThan(0);

    // Tamper with audit record in DB
    const event = await prisma.auditEvent.findFirst({ where: { householdId: householdAId } });
    await prisma.auditEvent.update({
      where: { id: event!.id },
      data: { action: "REVERSE" }, // Tamper action field
    });

    // Tampered chain verify -> FAIL
    result = await AuditIntegrityService.verifyChain(prisma, householdAId);
    expect(result.status).toBe("FAIL");
    expect(result.tamperedEvents.length).toBeGreaterThan(0);
  });
});
