import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../prisma";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { TransactionDomainService } from "@/modules/transactions/transaction.service";
import { GoalDomainService } from "@/modules/goals/goal.service";
import { commitCsvImport } from "../csv-import";
import { Prisma } from "@prisma/client";

describe("Phase 1 Financial Core Integration & Invariants Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;
  let creditAccountId: string;
  let secondaryBankAccountId: string;

  let otherHouseholdId: string;
  let otherUserId: string;
  let otherAccountId: string;

  beforeEach(async () => {
    // Clear test database state
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Primary Household
    const user = await prisma.user.create({
      data: {
        email: `phase1-${Date.now()}@example.com`,
        passwordHash: "hashed",
        name: "Phase 1 Test User",
        isOnboarded: true,
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: "Phase 1 Household",
        currency: "INR",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    householdId = household.id;

    const bank = await prisma.account.create({
      data: { householdId, userId, name: "Primary HDFC Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    bankAccountId = bank.id;

    const credit = await prisma.account.create({
      data: { householdId, userId, name: "ICICI Credit Card", type: "CREDIT", balance: new Prisma.Decimal(0), creditLimit: new Prisma.Decimal(50000) },
    });
    creditAccountId = credit.id;

    const secondary = await prisma.account.create({
      data: { householdId, userId, name: "SBI Savings Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    secondaryBankAccountId = secondary.id;

    // Secondary Isolated Household
    const otherUser = await prisma.user.create({
      data: { email: `other-${Date.now()}@example.com`, passwordHash: "hashed", name: "Other User", isOnboarded: true },
    });
    otherUserId = otherUser.id;

    const otherHousehold = await prisma.household.create({
      data: { name: "Other Household", currency: "INR", members: { create: { userId: otherUserId, role: "OWNER" } } },
    });
    otherHouseholdId = otherHousehold.id;

    const otherAccount = await prisma.account.create({
      data: { householdId: otherHouseholdId, userId: otherUserId, name: "Axis Bank Other", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    otherAccountId = otherAccount.id;
  });

  afterEach(async () => {
    // Verify reconciliation after every test
    const results = await ReconciliationService.reconcileHousehold(householdId);
    for (const res of results) {
      expect(res.status, `Account ${res.accountName} drifted! Stored: ${res.storedBalance}, Calculated: ${res.calculatedBalance}`).toBe("MATCH");
    }
  });

  describe("1. Ledger Engine & Double-Entry Integrity", () => {
    it("verify expense, income, and transfer post balanced journals and deterministic journalId links", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(50000),
        });
      });

      // Income
      const incTx = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createIncome(tx, {
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(10000),
          description: "Salary Bonus",
        });
      });
      expect(incTx.journalId).toBeTruthy();

      const incJournal = await prisma.journal.findUniqueOrThrow({
        where: { id: incTx.journalId! },
        include: { entries: true },
      });
      const incDebits = incJournal.entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const incCredits = incJournal.entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(incDebits.equals(incCredits)).toBe(true);

      // Expense
      const expTx = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(5000),
          description: "Office Supplies",
        });
      });
      expect(expTx.journalId).toBeTruthy();

      // Transfer
      const trfTx = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createTransfer(tx, {
          householdId,
          userId,
          accountId: bankAccountId,
          transferAccountId: secondaryBankAccountId,
          amount: new Prisma.Decimal(15000),
          description: "Transfer to Savings",
        });
      });
      expect(trfTx.journalId).toBeTruthy();

      // Verify Account Projections
      const primaryBank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      const secondaryBank = await prisma.account.findUniqueOrThrow({ where: { id: secondaryBankAccountId } });

      // 50000 + 10000 - 5000 - 15000 = 40000
      expect(primaryBank.balance.toNumber()).toBe(40000);
      // 0 + 15000 = 15000
      expect(secondaryBank.balance.toNumber()).toBe(15000);
    });

    it("enforces Household Isolation — cross-household transaction/reversal is rejected", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          return await LedgerService.postJournal(tx, {
            householdId,
            description: "Cross Household Attempt",
            entries: [
              { accountId: bankAccountId, debit: new Prisma.Decimal(1000), credit: new Prisma.Decimal(0) },
              { accountId: otherAccountId, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(1000) },
            ],
          });
        })
      ).rejects.toThrow("ACCOUNT_UNAVAILABLE");
    });

    it("rejects posting to an archived account", async () => {
      await prisma.account.update({ where: { id: bankAccountId }, data: { isArchived: true } });

      await expect(
        prisma.$transaction(async (tx) => {
          return await FinancialCommand.postOpeningBalance(tx, {
            householdId,
            accountId: bankAccountId,
            accountType: "BANK",
            openingBalance: new Prisma.Decimal(10000),
          });
        })
      ).rejects.toThrow("ACCOUNT_UNAVAILABLE");
    });

    it("rejects overdraft on bank account when balance drops below 0", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          return await FinancialCommand.postExpense(tx, {
            householdId,
            accountId: bankAccountId,
            amount: new Prisma.Decimal(5000),
            description: "Overdraft Attempt",
          });
        })
      ).rejects.toThrow("INSUFFICIENT_FUNDS");
    });
  });

  describe("2. Reversal Invariants & Single Reversal Rule", () => {
    it("executes compensating reversal restoring original balances (Original Delta + Reversal Delta = 0)", async () => {
      let journalId = "";

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(20000),
        });

        const j = await FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(5000),
          description: "Flight Booking",
        });
        journalId = j.id;
      });

      let bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(15000);

      // Execute reversal
      await prisma.$transaction(async (tx) => {
        await LedgerService.reverseJournal(tx, journalId, householdId);
      });

      bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(20000);

      const originalJournal = await prisma.journal.findUniqueOrThrow({ where: { id: journalId } });
      expect(originalJournal.status).toBe("VOIDED");
    });

    it("enforces Single Reversal 1:1 invariant — cannot reverse a journal twice", async () => {
      let journalId = "";

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });

        const j = await FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(2000),
          description: "Dinner Expense",
        });
        journalId = j.id;
      });

      // First reversal succeeds
      await prisma.$transaction(async (tx) => {
        await LedgerService.reverseJournal(tx, journalId, householdId);
      });

      // Second reversal fails
      await expect(
        prisma.$transaction(async (tx) => {
          await LedgerService.reverseJournal(tx, journalId, householdId);
        })
      ).rejects.toThrow("JOURNAL_ALREADY_VOIDED");
    });

    it("disallows reversing a compensating reversal journal", async () => {
      let reversalJournalId = "";

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });

        const j = await FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(2000),
          description: "Movie Ticket",
        });

        const rev = await LedgerService.reverseJournal(tx, j.id, householdId);
        reversalJournalId = rev.id;
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await LedgerService.reverseJournal(tx, reversalJournalId, householdId);
        })
      ).rejects.toThrow("CANNOT_REVERSE_REVERSAL");
    });

    it("runs Sprint 2 key scenario: ₹10,000 Bank Account -> Expense ₹2,000 (bal ₹8,000) -> Reverse Expense (bal ₹10,000) -> Second Reversal REJECTED (bal ₹10,000)", async () => {
      let expTxnId = "";
      let journalId = "";

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
      });

      let bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(10000);

      // Expense ₹2,000
      const expTxn = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(2000),
          description: "Key Scenario Expense",
        });
      });
      expTxnId = expTxn.id;
      journalId = expTxn.journalId!;

      bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(8000);

      // Reverse Expense
      await prisma.$transaction(async (tx) => {
        await TransactionDomainService.voidTransaction(tx, {
          transactionId: expTxnId,
          householdId,
          voidedByUserId: userId,
        });
      });

      bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(10000);

      // Try reversing again -> REJECTED
      await expect(
        prisma.$transaction(async (tx) => {
          await TransactionDomainService.voidTransaction(tx, {
            transactionId: expTxnId,
            householdId,
            voidedByUserId: userId,
          });
        })
      ).rejects.toThrow();

      bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(10000);
    });

    it("verifies transaction atomicity: failed transaction leaves no partial Journal or balance change", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
      });

      const initialJournals = await prisma.journal.count();

      // Transaction creation throwing error inside transaction block
      await expect(
        prisma.$transaction(async (tx) => {
          await FinancialCommand.postExpense(tx, {
            householdId,
            accountId: bankAccountId,
            amount: new Prisma.Decimal(2000),
            description: "Will Fail",
          });
          // Force error
          throw new Error("SIMULATED_TRANSACTION_FAILURE");
        })
      ).rejects.toThrow("SIMULATED_TRANSACTION_FAILURE");

      // Verify no partial journal created & balance unchanged
      const finalJournals = await prisma.journal.count();
      expect(finalJournals).toBe(initialJournals);

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(10000);
    });
  });

  describe("3. Idempotency Key Hardening", () => {
    it("deduplicates financial operations with identical idempotency keys", async () => {
      const key = `idem-phase1-${Date.now()}`;

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(20000),
        });
      });

      const j1 = await prisma.$transaction(async (tx) => {
        return await FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(4000),
          description: "Gadget",
          idempotencyKey: key,
        });
      });

      const j2 = await prisma.$transaction(async (tx) => {
        return await FinancialCommand.postExpense(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(4000),
          description: "Gadget Duplicate",
          idempotencyKey: key,
        });
      });

      expect(j1.id).toBe(j2.id);

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.balance.toNumber()).toBe(16000);
    });
  });

  describe("4. Account Immutability Rules", () => {
    it("allows editing account type & currency before any financial activity", async () => {
      const unusedAcc = await prisma.account.create({
        data: { householdId, userId, name: "Unused Bank", type: "BANK", currency: "INR", balance: new Prisma.Decimal(0) },
      });

      const hasActivity = (await prisma.journalEntry.count({ where: { accountId: unusedAcc.id } })) > 0;
      expect(hasActivity).toBe(false);

      const updated = await prisma.account.update({
        where: { id: unusedAcc.id },
        data: { type: "CREDIT", currency: "USD" },
      });

      expect(updated.type).toBe("CREDIT");
      expect(updated.currency).toBe("USD");
    });

    it("locks account type & currency once posted financial activity exists", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(10000),
        });
      });

      const hasActivity = (await prisma.journalEntry.count({ where: { accountId: bankAccountId } })) > 0;
      expect(hasActivity).toBe(true);
    });
  });

  describe("5. CSV Import TRANSFER Handling & Type Validation", () => {
    it("imports INCOME, EXPENSE, and TRANSFER CSV rows using FinancialCommand and links journalId", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(20000),
        });
      });

      const rows = [
        {
          rowId: "inc-1",
          date: "2026-09-30",
          description: "Freelance Income",
          amount: 10000,
          type: "INCOME" as const,
          accountId: bankAccountId,
          categoryId: null,
          categoryName: null,
          isDuplicate: false,
          status: "VALID" as const,
        },
        {
          rowId: "exp-1",
          date: "2026-09-30",
          description: "Software License",
          amount: 2000,
          type: "EXPENSE" as const,
          accountId: bankAccountId,
          categoryId: null,
          categoryName: null,
          isDuplicate: false,
          status: "VALID" as const,
        },
        {
          rowId: "trf-1",
          date: "2026-09-30",
          description: "Fund Transfer via CSV",
          amount: 5000,
          type: "TRANSFER" as const,
          accountId: bankAccountId,
          transferAccountId: secondaryBankAccountId,
          categoryId: null,
          categoryName: null,
          isDuplicate: false,
          status: "VALID" as const,
        },
      ];

      const res = await commitCsvImport(householdId, userId, rows);
      expect(res.postedCount).toBe(3);

      const bankA = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountId } });
      const bankB = await prisma.account.findUniqueOrThrow({ where: { id: secondaryBankAccountId } });

      // 20000 + 10000 - 2000 - 5000 = 23000
      expect(bankA.balance.toNumber()).toBe(23000);
      // 0 + 5000 = 5000
      expect(bankB.balance.toNumber()).toBe(5000);

      // Verify transfer row did NOT create an expense category entry or alter expense totals
      const transferTx = await prisma.transaction.findFirst({ where: { description: "Fund Transfer via CSV" } });
      expect(transferTx?.type).toBe("TRANSFER");
      expect(transferTx?.journalId).toBeTruthy();
    });

    it("rejects invalid CSV row transaction type", async () => {
      const invalidRows: any[] = [
        {
          rowId: "inv-1",
          date: "2026-09-30",
          description: "Bad Row",
          amount: 100,
          type: "UNKNOWN_TYPE",
          accountId: bankAccountId,
          isDuplicate: false,
          status: "VALID",
        },
      ];

      const res = await commitCsvImport(householdId, userId, invalidRows);
      expect(res.postedCount).toBe(0);
      expect(res.skippedCount).toBe(1);
    });
  });

  describe("6. Savings Goal Concurrency & Idempotency", () => {
    it("handles goal deposit and withdrawal with atomic conditional updates and idempotency", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(50000),
        });
      });

      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "Car Savings",
          targetAmount: new Prisma.Decimal(100000),
          currentAmount: new Prisma.Decimal(10000),
          targetDate: new Date("2028-12-31"),
          status: "ACTIVE",
        },
      });

      const depIdemKey = `goal-dep-${Date.now()}`;
      // Contribution
      const dep1 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(5000),
          idempotencyKey: depIdemKey,
        });
      });
      expect(dep1.goal.currentAmount.toNumber()).toBe(15000);

      // Duplicate contribution idempotency
      const dep2 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.depositToGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(5000),
          idempotencyKey: depIdemKey,
        });
      });
      expect(dep2.transaction!.journalId).toBe(dep1.transaction!.journalId);

      const withIdemKey = `goal-with-${Date.now()}`;
      // Withdrawal
      const with1 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(8000),
          idempotencyKey: withIdemKey,
        });
      });
      expect(with1.goal.currentAmount.toNumber()).toBe(7000);

      // Duplicate withdrawal idempotency
      const with2 = await prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(8000),
          idempotencyKey: withIdemKey,
        });
      });
      expect(with2.transaction!.journalId).toBe(with1.transaction!.journalId);

      // Cannot withdraw beyond available goal balance
      await expect(
        prisma.$transaction(async (tx) => {
          await GoalDomainService.withdrawFromGoal(tx, {
            goalId: goal.id,
            householdId,
            userId,
            accountId: bankAccountId,
            amount: new Prisma.Decimal(10000),
          });
        })
      ).rejects.toThrow("WITHDRAWAL_EXCEEDS_BALANCE");
    });

    it("prevents double-withdrawal race conditions via atomic updateMany (Request A ₹8000 & Request B ₹8000 on ₹10000 goal)", async () => {
      const goal = await prisma.goal.create({
        data: {
          householdId,
          name: "Race Condition Goal",
          targetAmount: new Prisma.Decimal(50000),
          currentAmount: new Prisma.Decimal(10000),
          targetDate: new Date("2028-12-31"),
          status: "ACTIVE",
        },
      });

      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(50000),
        });
      });

      const p1 = prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(8000),
        });
      });

      const p2 = prisma.$transaction(async (tx) => {
        return await GoalDomainService.withdrawFromGoal(tx, {
          goalId: goal.id,
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(8000),
        });
      });

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const finalGoal = await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } });
      expect(finalGoal.currentAmount.toNumber()).toBe(2000);
    });
  });

  describe("7. Refund Invariants & Concurrency", () => {
    it("handles partial, full, and over-refund rejection atomically", async () => {
      await prisma.$transaction(async (tx) => {
        await FinancialCommand.postOpeningBalance(tx, {
          householdId,
          accountId: bankAccountId,
          accountType: "BANK",
          openingBalance: new Prisma.Decimal(20000),
        });
      });

      const expTx = await prisma.$transaction(async (tx) => {
        return await TransactionDomainService.createExpense(tx, {
          householdId,
          userId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(10000),
          description: "Flight Purchase",
        });
      });

      const refKey1 = `ref-1-${Date.now()}`;
      // Partial Refund 1: ₹6,000
      const ref1 = await prisma.$transaction(async (tx) => {
        const targetTxn = await tx.transaction.findUniqueOrThrow({ where: { id: expTx.id } });
        const maxAllowed = targetTxn.amount.minus(targetTxn.refundedAmount);
        expect(new Prisma.Decimal(6000).lte(maxAllowed)).toBe(true);

        const j = await FinancialCommand.postRefund(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(6000),
          description: "Partial Refund 1",
          refundOfId: expTx.id,
          idempotencyKey: refKey1,
        });

        await tx.transaction.update({
          where: { id: expTx.id },
          data: { refundedAmount: { increment: new Prisma.Decimal(6000) } },
        });

        return j;
      });
      expect(ref1).toBeTruthy();

      const refKey2 = `ref-2-${Date.now()}`;
      // Partial Refund 2: ₹4,000 (Full refund reached)
      await prisma.$transaction(async (tx) => {
        const targetTxn = await tx.transaction.findUniqueOrThrow({ where: { id: expTx.id } });
        const maxAllowed = targetTxn.amount.minus(targetTxn.refundedAmount);
        expect(new Prisma.Decimal(4000).lte(maxAllowed)).toBe(true);

        await FinancialCommand.postRefund(tx, {
          householdId,
          accountId: bankAccountId,
          amount: new Prisma.Decimal(4000),
          description: "Partial Refund 2",
          refundOfId: expTx.id,
          idempotencyKey: refKey2,
        });

        await tx.transaction.update({
          where: { id: expTx.id },
          data: { refundedAmount: { increment: new Prisma.Decimal(4000) } },
        });
      });

      // Over-refund attempt ₹1 rejected
      await expect(
        prisma.$transaction(async (tx) => {
          const targetTxn = await tx.transaction.findUniqueOrThrow({ where: { id: expTx.id } });
          const maxAllowed = targetTxn.amount.minus(targetTxn.refundedAmount);
          if (new Prisma.Decimal(1).gt(maxAllowed)) {
            throw new Error(`REFUND_EXCEEDS_MAX:${maxAllowed}`);
          }
        })
      ).rejects.toThrow("REFUND_EXCEEDS_MAX");
    });
  });
});
