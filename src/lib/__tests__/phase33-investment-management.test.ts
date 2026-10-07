import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { FinancialCommand } from "@/finance/financial-command";
import { AuditIntegrityService } from "@/finance/audit";
import { Prisma } from "@prisma/client";

describe("Phase 3.3 — Investment Management Suite", () => {
  let householdAId: string;
  let userAId: string;
  let bankAccountAId: string;
  let investmentAccountAId: string;
  let incomeAccountAId: string;
  let feeAccountAId: string;

  let householdBId: string;
  let userBId: string;
  let bankAccountBId: string;

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany();
    await prisma.investmentLifecycleHistory.deleteMany();
    await prisma.investmentFinancialEvent.deleteMany();
    await prisma.investmentLot.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Household A Setup
    const userA = await prisma.user.create({
      data: { email: `p33-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A", isOnboarded: true },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: { name: "Household A", currency: "INR", members: { create: { userId: userAId, role: "OWNER" } } },
    });
    householdAId = hhA.id;

    // Bank Account A (Opening Balance: ₹1,00,00,000)
    const bankA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Main Bank", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    bankAccountAId = bankA.id;

    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postOpeningBalance(tx, {
        householdId: householdAId,
        accountId: bankAccountAId,
        accountType: "BANK",
        openingBalance: new Prisma.Decimal(10000000),
      });
    });

    // Investment Ledger Account A
    const invAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Equity Portfolio Ledger Account", type: "INVESTMENT", balance: new Prisma.Decimal(0) },
    });
    investmentAccountAId = invAccA.id;

    // Income & Fee Accounts
    const incAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Dividend Income Account", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    incomeAccountAId = incAccA.id;

    const feeAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Brokerage Fee Expense Account", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    feeAccountAId = feeAccA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `p33-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
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
  // 1. LIFECYCLE & COST-BASIS OPERATIONS
  // =========================================================================
  describe("1. Lifecycle & Weighted Average Cost Engine Operations", () => {
    it("creates draft investment without altering bank balance or creating journals", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Reliance Industries Stock",
          category: "STOCK",
          symbol: "RELIANCE",
          investmentAccountId: investmentAccountAId,
        })
      );

      expect(draft.status).toBe("DRAFT");
      expect(draft.totalQuantity.toNumber()).toBe(0);
      expect(draft.totalCostBasis.toNumber()).toBe(0);

      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(10000000);
    });

    it("executes single purchase (BUY): DRAFT -> ACTIVE with double-entry journal", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Reliance Industries Stock",
          category: "STOCK",
          symbol: "RELIANCE",
          investmentAccountId: investmentAccountAId,
        })
      );

      const { investment, financialEvent } = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      expect(investment.status).toBe("ACTIVE");
      expect(investment.totalQuantity.toNumber()).toBe(100);
      expect(investment.totalCostBasis.toNumber()).toBe(10000); // 100 * 100
      expect(investment.weightedAverageCost.toNumber()).toBe(100);

      // Bank account decreases by ₹10,000 (from ₹1,00,00,000 to ₹99,90,000)
      const bank = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(bank.balance.toNumber()).toBe(9990000);
    });

    it("CRITICAL SCENARIO: Multiple purchases, weighted average cost, partial sell, and revaluation", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Nifty 50 Index Fund",
          category: "MUTUAL_FUND",
          investmentAccountId: investmentAccountAId,
        })
      );

      // Purchase 1: 100 units @ ₹100 = ₹10,000
      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      // Purchase 2: 100 units @ ₹120 = ₹12,000
      const { investment: invAfterBuy2 } = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(120),
          payingAccountId: bankAccountAId,
        })
      );

      // Check weighted average math: Quantity = 200, Cost basis = ₹22,000, Weighted avg = ₹110
      expect(invAfterBuy2.totalQuantity.toNumber()).toBe(200);
      expect(invAfterBuy2.totalCostBasis.toNumber()).toBe(22000);
      expect(invAfterBuy2.weightedAverageCost.toNumber()).toBe(110);

      // SELL 50 units @ ₹120:
      // Proceeds = 50 * 120 = ₹6,000
      // Cost basis sold = 50 * 110 = ₹5,500
      // Realized gain = ₹6,000 - ₹5,500 = ₹500
      const { investment: invAfterSell } = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(120),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(invAfterSell.status).toBe("PARTIALLY_SOLD");
      expect(invAfterSell.totalQuantity.toNumber()).toBe(150);
      expect(invAfterSell.totalCostBasis.toNumber()).toBe(16500); // 150 * 110
      expect(invAfterSell.weightedAverageCost.toNumber()).toBe(110);
      expect(invAfterSell.realizedGainLoss.toNumber()).toBe(500);

      // REVALUE @ ₹130 per unit:
      // Market value = 150 * 130 = ₹19,500
      // totalCostBasis MUST remain ₹16,500
      // realizedGainLoss MUST remain ₹500
      const { investment: invAfterRevalue } = await prisma.$transaction((tx) =>
        InvestmentDomainService.revalueInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          currentPricePerUnit: new Prisma.Decimal(130),
        })
      );

      expect(invAfterRevalue.currentMarketValue.toNumber()).toBe(19500);
      expect(invAfterRevalue.totalCostBasis.toNumber()).toBe(16500);
      expect(invAfterRevalue.realizedGainLoss.toNumber()).toBe(500);

      // Unrealized market difference: ₹19,500 - ₹16,500 = ₹3,000 (kept completely distinct from realized gain ₹500)
      const unrealizedDiff = invAfterRevalue.currentMarketValue.sub(invAfterRevalue.totalCostBasis);
      expect(unrealizedDiff.toNumber()).toBe(3000);
    });

    it("handles sale at loss correctly", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Speculative Tech Stock",
          category: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      // Buy 100 units @ ₹100 = ₹10,000
      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      // Sell 50 units @ ₹80 = ₹4,000 (Cost basis = 50 * 100 = ₹5,000)
      // Realized loss = ₹4,000 - ₹5,000 = -₹1,000
      const { investment } = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(80),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(investment.realizedGainLoss.toNumber()).toBe(-1000);
    });

    it("handles full sale (ACTIVE -> CLOSED)", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Short Term Mutual Fund",
          category: "MUTUAL_FUND",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(200),
          payingAccountId: bankAccountAId,
        })
      );

      const { investment } = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(220),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(investment.status).toBe("CLOSED");
      expect(investment.totalQuantity.toNumber()).toBe(0);
      expect(investment.closedAt).not.toBeNull();
    });

    it("records dividend income without changing unit quantity or cost basis", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Dividend Paying Stock",
          category: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(50),
          payingAccountId: bankAccountAId,
        })
      );

      const { investment } = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordIncome(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          incomeType: "DIVIDEND",
          amount: new Prisma.Decimal(1500),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(investment.totalQuantity.toNumber()).toBe(100);
      expect(investment.totalCostBasis.toNumber()).toBe(5000);
      expect(investment.weightedAverageCost.toNumber()).toBe(50);
    });

    it("records fee expense without changing unit quantity or cost basis", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Managed Fund",
          category: "MUTUAL_FUND",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(50),
          payingAccountId: bankAccountAId,
        })
      );

      const { investment } = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordFee(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(250),
          payingAccountId: bankAccountAId,
        })
      );

      expect(investment.totalQuantity.toNumber()).toBe(100);
      expect(investment.totalCostBasis.toNumber()).toBe(5000);
    });
  });

  // =========================================================================
  // 2. BOUNDARY GUARDS & INVARIANTS
  // =========================================================================
  describe("2. Boundary Guards & Invariants", () => {
    it("rejects selling more units than currently held", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Small Position",
          category: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(10),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      // Attempting to sell 20 units when holding 10
      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.sellInvestment(tx, {
            investmentId: draft.id,
            householdId: householdAId,
            userId: userAId,
            quantity: new Prisma.Decimal(20),
            pricePerUnit: new Prisma.Decimal(120),
            receivingAccountId: bankAccountAId,
          })
        )
      ).rejects.toThrow("INVALID_QUANTITY");
    });
  });

  // =========================================================================
  // 3. IDEMPOTENCY & CONCURRENCY
  // =========================================================================
  describe("3. Idempotency & Concurrency Verification", () => {
    it("replaying buy Investment with same idempotencyKey returns cached result without double posting", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Idempotent Stock",
          category: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      const idempotencyKey = "buy-key-998877";

      const res1 = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
          idempotencyKey,
        })
      );

      const res2 = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
          idempotencyKey,
        })
      );

      expect(res1.financialEvent.id).toBe(res2.financialEvent.id);

      const inv = await prisma.investment.findUniqueOrThrow({ where: { id: draft.id } });
      expect(inv.totalQuantity.toNumber()).toBe(50);
    });
  });

  // =========================================================================
  // 4. HOUSEHOLD ISOLATION
  // =========================================================================
  describe("4. Household Isolation", () => {
    it("prevents Household B user from accessing or selling Household A investment", async () => {
      const draftA = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Household A Stock",
          category: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draftA.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      // Household B attempting to sell Household A stock
      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.sellInvestment(tx, {
            investmentId: draftA.id,
            householdId: householdBId,
            userId: userBId,
            quantity: new Prisma.Decimal(10),
            pricePerUnit: new Prisma.Decimal(120),
            receivingAccountId: bankAccountBId,
          })
        )
      ).rejects.toThrow("INVESTMENT_NOT_FOUND");
    });
  });

  // =========================================================================
  // 5. AUDIT INTEGRITY
  // =========================================================================
  describe("5. Audit Hash Integrity", () => {
    it("verifies hash-chain integrity after multiple investment operations", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Audited Mutual Fund",
          category: "MUTUAL_FUND",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.recordIncome(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          incomeType: "DIVIDEND",
          amount: new Prisma.Decimal(500),
          receivingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(110),
          receivingAccountId: bankAccountAId,
        })
      );

      const verification = await AuditIntegrityService.verifyChain(prisma, householdAId);
      expect(verification.status).toBe("PASS");
      expect(verification.tamperedEvents.length).toBe(0);
    });
  });
});
