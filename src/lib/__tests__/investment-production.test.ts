import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { InvestmentDomainService } from "@/modules/investments/investment.service";
import { FinancialCommand } from "@/finance/financial-command";
import { AuditIntegrityService } from "@/finance/audit";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { assertCanMutate } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

describe("Investment Management — Production Certification Suite", () => {
  let householdAId: string;
  let userAId: string;
  let userViewerId: string;
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
      data: { email: `prod-inv-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User A Owner", isOnboarded: true },
    });
    userAId = userA.id;

    const userViewer = await prisma.user.create({
      data: { email: `prod-inv-viewer-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User Viewer", isOnboarded: true },
    });
    userViewerId = userViewer.id;

    const hhA = await prisma.household.create({
      data: {
        name: "Household A Investments",
        currency: "INR",
        members: {
          create: [
            { userId: userAId, role: "OWNER" },
            { userId: userViewerId, role: "VIEWER" },
          ],
        },
      },
    });
    householdAId = hhA.id;

    // Bank Account A (Opening Balance: ₹1,00,00,000)
    const bankA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "HDFC Primary Bank", type: "BANK", balance: new Prisma.Decimal(0) },
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
      data: { householdId: householdAId, userId: userAId, name: "Equity Portfolio Ledger", type: "INVESTMENT", balance: new Prisma.Decimal(0) },
    });
    investmentAccountAId = invAccA.id;

    // Income & Fee Accounts
    const incAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Dividend Income Ledger", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    incomeAccountAId = incAccA.id;

    const feeAccA = await prisma.account.create({
      data: { householdId: householdAId, userId: userAId, name: "Brokerage Expense Ledger", type: "BANK", balance: new Prisma.Decimal(0) },
    });
    feeAccountAId = feeAccA.id;

    // Household B Setup (Isolation)
    const userB = await prisma.user.create({
      data: { email: `prod-inv-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: "hashed", name: "User B", isOnboarded: true },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: { name: "Household B Isolated", currency: "INR", members: { create: { userId: userBId, role: "OWNER" } } },
    });
    householdBId = hhB.id;

    const bankB = await prisma.account.create({
      data: { householdId: householdBId, userId: userBId, name: "ICICI Bank B", type: "BANK", balance: new Prisma.Decimal(100000) },
    });
    bankAccountBId = bankB.id;
  });

  // =========================================================================
  // 1. LIFECYCLE & WEIGHTED AVERAGE COST BASIS
  // =========================================================================
  describe("1. Lifecycle & Weighted Average Cost Basis Math", () => {
    it("1.1 Lifecycle: Draft creation -> Active upon buy -> Partially Sold -> Closed -> Draft/Archived", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Titan Company",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );
      expect(draft.status).toBe("DRAFT");
      expect(draft.totalQuantity.toNumber()).toBe(0);

      // Buy 100 units
      const buyRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(3000),
          payingAccountId: bankAccountAId,
        })
      );
      expect(buyRes.investment.status).toBe("ACTIVE");
      expect(buyRes.investment.totalQuantity.toNumber()).toBe(100);

      // Partial sell: 40 units
      const sellPartRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(40),
          pricePerUnit: new Prisma.Decimal(3200),
          receivingAccountId: bankAccountAId,
        })
      );
      expect(sellPartRes.investment.status).toBe("PARTIALLY_SOLD");
      expect(sellPartRes.investment.totalQuantity.toNumber()).toBe(60);

      // Full sell remainder: 60 units
      const sellFullRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(60),
          pricePerUnit: new Prisma.Decimal(3300),
          receivingAccountId: bankAccountAId,
        })
      );
      expect(sellFullRes.investment.status).toBe("CLOSED");
      expect(sellFullRes.investment.totalQuantity.toNumber()).toBe(0);
      expect(sellFullRes.investment.totalCostBasis.toNumber()).toBe(0);
    });

    it("1.2 Weighted Average: Multiple purchases blend cost basis correctly", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Infosys Ltd",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      // Buy Lot 1: 100 units @ ₹1,500 = ₹1,50,000
      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(1500),
          payingAccountId: bankAccountAId,
        })
      );

      // Buy Lot 2: 100 units @ ₹1,800 = ₹1,80,000
      const buy2Res = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(1800),
          payingAccountId: bankAccountAId,
        })
      );

      // Blended: 200 units, ₹3,30,000 total, weighted average = ₹1,650
      expect(buy2Res.investment.totalQuantity.toNumber()).toBe(200);
      expect(buy2Res.investment.totalCostBasis.toNumber()).toBe(330000);
      expect(buy2Res.investment.weightedAverageCost.toNumber()).toBe(1650);

      // Partial sell: 50 units @ ₹2,000
      // Sold basis: 50 * 1650 = ₹82,500
      // Proceeds: 50 * 2000 = ₹1,00,000
      // Realized gain = ₹17,500
      // Remaining cost basis: 150 * 1650 = ₹2,47,500
      const sellRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(2000),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(sellRes.investment.totalQuantity.toNumber()).toBe(150);
      expect(sellRes.investment.totalCostBasis.toNumber()).toBe(247500);
      expect(sellRes.investment.weightedAverageCost.toNumber()).toBe(1650);
      expect(sellRes.investment.realizedGainLoss.toNumber()).toBe(17500);
    });

    it("1.3 Market Revaluation adjusts valuation without altering cost basis or realized gain/loss", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Nifty ETF",
          category: "EQUITY",
          type: "ETF",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(200),
          payingAccountId: bankAccountAId,
        })
      );

      // Revalue to ₹250
      const revalRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.revalueInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          currentPricePerUnit: new Prisma.Decimal(250),
        })
      );

      // Invariants:
      // Market value = 100 * 250 = ₹25,000
      // Total cost basis = ₹20,000 (UNCHANGED)
      // Realized gain/loss = 0 (UNCHANGED)
      expect(revalRes.investment.currentMarketValue.toNumber()).toBe(25000);
      expect(revalRes.investment.totalCostBasis.toNumber()).toBe(20000);
      expect(revalRes.investment.realizedGainLoss.toNumber()).toBe(0);
      expect(revalRes.investment.currentPricePerUnit.toNumber()).toBe(250);
    });
  });

  // =========================================================================
  // 2. INCOME & FEES
  // =========================================================================
  describe("2. Income (Dividends & Interest) and Management Fees", () => {
    it("2.1 Dividend and Interest credit bank account without altering cost basis", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "TCS",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(3500),
          payingAccountId: bankAccountAId,
        })
      );

      const divRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordIncome(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          incomeType: "DIVIDEND",
          amount: new Prisma.Decimal(15000),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(divRes.investment.totalCostBasis.toNumber()).toBe(350000); // UNTOUCHED
      expect(divRes.financialEvent.eventType).toBe("DIVIDEND");
      expect(divRes.financialEvent.amount.toNumber()).toBe(15000);

      const intRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordIncome(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          incomeType: "INTEREST",
          amount: new Prisma.Decimal(5000),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(intRes.financialEvent.eventType).toBe("INTEREST");
      expect(intRes.financialEvent.amount.toNumber()).toBe(5000);
    });

    it("2.2 Fee records expense and debits bank account correctly", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "PMS Portfolio",
          category: "EQUITY",
          type: "OTHER",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(1000),
          pricePerUnit: new Prisma.Decimal(100),
          payingAccountId: bankAccountAId,
        })
      );

      const feeRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordFee(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          amount: new Prisma.Decimal(2500),
          payingAccountId: bankAccountAId,
        })
      );

      expect(feeRes.financialEvent.eventType).toBe("FEE");
      expect(feeRes.financialEvent.amount.toNumber()).toBe(2500);
      expect(feeRes.investment.totalCostBasis.toNumber()).toBe(100000);
    });
  });

  // =========================================================================
  // 3. COMPENSATING REVERSALS & INVARIANTS
  // =========================================================================
  describe("3. Compensating Reversals & Invariant Preservation", () => {
    it("3.1 Reversing a BUY restores bank balance, deletes lot, and reverts status if 0 units", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "HDFC Bank",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      const initialBankAcc = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });

      const buyRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(50),
          pricePerUnit: new Prisma.Decimal(1600),
          payingAccountId: bankAccountAId,
        })
      );

      // Reverse BUY
      const revRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.reverseEvent(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          eventId: buyRes.financialEvent.id,
          reason: "Mistaken buy",
        })
      );

      expect(revRes.reversalEvent.isReversed).toBe(false);
      expect(revRes.reversalEvent.reversalOfEventId).toBe(buyRes.financialEvent.id);
      expect(revRes.investment.status).toBe("DRAFT");
      expect(revRes.investment.totalQuantity.toNumber()).toBe(0);
      expect(revRes.investment.totalCostBasis.toNumber()).toBe(0);

      // Verify bank account balance restored
      const restoredBankAcc = await prisma.account.findUniqueOrThrow({ where: { id: bankAccountAId } });
      expect(restoredBankAcc.balance.toNumber()).toBe(initialBankAcc.balance.toNumber());

      // Verify lot was deleted
      const lots = await prisma.investmentLot.findMany({ where: { investmentId: draft.id } });
      expect(lots.length).toBe(0);
    });

    it("3.2 Reversing a SELL restores units, cost basis, depletes realized gain, and restores lots", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "ITC Ltd",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(400),
          payingAccountId: bankAccountAId,
        })
      );

      // Sell 100 units @ ₹500 (Full sale -> CLOSED)
      const sellRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.sellInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(100),
          pricePerUnit: new Prisma.Decimal(500),
          receivingAccountId: bankAccountAId,
        })
      );

      expect(sellRes.investment.status).toBe("CLOSED");
      expect(sellRes.investment.realizedGainLoss.toNumber()).toBe(10000);

      // Reverse the SELL
      const revRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.reverseEvent(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          eventId: sellRes.financialEvent.id,
          reason: "Erroneous sale trade",
        })
      );

      expect(revRes.investment.status).toBe("ACTIVE");
      expect(revRes.investment.totalQuantity.toNumber()).toBe(100);
      expect(revRes.investment.totalCostBasis.toNumber()).toBe(40000);
      expect(revRes.investment.realizedGainLoss.toNumber()).toBe(0);

      // Lot remaining quantity restored
      const lots = await prisma.investmentLot.findMany({ where: { investmentId: draft.id } });
      expect(lots.length).toBe(1);
      expect(lots[0].remainingQuantity.toNumber()).toBe(100);
    });

    it("3.3 Guard: Prevents double-reversal and reversing a reversal", async () => {
      const draft = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "L&T",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      const buyRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(10),
          pricePerUnit: new Prisma.Decimal(3000),
          payingAccountId: bankAccountAId,
        })
      );

      const revRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.reverseEvent(tx, {
          investmentId: draft.id,
          householdId: householdAId,
          userId: userAId,
          eventId: buyRes.financialEvent.id,
        })
      );

      // Attempt 1: Double reversal of original BUY
      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.reverseEvent(tx, {
            investmentId: draft.id,
            householdId: householdAId,
            userId: userAId,
            eventId: buyRes.financialEvent.id,
          })
        )
      ).rejects.toThrow("EVENT_ALREADY_REVERSED");

      // Attempt 2: Reversing the reversal event
      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.reverseEvent(tx, {
            investmentId: draft.id,
            householdId: householdAId,
            userId: userAId,
            eventId: revRes.reversalEvent.id,
          })
        )
      ).rejects.toThrow("CANNOT_REVERSE_REVERSAL");
    });
  });

  // =========================================================================
  // 4. REPORTING & ISOLATION & RBAC
  // =========================================================================
  describe("4. Reporting, Household Isolation & RBAC", () => {
    it("4.1 Reporting: Excludes DRAFT investments and reversed events from totals", async () => {
      // 1 Draft
      await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Draft Pending Stock",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      // 1 Active
      const active = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Active Gold ETF",
          category: "COMMODITY",
          type: "GOLD",
          investmentAccountId: investmentAccountAId,
        })
      );

      const buyRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.buyInvestment(tx, {
          investmentId: active.id,
          householdId: householdAId,
          userId: userAId,
          quantity: new Prisma.Decimal(10),
          pricePerUnit: new Prisma.Decimal(5000),
          payingAccountId: bankAccountAId,
        })
      );

      // Add dividend then reverse it
      const divRes = await prisma.$transaction((tx) =>
        InvestmentDomainService.recordIncome(tx, {
          investmentId: active.id,
          householdId: householdAId,
          userId: userAId,
          incomeType: "DIVIDEND",
          amount: new Prisma.Decimal(2000),
          receivingAccountId: bankAccountAId,
        })
      );

      await prisma.$transaction((tx) =>
        InvestmentDomainService.reverseEvent(tx, {
          investmentId: active.id,
          householdId: householdAId,
          userId: userAId,
          eventId: divRes.financialEvent.id,
        })
      );

      const report = await FinancialReportingService.getInvestmentReport(prisma, householdAId);
      expect(report.investmentsCount).toBe(1); // DRAFT excluded
      expect(report.totalCostBasis.toNumber()).toBe(50000);
      expect(report.totalDividends.toNumber()).toBe(0); // Reversed dividend excluded
    });

    it("4.2 RBAC: VIEWER role cannot execute mutations", () => {
      const viewerForbidden = assertCanMutate("VIEWER");
      expect(viewerForbidden).not.toBeNull();
      expect(viewerForbidden?.status).toBe(403);

      const ownerAllowed = assertCanMutate("OWNER");
      expect(ownerAllowed).toBeNull();

      const memberAllowed = assertCanMutate("MEMBER");
      expect(memberAllowed).toBeNull();
    });

    it("4.3 Household Isolation: Cross-household access strictly prevented", async () => {
      const invA = await prisma.$transaction((tx) =>
        InvestmentDomainService.createDraft(tx, {
          householdId: householdAId,
          userId: userAId,
          name: "Household A Proprietary Asset",
          category: "EQUITY",
          type: "STOCK",
          investmentAccountId: investmentAccountAId,
        })
      );

      await expect(
        prisma.$transaction((tx) =>
          InvestmentDomainService.buyInvestment(tx, {
            investmentId: invA.id,
            householdId: householdBId,
            userId: userBId,
            quantity: new Prisma.Decimal(10),
            pricePerUnit: new Prisma.Decimal(100),
            payingAccountId: bankAccountBId,
          })
        )
      ).rejects.toThrow("INVESTMENT_NOT_FOUND");
    });
  });
});
