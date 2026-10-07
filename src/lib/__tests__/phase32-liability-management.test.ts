import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { LiabilityDomainService } from "@/modules/liabilities/liability.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { AuditService, AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

describe("Phase 3.2 — Liability Management Suite", () => {
  let householdAId: string;
  let userAId: string;
  let bankAccountAId: string;
  let liabilityAccountAId: string;
  let expenseAccountAId: string;

  let householdBId: string;
  let userBId: string;
  let bankAccountBId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.liabilityLifecycleHistory.deleteMany();
    await prisma.liabilityFinancialEvent.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p32-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    // Bank Account A (Opening Balance: ₹20,00,000)
    const bankA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Main Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    bankAccountAId = bankA.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: bankAccountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(2000000),
      });
    });

    // Liability Account A (Type: LOAN)
    const liabAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Home Loan Account Ledger", type: "LOAN", balance: new Prisma.Decimal(0) },
    });
    liabilityAccountAId = liabAccA.id;

    // Interest Expense Account A
    const expAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Interest Expense Account", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    expenseAccountAId = expAccA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p32-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const bankB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "ICICI Bank B", type: "BANK", balance: new Prisma.Decimal(100000) },
    });
    bankAccountBId = bankB.id;
  });

  // =========================================================================
  // 1. LIFECYCLE & STATE MACHINE OPERATIONS
  // =========================================================================
  describe("1. Lifecycle & State Machine Operations", () => {
    it("creates draft liability without changing balances or creating journals", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "SBI Home Loan",
          category: "MORTGAGE",
          principalAmount: new Prisma.Decimal(1000000),
          interestRate: new Prisma.Decimal(8.5),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      expect(draft.status).toBe("DRAFT");
      expect(draft.borrowJournalId).toBeNull();
      expect(draft.outstandingAmount.toNumber()).toBe(1000000);

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(2000000);

      const journalsCount = await prisma.journal.count({ where: { householdId: householdAId } });
      // Only initial opening balance journal exists
      expect(journalsCount).toBe(1);
    });

    it("borrows liability (DRAFT -> ACTIVE) with double-entry ledger posting", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "SBI Home Loan",
          category: "MORTGAGE",
          principalAmount: new Prisma.Decimal(1000000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      const { liability, financialEvent, journal } = await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      expect(liability.status).toBe("ACTIVE");
      expect(liability.borrowJournalId).toBe(journal!.id);
      expect(financialEvent.eventType).toBe("BORROW");
      expect(financialEvent.totalAmount.toNumber()).toBe(1000000);

      // Receiving Bank account should increase by ₹10,00,000 (from ₹20,00,000 to ₹30,00,000)
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(3000000);

      // Liability account balance should reflect credit (+₹10,00,000)
      const liabAcc = await prisma.account.findUniqueOrThrow({ where: { id: liabilityAccountAId } });
      expect(liabAcc.balance.toNumber()).toBe(1000000);
    });

    it("handles partial repayment (ACTIVE -> PARTIALLY_SETTLED)", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "SBI Personal Loan",
          category: "LOAN",
          principalAmount: new Prisma.Decimal(500000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      const { liability, financialEvent } = await prisma.$transaction((tx) =>
        LiabilityDomainService.repayLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          principalAmount: new Prisma.Decimal(200000),
          payingAccountId: bankAccountAId,
        })
      );

      expect(liability.status).toBe("PARTIALLY_SETTLED");
      expect(liability.outstandingAmount.toNumber()).toBe(300000);
      expect(financialEvent.eventType).toBe("REPAYMENT");
      expect(financialEvent.principalAmount.toNumber()).toBe(200000);

      // Bank account should decrease by ₹2,00,000 (from ₹25,00,000 to ₹23,00,000)
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(2300000);
    });

    it("accrues interest without bank movement or principal reduction", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Business Expansion Loan",
          category: "LOAN",
          principalAmount: new Prisma.Decimal(400000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      const bankBefore = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });

      const { liability, financialEvent } = await prisma.$transaction((tx) =>
        LiabilityDomainService.accrueInterest(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          interestAmount: new Prisma.Decimal(12000),
          expenseAccountId: expenseAccountAId,
        })
      );

      expect(liability.status).toBe("ACTIVE");
      expect(liability.outstandingAmount.toNumber()).toBe(400000); // Principal unchanged
      expect(financialEvent.eventType).toBe("INTEREST_ACCRUED");
      expect(financialEvent.interestAmount.toNumber()).toBe(12000);

      // Bank balance must remain completely unchanged
      const bankAfter = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bankAfter.balance.toNumber()).toBe(bankBefore.balance.toNumber());
    });

    it("auto-settles liability when outstandingAmount reaches 0", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Hand Loan",
          category: "PERSONAL_DEBT",
          principalAmount: new Prisma.Decimal(100000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      // Single full repayment of ₹1,00,000
      const { liability } = await prisma.$transaction((tx) =>
        LiabilityDomainService.repayLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          principalAmount: new Prisma.Decimal(100000),
          payingAccountId: bankAccountAId,
        })
      );

      expect(liability.status).toBe("SETTLED");
      expect(liability.outstandingAmount.toNumber()).toBe(0);
    });

    it("archives and restores liability correctly preserving state", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Temporary Debt",
          category: "OTHER",
          principalAmount: new Prisma.Decimal(50000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      const archived = await prisma.$transaction((tx) =>
        LiabilityDomainService.archiveLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
        })
      );
      expect(archived.status).toBe("ARCHIVED");

      const restored = await prisma.$transaction((tx) =>
        LiabilityDomainService.restoreLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
        })
      );
      expect(restored.status).toBe("ACTIVE");
    });
  });

  // =========================================================================
  // 2. VALIDATION BOUNDARY & INVARIANTS
  // =========================================================================
  describe("2. Validation Boundary & Financial Invariants", () => {
    it("rejects repayment principal greater than current outstanding amount", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Car Loan",
          category: "LOAN",
          principalAmount: new Prisma.Decimal(300000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      // Attempting to repay ₹4,00,000 on ₹3,00,000 outstanding
      await expect(
        prisma.$transaction((tx) =>
          LiabilityDomainService.repayLiability(tx, {
            liabilityId: draft.id,
            householdId: householdAId,
            userId: userAId,
            principalAmount: new Prisma.Decimal(400000),
            payingAccountId: bankAccountAId,
          })
        )
      ).rejects.toThrow("INVALID_REPAYMENT_AMOUNT");
    });

    it("rejects negative borrowing or repayment amounts", async () => {
      await expect(
        prisma.$transaction((tx) =>
          LiabilityDomainService.createDraft(tx, {
            householdId: householdAId,
            userId: userAId,
            name: "Invalid Loan",
            category: "LOAN",
            principalAmount: new Prisma.Decimal(-50000),
          })
        )
      ).rejects.toThrow("INVALID_AMOUNT");
    });
  });

  // =========================================================================
  // 3. IDEMPOTENCY VERIFICATION
  // =========================================================================
  describe("3. Idempotency Verification", () => {
    it("replaying borrowLiability with same idempotencyKey returns cached result without double posting", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Idempotent Loan",
          category: "LOAN",
          principalAmount: new Prisma.Decimal(200000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      const idempotencyKey = "borrow-key-12345";

      const res1 = await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
          idempotencyKey,
        })
      );

      const bankAfterFirst = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });

      const res2 = await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
          idempotencyKey,
        })
      );

      const bankAfterSecond = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });

      expect(res1.financialEvent.id).toBe(res2.financialEvent.id);
      expect(bankAfterFirst.balance.toNumber()).toBe(bankAfterSecond.balance.toNumber());
    });
  });

  // =========================================================================
  // 4. HOUSEHOLD ISOLATION
  // =========================================================================
  describe("4. Household Isolation", () => {
    it("prevents Household B from viewing or modifying Household A liability", async () => {
      const draftA = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Household A Private Debt",
          category: "LOAN",
          principalAmount: new Prisma.Decimal(100000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      // User B trying to repay User A's liability
      await expect(
        prisma.$transaction((tx) =>
          LiabilityDomainService.repayLiability(tx, {
            liabilityId: draftA.id,
            householdId: householdBId,
            userId: userBId,
            principalAmount: new Prisma.Decimal(10000),
            payingAccountId: bankAccountBId,
          })
        )
      ).rejects.toThrow("LIABILITY_NOT_FOUND");
    });
  });

  // =========================================================================
  // 5. AUDIT & HASH-CHAIN INTEGRITY
  // =========================================================================
  describe("5. Audit & Hash-Chain Integrity", () => {
    it("verifies hash-chain integrity after multiple liability lifecycle events", async () => {
      const draft = await prisma.$transaction((tx) =>
        LiabilityDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Audited Loan",
          category: "MORTGAGE",
          principalAmount: new Prisma.Decimal(600000),
          liabilityAccountId: liabilityAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.borrowLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          receivingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.repayLiability(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          principalAmount: new Prisma.Decimal(200000),
          payingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        LiabilityDomainService.accrueInterest(tx, {
          liabilityId: draft.id,
          householdId: householdAId,
          userId: userAId,
          interestAmount: new Prisma.Decimal(5000),
          expenseAccountId: expenseAccountAId,
        })
      );

      const verification = await AuditIntegrityService.verifyChain(prisma, householdAId);
      expect(verification.status).toBe("PASS");
      expect(verification.tamperedEvents.length).toBe(0);
    });
  });
});
