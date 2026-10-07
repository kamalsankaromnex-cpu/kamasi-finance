import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { AssetDomainService } from "@/modules/assets/asset.service";
import { FinancialCommand } from "@/finance/financial-command";
import { ReconciliationService } from "@/finance/reconciliation.service";
import { AuditService, AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

describe("Phase 3.1 — Asset Management Suite", () => {
  let householdAId: string;
  let userAId: string;
  let bankAccountAId: string;
  let assetAccountAId: string;

  let householdBId: string;
  let userBId: string;
  let bankAccountBId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.assetLifecycleHistory.deleteMany();
    await prisma.assetFinancialEvent.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p31-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    // Bank Account A (Opening Balance: ₹50,00,000)
    const bankA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Main HDFC Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    bankAccountAId = bankA.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: bankAccountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(5000000),
      });
    });

    // Asset Account A (Type: INVESTMENT/BANK representing physical asset ledger account)
    const assetAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Property & Land Ledger Account", type: "INVESTMENT", balance: new Prisma.Decimal(0) },
    });
    assetAccountAId = assetAccA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p31-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
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
    it("creates draft asset without changing balances or creating journals", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Agricultural Land 5 Acres",
          category: "LAND",
          initialValue: new Prisma.Decimal(2500000),
          assetAccountId: assetAccountAId,
        })
      );

      expect(draft.status).toBe("DRAFT");
      expect(draft.acquisitionJournalId).toBeNull();

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(5000000);
    });

    it("updates draft asset metadata when status is DRAFT", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Commercial Plot",
          category: "PROPERTY",
        })
      );

      const updated = await prisma.$transaction((tx) =>
        AssetDomainService.updateDraft(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          data: { name: "Updated Commercial Plot", description: "Corner plot near highway" },
        })
      );

      expect(updated.name).toBe("Updated Commercial Plot");
      expect(updated.description).toBe("Corner plot near highway");
    });

    it("executes full lifecycle: DRAFT -> ACTIVE -> DISPOSED -> ARCHIVED -> RESTORED", async () => {
      // 1. Create Draft
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Delivery Truck",
          category: "VEHICLE",
          initialValue: new Prisma.Decimal(800000),
          assetAccountId: assetAccountAId,
        })
      );
      expect(draft.status).toBe("DRAFT");

      // 2. Acquire -> ACTIVE
      const { asset: activeAsset } = await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );
      expect(activeAsset.status).toBe("ACTIVE");

      // 3. Dispose -> DISPOSED
      const { asset: disposedAsset } = await prisma.$transaction((tx) =>
        AssetDomainService.disposeAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          proceeds: new Prisma.Decimal(900000),
          receivingAccountId: bankAccountAId,
        })
      );
      expect(disposedAsset.status).toBe("DISPOSED");

      // 4. Archive -> ARCHIVED
      const archivedAsset = await prisma.$transaction((tx) =>
        AssetDomainService.archiveAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
        })
      );
      expect(archivedAsset.status).toBe("ARCHIVED");

      // 5. Restore -> DISPOSED (restored to previous state)
      const restoredAsset = await prisma.$transaction((tx) =>
        AssetDomainService.restoreAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
        })
      );
      expect(restoredAsset.status).toBe("DISPOSED");
    });

    it("rejects invalid lifecycle state transitions", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Office Generator",
          category: "EQUIPMENT",
          initialValue: new Prisma.Decimal(150000),
        })
      );

      // Cannot revalue or dispose DRAFT asset
      await expect(
        prisma.$transaction((tx) =>
          AssetDomainService.revalueAsset(tx, {
            assetId: draft.id,
            householdId: householdAId,
            newValue: new Prisma.Decimal(180000),
          })
        )
      ).rejects.toThrow("INVALID_ASSET_LIFECYCLE_TRANSITION");

      await expect(
        prisma.$transaction((tx) =>
          AssetDomainService.disposeAsset(tx, {
            assetId: draft.id,
            householdId: householdAId,
            proceeds: new Prisma.Decimal(150000),
          })
        )
      ).rejects.toThrow("INVALID_ASSET_LIFECYCLE_TRANSITION");
    });
  });

  // =========================================================================
  // 2. ACQUISITION ACCOUNTING
  // =========================================================================
  describe("2. Acquisition Accounting", () => {
    it("posts balanced double-entry journal and updates account balances on acquisition", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Gold Bullion 500g",
          category: "GOLD",
          initialValue: new Prisma.Decimal(3000000),
          assetAccountId: assetAccountAId,
        })
      );

      const { asset, journal } = await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
          assetAccountId: assetAccountAId,
        })
      );

      expect(asset.status).toBe("ACTIVE");
      expect(journal).toBeDefined();
      expect(asset.acquisitionJournalId).toBe(journal!.id);

      // Check Journal balance
      const journalEntries = await prisma.journalEntry.findMany({ where: { journalId: journal!.id } });
      const sumDebits = journalEntries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const sumCredits = journalEntries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(sumDebits.equals(sumCredits)).toBe(true);
      expect(sumDebits.toNumber()).toBe(3000000);

      // Check Balances: Bank decreases by 30L (50L -> 20L), Asset Account increases by 30L (0 -> 30L)
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      const assetAcc = await prisma.account.findUniqueOrThrow({ where: { id: assetAccountAId } });

      expect(bank.balance.toNumber()).toBe(2000000);
      expect(assetAcc.balance.toNumber()).toBe(3000000);
    });

    it("handles 10 parallel acquire submissions with same idempotencyKey without double posting", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Idempotent Vehicle",
          category: "VEHICLE",
          initialValue: new Prisma.Decimal(1000000),
          assetAccountId: assetAccountAId,
        })
      );

      const idempotencyKey = `acq-idem-${Date.now()}`;

      const parallelAcquires = Array.from({ length: 10 }).map(() =>
        prisma.$transaction((tx) =>
          AssetDomainService.acquireAsset(tx, {
            assetId: draft.id,
            householdId: householdAId,
            userId: userAId,
            payingAccountId: bankAccountAId,
            idempotencyKey,
          })
        )
      );

      const results = await Promise.allSettled(parallelAcquires);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(10);

      // Verify only 1 acquisition journal was created in DB
      const journals = await prisma.journal.findMany({
        where: { householdId: householdAId, idempotencyKey },
      });
      expect(journals.length).toBe(1);

      // Bank balance reduced ONCE: 50L - 10L = 40L
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(4000000);
    });
  });

  // =========================================================================
  // 3. REVALUATION ACCOUNTING
  // =========================================================================
  describe("3. Revaluation Accounting", () => {
    it("handles appreciation and depreciation revaluations with balanced journals", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Residential Apartment",
          category: "PROPERTY",
          initialValue: new Prisma.Decimal(4000000),
          assetAccountId: assetAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );

      // 1. Revaluation Appreciation (+₹10,00,000 -> New value = ₹50,00,000)
      const { asset: appreciated, journal: appJournal } = await prisma.$transaction((tx) =>
        AssetDomainService.revalueAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          newValue: new Prisma.Decimal(5000000),
          reason: "Market appreciation after highway expansion",
        })
      );

      expect(appreciated.currentValue.toNumber()).toBe(5000000);
      expect(appJournal).not.toBeNull();

      let entries = await prisma.journalEntry.findMany({ where: { journalId: appJournal!.id } });
      let sumDebits = entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      let sumCredits = entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(sumDebits.equals(sumCredits)).toBe(true);
      expect(sumDebits.toNumber()).toBe(1000000);

      // 2. Revaluation Depreciation (-₹5,00,000 -> New value = ₹45,00,000)
      const { asset: depreciated, journal: depJournal } = await prisma.$transaction((tx) =>
        AssetDomainService.revalueAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          newValue: new Prisma.Decimal(4500000),
          reason: "Building age depreciation",
        })
      );

      expect(depreciated.currentValue.toNumber()).toBe(4500000);
      expect(depJournal).not.toBeNull();

      entries = await prisma.journalEntry.findMany({ where: { journalId: depJournal!.id } });
      sumDebits = entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      sumCredits = entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(sumDebits.equals(sumCredits)).toBe(true);
      expect(sumDebits.toNumber()).toBe(500000);
    });
  });

  // =========================================================================
  // 4. DISPOSAL ACCOUNTING & GAIN/LOSS MATH
  // =========================================================================
  describe("4. Disposal Accounting & Gain/Loss Math", () => {
    it("calculates Gain on Disposal when Proceeds > Carrying Value", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Vintage Car",
          category: "VEHICLE",
          initialValue: new Prisma.Decimal(1000000),
          assetAccountId: assetAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );

      // Dispose for ₹15,00,000 (Carrying = ₹10L, Proceeds = ₹15L, Gain = ₹5L)
      const { asset: disposed, financialEvent, journal } = await prisma.$transaction((tx) =>
        AssetDomainService.disposeAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          proceeds: new Prisma.Decimal(1500000),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(disposed.status).toBe("DISPOSED");
      expect(disposed.currentValue.toNumber()).toBe(0);
      expect(financialEvent.gainOrLoss?.toNumber()).toBe(500000);

      // Verify Journal is balanced
      const entries = await prisma.journalEntry.findMany({ where: { journalId: journal.id } });
      const sumDebits = entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const sumCredits = entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(sumDebits.equals(sumCredits)).toBe(true);
      expect(sumDebits.toNumber()).toBe(1500000);

      // Bank balance updated: Initial 50L - 10L (Acq) + 15L (Proceeds) = 55L
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(5500000);
    });

    it("calculates Loss on Disposal when Proceeds < Carrying Value", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Heavy Machinery",
          category: "EQUIPMENT",
          initialValue: new Prisma.Decimal(1000000),
          assetAccountId: assetAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );

      // Dispose for ₹6,00,000 (Carrying = ₹10L, Proceeds = ₹6L, Loss = -₹4L)
      const { asset: disposed, financialEvent, journal } = await prisma.$transaction((tx) =>
        AssetDomainService.disposeAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          proceeds: new Prisma.Decimal(600000),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(disposed.status).toBe("DISPOSED");
      expect(financialEvent.gainOrLoss?.toNumber()).toBe(-400000);

      // Verify Journal is balanced (Debit Proceeds 6L + Debit Loss 4L = Credit Asset 10L)
      const entries = await prisma.journalEntry.findMany({ where: { journalId: journal.id } });
      const sumDebits = entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const sumCredits = entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      expect(sumDebits.equals(sumCredits)).toBe(true);
      expect(sumDebits.toNumber()).toBe(1000000);
    });

    it("prevents double disposal on an already disposed asset", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Used Tractor",
          category: "LIVESTOCK",
          initialValue: new Prisma.Decimal(400000),
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.disposeAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          proceeds: new Prisma.Decimal(400000),
        })
      );

      // Second disposal attempt must fail
      await expect(
        prisma.$transaction((tx) =>
          AssetDomainService.disposeAsset(tx, {
            assetId: draft.id,
            householdId: householdAId,
            userId: userAId,
            proceeds: new Prisma.Decimal(400000),
          })
        )
      ).rejects.toThrow("INVALID_ASSET_LIFECYCLE_TRANSITION");
    });
  });

  // =========================================================================
  // 5. HOUSEHOLD SECURITY REGRESSION
  // =========================================================================
  describe("5. Household Security & Isolation", () => {
    it("prevents cross-household asset access and modifications", async () => {
      const draftA = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Household A Asset",
          category: "OTHER",
          initialValue: new Prisma.Decimal(500000),
        })
      );

      // User B attempts to acquire Household A asset -> fails
      await expect(
        prisma.$transaction((tx) =>
          AssetDomainService.acquireAsset(tx, {
            assetId: draftA.id,
            householdId: householdBId,
            userId: userBId,
            payingAccountId: bankAccountBId,
          })
        )
      ).rejects.toThrow("ASSET_NOT_FOUND");
    });
  });

  // =========================================================================
  // 6. CRYPTOGRAPHIC AUDIT INTEGRITY & TAMPER DETECTION
  // =========================================================================
  describe("6. Cryptographic Audit Integrity", () => {
    it("generates append-only SHA-256 chained audit logs and detects tampering", async () => {
      const draft = await prisma.$transaction((tx) =>
        AssetDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Audit Gold Bar",
          category: "GOLD",
          initialValue: new Prisma.Decimal(1000000),
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.acquireAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          payingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        AssetDomainService.revalueAsset(tx, {
          assetId: draft.id,
          householdId: householdAId,
          userId: userAId,
          newValue: new Prisma.Decimal(1200000),
        })
      );

      // 1. Clean audit verification -> PASS
      let result = await AuditIntegrityService.verifyChain(prisma, householdAId);
      expect(result.status).toBe("PASS");
      expect(result.totalEventsVerified).toBeGreaterThan(0);

      // 2. Tamper with an audit event
      const event = await prisma.auditEvent.findFirst({ where: { householdId: householdAId } });
      await prisma.auditEvent.update({
        where: { id: event!.id },
        data: { action: "DISPOSE" },
      });

      // 3. Tampered verification -> FAIL
      result = await AuditIntegrityService.verifyChain(prisma, householdAId);
      expect(result.status).toBe("FAIL");
      expect(result.tamperedEvents.length).toBeGreaterThan(0);
    });
  });
});
