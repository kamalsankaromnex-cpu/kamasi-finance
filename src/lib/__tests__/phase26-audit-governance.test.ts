import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { ExpenseDomainService } from "@/modules/expenses/expense.service";
import { IncomeDomainService } from "@/modules/income/income.service";
import { TransferDomainService } from "@/modules/transfers/transfer.service";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { AuditService, AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

describe("Phase 2.6 Audit & Governance Engine Suite", () => {
  let householdAId: string;
  let userAId: string;
  let accountAId: string;
  let accountA2Id: string;
  let incomeSourceAId: string;

  let householdBId: string;
  let userBId: string;
  let accountBId: string;

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
      data: { email: `p26-a-${Date.now()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    const accA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Savings A", type: "BANK", balance: new Prisma.Decimal(100000) },
    });
    accountAId = accA.id;

    const accA2 = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "ICICI Savings A2", type: "BANK", balance: new Prisma.Decimal(50000) },
    });
    accountA2Id = accA2.id;

    const sourceA = await prisma.incomeSource.create({
      data: { householdId: householdAId, name: "Consulting Income A", defaultAccountId: accountAId, expectedAmount: new Prisma.Decimal(75000) },
    });
    incomeSourceAId = sourceA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p26-b-${Date.now()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const accB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "SBI Savings B", type: "BANK", balance: new Prisma.Decimal(10000) },
    });
    accountBId = accB.id;
  });

  it("1. Should generate atomic audit records on Expense domain actions (CREATE -> POST -> REFUND)", async () => {
    // Create Draft Expense
    const expense = await prisma.$transaction(async (tx) => {
      return await ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(5000),
        description: "Office Furniture",
      });
    });

    let auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].entityType).toBe("EXPENSE");
    expect(auditLogs[0].entityId).toBe(expense.id);
    expect(auditLogs[0].action).toBe("CREATE");
    expect(auditLogs[0].toState).toBe("DRAFT");
    expect(auditLogs[0].actorUserId).toBe(userAId);

    // Post Expense
    const posted = await prisma.$transaction(async (tx) => {
      return await ExpenseDomainService.postDraft(tx, {
        expenseId: expense.id,
        householdId: householdAId,
        userId: userAId,
      });
    });

    auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditLogs.length).toBe(3);
    const postAudit = auditLogs.find((a) => a.action === "POST" && a.entityType === "EXPENSE");
    expect(postAudit).toBeDefined();
    expect(postAudit?.fromState).toBe("DRAFT");
    expect(postAudit?.toState).toBe("POSTED");

    const journalAudit = auditLogs.find((a) => a.action === "JOURNAL_POSTED");
    expect(journalAudit).toBeDefined();
    expect(journalAudit?.entityType).toBe("JOURNAL");
    expect(journalAudit?.entityId).toBe(posted.journalId);

    // Refund Expense
    const refundedTx = await prisma.$transaction(async (tx) => {
      return await ExpenseDomainService.refundExpense(tx, {
        expenseId: expense.id,
        householdId: householdAId,
        userId: userAId,
        amount: new Prisma.Decimal(5000),
        description: "Returned items",
      });
    });

    auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });
    const refundAudit = auditLogs.find((a) => a.action === "REFUND" && a.entityType === "EXPENSE");
    expect(refundAudit).toBeDefined();
  });

  it("2. Should generate atomic audit records on Income domain actions (EXPECTED -> CONFIRMED -> CREDITED)", async () => {
    const inc = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.createExpected(tx, {
        householdId: householdAId,
        incomeSourceId: incomeSourceAId,
        name: "Client Consulting Fee",
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
        dueDate: new Date("2026-10-31"),
        expectedAmount: new Prisma.Decimal(75000),
        userId: userAId,
      });
    });

    const confirmed = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.confirm(tx, {
        incomeOccurrenceId: inc.id,
        householdId: householdAId,
        userId: userAId,
      });
    });

    const credited = await prisma.$transaction(async (tx) => {
      return await IncomeDomainService.credit(tx, {
        incomeOccurrenceId: inc.id,
        householdId: householdAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(75000),
        userId: userAId,
      });
    });

    const auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });

    expect(credited.status).toBe("CREDITED");
    expect(auditLogs.some((a) => a.action === "CREATE" && a.toState === "EXPECTED")).toBe(true);
    expect(auditLogs.some((a) => a.action === "CONFIRM" && a.toState === "CONFIRMED")).toBe(true);
    expect(auditLogs.some((a) => a.action === "CREDIT" && a.toState === "CREDITED")).toBe(true);
    expect(auditLogs.some((a) => a.action === "JOURNAL_POSTED")).toBe(true);
  });

  it("3. Should generate atomic audit records on Transfer domain actions (POST -> REVERSE)", async () => {
    const draftTransfer = await prisma.$transaction(async (tx) => {
      return await TransferDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        sourceAccountId: accountAId,
        destinationAccountId: accountA2Id,
        amount: new Prisma.Decimal(15000),
        description: "Savings allocation",
      });
    });

    const transfer = await prisma.$transaction(async (tx) => {
      return await TransferDomainService.postDraft(tx, {
        transferId: draftTransfer.id,
        householdId: householdAId,
        userId: userAId,
      });
    });

    let auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });

    const transferAudit = auditLogs.find((a) => a.action === "TRANSFER_POSTED");
    expect(transferAudit).toBeDefined();
    expect(transferAudit?.entityType).toBe("TRANSFER");
    expect(transferAudit?.entityId).toBe(transfer.id);

    // Reverse Transfer
    await prisma.$transaction(async (tx) => {
      await TransferDomainService.reverseTransfer(tx, {
        transferId: transfer.id,
        householdId: householdAId,
        userId: userAId,
      });
    });

    auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });

    expect(auditLogs.some((a) => a.action === "REVERSE" && a.entityType === "TRANSFER")).toBe(true);
    expect(auditLogs.some((a) => a.action === "JOURNAL_REVERSED")).toBe(true);
  });

  it("4. Should generate atomic audit records on Goal domain actions (CREATE -> CONTRIBUTE -> WITHDRAW -> PAUSE -> RESUME -> ARCHIVE)", async () => {
    const goal = await prisma.$transaction(async (tx) => {
      return await GoalDomainService.createGoal(tx, {
        householdId: householdAId,
        userId: userAId,
        name: "Emergency Fund",
        targetAmount: new Prisma.Decimal(100000),
        targetDate: new Date("2026-12-31"),
      });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.depositToGoal(tx, {
        goalId: goal.id,
        householdId: householdAId,
        userId: userAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(25000),
      });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.withdrawFromGoal(tx, {
        goalId: goal.id,
        householdId: householdAId,
        userId: userAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(5000),
      });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.pauseGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.resumeGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
    });

    await prisma.$transaction(async (tx) => {
      await GoalDomainService.archiveGoal(tx, { goalId: goal.id, householdId: householdAId, userId: userAId });
    });

    const auditLogs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });

    expect(auditLogs.some((a) => a.action === "CREATE" && a.entityType === "GOAL")).toBe(true);
    expect(auditLogs.some((a) => a.action === "CONTRIBUTION" && a.entityType === "GOAL")).toBe(true);
    expect(auditLogs.some((a) => a.action === "WITHDRAWAL" && a.entityType === "GOAL")).toBe(true);
    expect(auditLogs.some((a) => a.action === "PAUSE" && a.toState === "PAUSED")).toBe(true);
    expect(auditLogs.some((a) => a.action === "RESUME" && a.toState === "ACTIVE")).toBe(true);
    expect(auditLogs.some((a) => a.action === "ARCHIVE" && a.toState === "ARCHIVED")).toBe(true);
  });

  it("5. Should enforce strict multi-tenant household isolation for audit trails", async () => {
    await prisma.$transaction(async (tx) => {
      await ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(1000),
        description: "Household A Expense",
      });
    });

    await prisma.$transaction(async (tx) => {
      await ExpenseDomainService.createDraft(tx, {
        householdId: householdBId,
        userId: userBId,
        accountId: accountBId,
        amount: new Prisma.Decimal(2000),
        description: "Household B Expense",
      });
    });

    const logsA = await prisma.auditEvent.findMany({ where: { householdId: householdAId } });
    const logsB = await prisma.auditEvent.findMany({ where: { householdId: householdBId } });

    expect(logsA.length).toBe(1);
    expect(logsB.length).toBe(1);
    expect(logsA[0].householdId).toBe(householdAId);
    expect(logsB[0].householdId).toBe(householdBId);
    expect(logsA.some((l) => l.householdId === householdBId)).toBe(false);
  });

  it("6. Should verify SHA-256 cryptographic hash chain integrity and detect tampering", async () => {
    // Perform multiple operations to build a chain
    const exp = await prisma.$transaction(async (tx) => {
      return await ExpenseDomainService.createDraft(tx, {
        householdId: householdAId,
        userId: userAId,
        accountId: accountAId,
        amount: new Prisma.Decimal(3000),
        description: "Groceries",
      });
    });

    await prisma.$transaction(async (tx) => {
      await ExpenseDomainService.postDraft(tx, {
        expenseId: exp.id,
        householdId: householdAId,
        userId: userAId,
      });
    });

    // 1. Check clean chain integrity
    let verify = await AuditIntegrityService.verifyChain(prisma, householdAId);
    expect(verify.status).toBe("PASS");
    expect(verify.totalEventsVerified).toBeGreaterThan(0);
    expect(verify.tamperedEvents.length).toBe(0);

    // 2. Simulate tampering: modify an event's metadata directly in DB
    const firstEvent = await prisma.auditEvent.findFirst({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });
    expect(firstEvent).toBeDefined();

    await prisma.auditEvent.update({
      where: { id: firstEvent!.id },
      data: { metadataJson: JSON.stringify({ tampered: true }) },
    });

    // 3. Check verifyChain detects the tamper
    verify = await AuditIntegrityService.verifyChain(prisma, householdAId);
    expect(verify.status).toBe("FAIL");
    expect(verify.tamperedEvents.length).toBeGreaterThan(0);
    expect(verify.tamperedEvents[0].eventId).toBe(firstEvent!.id);
  });

  it("7. Should record security and idempotency events correctly", async () => {
    await prisma.$transaction(async (tx) => {
      await AuditService.recordSecurityEvent(tx, {
        householdId: householdAId,
        entityType: "HOUSEHOLD",
        entityId: householdBId,
        action: "CROSS_HOUSEHOLD_ACCESS_DENIED",
        actorUserId: userAId,
        reason: "User A attempted to access Household B resources",
      });

      await AuditService.recordSecurityEvent(tx, {
        householdId: householdAId,
        entityType: "TRANSACTION",
        entityId: "tx-123",
        action: "IDEMPOTENCY_REPLAY",
        actorUserId: userAId,
        reason: "Duplicate request key detected",
      });
    });

    const logs = await prisma.auditEvent.findMany({
      where: { householdId: householdAId },
      orderBy: { createdAt: "asc" },
    });

    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe("CROSS_HOUSEHOLD_ACCESS_DENIED");
    expect(logs[1].action).toBe("IDEMPOTENCY_REPLAY");
  });

  it("8. Should rollback audit log atomically when a transaction fails", async () => {
    const initialCount = await prisma.auditEvent.count({ where: { householdId: householdAId } });

    await expect(
      prisma.$transaction(async (tx) => {
        await AuditService.record(tx, {
          householdId: householdAId,
          entityType: "EXPENSE",
          entityId: "exp-failed",
          action: "CREATE",
          actorUserId: userAId,
        });

        // Intentional error to trigger rollback
        throw new Error("Simulated Domain Failure");
      })
    ).rejects.toThrow("Simulated Domain Failure");

    const finalCount = await prisma.auditEvent.count({ where: { householdId: householdAId } });
    expect(finalCount).toBe(initialCount);
  });
});
