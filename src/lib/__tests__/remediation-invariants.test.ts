import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";
import { FinancialReportingService } from "@/finance/reporting/reporting.service";
import { summarizeMonth } from "../reporting";
import { NextRequest } from "next/server";
import { GET as getTransactions } from "@/app/api/transactions/route";
import { GET as getReceipt } from "@/app/api/uploads/receipts/[filename]/route";
import { GET as getIntegrityCheck } from "@/app/api/ops/integrity-check/route";
import { POST as postOnboarding } from "@/app/api/onboarding/route";
import { FinancialForecastingService } from "@/finance/forecasting/forecasting.service";
import fs from "fs";
import path from "path";

describe("Remediation Invariants & Accounting Rigor Test Suite", () => {
  let householdAId: string;
  let userAId: string;
  let householdBId: string;
  let userBId: string;

  beforeEach(async () => {
    // Clean test database
    await prisma.transactionLifecycleHistory.deleteMany();
    await prisma.projectPaymentAllocation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.liabilityFinancialEvent.deleteMany();
    await prisma.liabilityLifecycleHistory.deleteMany();
    await prisma.borrowing.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.assetFinancialEvent.deleteMany();
    await prisma.assetValuation.deleteMany();
    await prisma.assetLifecycleHistory.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Create Household A
    const userA = await prisma.user.create({
      data: { email: `user-a-${Date.now()}@test.com`, passwordHash: "hashA", name: "User A" },
    });
    userAId = userA.id;

    const hhA = await prisma.household.create({
      data: {
        name: "Household A",
        currency: "INR",
        members: { create: { userId: userAId, role: "OWNER" } },
      },
    });
    householdAId = hhA.id;

    // Create Household B
    const userB = await prisma.user.create({
      data: { email: `user-b-${Date.now()}@test.com`, passwordHash: "hashB", name: "User B" },
    });
    userBId = userB.id;

    const hhB = await prisma.household.create({
      data: {
        name: "Household B",
        currency: "INR",
        members: { create: { userId: userBId, role: "OWNER" } },
      },
    });
    householdBId = hhB.id;
  });

  // =========================================================================
  // 1. NET WORTH MULTI-ACCOUNT DEDUPLICATION
  // =========================================================================
  it("Invariant 1: Net Worth does not double-count loans across Borrowing, Liability, and Account records", async () => {
    // Create Normal Bank Account (Asset ₹500,000)
    const bankAccount = await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "HDFC Savings",
        type: "BANK",
        balance: new Prisma.Decimal(500000),
      },
    });

    // Create Credit Card with debt of ₹25,000 (negative balance in debit-normal semantics)
    await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "ICICI Coral Card",
        type: "CREDIT",
        balance: new Prisma.Decimal(-25000),
        creditLimit: new Prisma.Decimal(100000),
      },
    });

    // Create Loan Account (LOAN type) linked to a Borrowing record (₹200,000)
    const borrowingLoanAccount = await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "SBI Car Loan Account",
        type: "LOAN",
        balance: new Prisma.Decimal(200000),
      },
    });

    await prisma.borrowing.create({
      data: {
        householdId: householdAId,
        name: "SBI Car Loan",
        receivingAccountId: bankAccount.id,
        liabilityAccountId: borrowingLoanAccount.id,
        borrowingType: "CAR_LOAN",
        principalAmount: new Prisma.Decimal(200000),
        outstandingPrincipal: new Prisma.Decimal(200000),
        interestRate: new Prisma.Decimal(9.5),
        status: "ACTIVE",
      },
    });

    // Create Legacy Liability record (₹100,000) with linked liability account
    const legacyLoanAccount = await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "Personal Loan Account",
        type: "LOAN",
        balance: new Prisma.Decimal(100000),
      },
    });

    await prisma.liability.create({
      data: {
        householdId: householdAId,
        name: "Friend Hand Loan",
        category: "LOAN",
        principalAmount: new Prisma.Decimal(100000),
        outstandingAmount: new Prisma.Decimal(100000),
        liabilityAccountId: legacyLoanAccount.id,
        status: "ACTIVE",
      },
    });

    // Create Standalone Unlinked Loan Account (₹50,000)
    await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "Unlinked Education Loan",
        type: "LOAN",
        balance: new Prisma.Decimal(50000),
      },
    });

    const report = await FinancialReportingService.getNetWorthReport(prisma, householdAId);

    // Total Assets: Bank liquid ₹500,000
    expect(report.totalAssets.toNumber()).toBe(500000);

    // Total Liabilities:
    // Borrowing: 200,000
    // Legacy: 100,000
    // Unlinked Loan Account: 50,000
    // (Total loans = 350,000 — NOT 350,000 + 200,000 + 100,000!)
    // Credit card: 25,000
    // Total Liabilities = 375,000
    expect(report.liabilityBreakdown.loans.toNumber()).toBe(350000);
    expect(report.liabilityBreakdown.creditCards.toNumber()).toBe(25000);
    expect(report.totalLiabilities.toNumber()).toBe(375000);

    // Net Worth = 500,000 - 375,000 = 125,000
    expect(report.netWorth.toNumber()).toBe(125000);
  });

  // =========================================================================
  // 2. REFUND ACCOUNTING & NEVER SUBTRACTING TWICE
  // =========================================================================
  it("Invariant 2: Reporting derives refund netting from one authoritative representation and never nets twice", async () => {
    const bankAccount = await prisma.account.create({
      data: {
        householdId: householdAId,
        name: "Checking",
        type: "BANK",
        balance: new Prisma.Decimal(100000),
      },
    });

    const cat = await prisma.category.create({
      data: { householdId: householdAId, name: "Electronics", type: "EXPENSE" },
    });

    // Original expense: ₹10,000, partially refunded by ₹2,000
    const originalExpense = await prisma.transaction.create({
      data: {
        householdId: householdAId,
        accountId: bankAccount.id,
        categoryId: cat.id,
        amount: new Prisma.Decimal(10000),
        refundedAmount: new Prisma.Decimal(2000),
        type: "EXPENSE",
        status: "PARTIALLY_REFUNDED",
        description: "Laptop Monitor",
      },
    });

    // Linked refund transaction record (type INCOME, refundOfId pointing to original)
    await prisma.transaction.create({
      data: {
        householdId: householdAId,
        accountId: bankAccount.id,
        categoryId: cat.id,
        amount: new Prisma.Decimal(2000),
        type: "INCOME",
        status: "POSTED",
        refundOfId: originalExpense.id,
        description: "Refund for Laptop Monitor",
      },
    });

    // Client-side summarizeMonth
    const monthlySummary = summarizeMonth([
      {
        date: new Date().toISOString(),
        amount: 10000,
        refundedAmount: 2000,
        type: "EXPENSE",
      },
      {
        date: new Date().toISOString(),
        amount: 2000,
        type: "INCOME",
        refundOfId: originalExpense.id,
      },
    ], new Date().getFullYear(), new Date().getMonth());

    // Gross income must NOT include the ₹2,000 refund (it was not operating revenue)
    expect(monthlySummary.income).toBe(0);
    // Net expense must be exactly ₹8,000 (10,000 - 2,000), NOT 6,000!
    expect(monthlySummary.expenses).toBe(8000);

    // Server-side P&L (Income Statement)
    const pnlReport = await FinancialReportingService.getIncomeStatementReport(prisma, householdAId);
    expect(pnlReport.totalExpenses.toNumber()).toBe(8000);

    // Server-side Expense Analysis
    const analysisReport = await FinancialReportingService.getExpenseAnalysisReport(prisma, householdAId);
    expect(analysisReport.totalExpenses.toNumber()).toBe(8000);
  });

  // =========================================================================
  // 3. FAIL-CLOSED OPS API AUTHENTICATION
  // =========================================================================
  it("Invariant 3: Ops endpoints fail-closed when OPS_API_KEY is missing or invalid", async () => {
    // Unauthenticated request -> 401
    const unauthReq = new NextRequest("http://localhost:3000/api/ops/integrity-check", { method: "GET" });
    const unauthRes = await getIntegrityCheck(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Hardcoded dev secret attempt when process.env.OPS_API_KEY is different or missing
    const originalKey = process.env.OPS_API_KEY;
    try {
      delete process.env.OPS_API_KEY;
      const noEnvReq = new NextRequest("http://localhost:3000/api/ops/integrity-check", {
        method: "GET",
        headers: { "x-ops-api-key": "dev_ops_secret_key_12345" },
      });
      const noEnvRes = await getIntegrityCheck(noEnvReq);
      // Fails closed!
      expect(noEnvRes.status).toBe(401);
    } finally {
      process.env.OPS_API_KEY = originalKey;
    }
  });

  // =========================================================================
  // 4. TRANSACTION TYPE FILTER VALIDATION
  // =========================================================================
  it("Invariant 4: GET /api/transactions validates type query param against allowlist", async () => {
    const { createSessionToken } = await import("@/lib/auth");
    const token = await createSessionToken({ id: userAId, email: "user-a@test.com", name: "User A", householdId: householdAId, role: "OWNER" });

    // Invalid type -> 400
    const invalidReq = new NextRequest("http://localhost:3000/api/transactions?type=MALICIOUS_INJECTION", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const invalidRes = await getTransactions(invalidReq);
    expect(invalidRes.status).toBe(400);
    const errBody = await invalidRes.json();
    expect(errBody.error).toContain("Invalid transaction type filter");

    // Valid type TRANSFER -> 200
    const validReq = new NextRequest("http://localhost:3000/api/transactions?type=TRANSFER", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const validRes = await getTransactions(validReq);
    expect(validRes.status).toBe(200);
  });

  // =========================================================================
  // 5. RECEIPT HOUSEHOLD ACCESS CONTROL (IDOR)
  // =========================================================================
  it("Invariant 5: Receipt files strictly enforce household ownership linked to existing transactions", async () => {
    const storageDir = path.join(process.cwd(), "storage", "receipts");
    fs.mkdirSync(storageDir, { recursive: true });

    const filenameA = "test_receipt_a.jpg";
    const filenameB = "test_receipt_b.jpg";
    fs.writeFileSync(path.join(storageDir, filenameA), Buffer.from("dummy_receipt_a"));
    fs.writeFileSync(path.join(storageDir, filenameB), Buffer.from("dummy_receipt_b"));

    const bankA = await prisma.account.create({
      data: { householdId: householdAId, name: "Bank A", type: "BANK", balance: new Prisma.Decimal(1000) },
    });
    const bankB = await prisma.account.create({
      data: { householdId: householdBId, name: "Bank B", type: "BANK", balance: new Prisma.Decimal(1000) },
    });

    // Transaction in Household A
    await prisma.transaction.create({
      data: {
        householdId: householdAId,
        accountId: bankA.id,
        amount: new Prisma.Decimal(500),
        type: "EXPENSE",
        receiptUrl: `/api/uploads/receipts/${filenameA}`,
        description: "Dinner",
      },
    });

    // Transaction in Household B
    await prisma.transaction.create({
      data: {
        householdId: householdBId,
        accountId: bankB.id,
        amount: new Prisma.Decimal(900),
        type: "EXPENSE",
        receiptUrl: `/api/uploads/receipts/${filenameB}`,
        description: "Supplies",
      },
    });

    const { createSessionToken } = await import("@/lib/auth");
    const tokenA = await createSessionToken({ id: userAId, email: "user-a@test.com", name: "User A", householdId: householdAId, role: "OWNER" });

    // Household A accessing Receipt A -> 200 OK
    const reqAtoA = new NextRequest(`http://localhost:3000/api/uploads/receipts/${filenameA}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const resAtoA = await getReceipt(reqAtoA, { params: Promise.resolve({ filename: filenameA }) });
    expect(resAtoA.status).toBe(200);

    // Household A attempting to access Receipt B (cross-tenant IDOR attack) -> 403 Forbidden
    const reqAtoB = new NextRequest(`http://localhost:3000/api/uploads/receipts/${filenameB}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const resAtoB = await getReceipt(reqAtoB, { params: Promise.resolve({ filename: filenameB }) });
    expect(resAtoB.status).toBe(403);

    // Clean test files
    try {
      fs.unlinkSync(path.join(storageDir, filenameA));
      fs.unlinkSync(path.join(storageDir, filenameB));
    } catch {}
  });

  // =========================================================================
  // 6. ONBOARDING RE-SAVE IDEMPOTENCY WITHOUT 2X DRIFTS
  // =========================================================================
  it("Invariant 6: Onboarding re-save is idempotent with 0 false 2x drift on opening balance", async () => {
    const { createSessionToken } = await import("@/lib/auth");
    const tokenA = await createSessionToken({ id: userAId, email: "user-a@test.com", name: "User A", householdId: householdAId, role: "OWNER" });

    const payload = {
      step: 2,
      accounts: [
        { name: "Salary Account", type: "BANK", balance: "100000" },
        { name: "SBI Home Loan", type: "LOAN", balance: "2500000" },
        { name: "HDFC Card", type: "CREDIT", balance: "15000" },
      ],
    };

    // First Save
    const req1 = new NextRequest("http://localhost:3000/api/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify(payload),
    });
    const res1 = await postOnboarding(req1);
    expect(res1.status).toBe(200);

    const accountsAfterFirstSave = await prisma.account.findMany({
      where: { householdId: householdAId },
    });
    const bank1 = accountsAfterFirstSave.find((a) => a.name === "Salary Account");
    const loan1 = accountsAfterFirstSave.find((a) => a.name === "SBI Home Loan");
    const card1 = accountsAfterFirstSave.find((a) => a.name === "HDFC Card");

    expect(bank1?.balance.toNumber()).toBe(100000);
    expect(loan1?.balance.toNumber()).toBe(2500000);
    expect(card1?.balance.toNumber()).toBe(-15000);

    const initialJournalCount = await prisma.journal.count({ where: { householdId: householdAId } });

    // Second Save (identical payload - simulated user re-submitting step 2)
    const req2 = new NextRequest("http://localhost:3000/api/onboarding", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify(payload),
    });
    const res2 = await postOnboarding(req2);
    expect(res2.status).toBe(200);

    const accountsAfterSecondSave = await prisma.account.findMany({
      where: { householdId: householdAId },
    });
    const bank2 = accountsAfterSecondSave.find((a) => a.name === "Salary Account");
    const loan2 = accountsAfterSecondSave.find((a) => a.name === "SBI Home Loan");
    const card2 = accountsAfterSecondSave.find((a) => a.name === "HDFC Card");

    // Balances MUST NOT double!
    expect(bank2?.balance.toNumber()).toBe(100000);
    expect(loan2?.balance.toNumber()).toBe(2500000);
    expect(card2?.balance.toNumber()).toBe(-15000);

    // No extra journals posted on identical re-save
    const secondJournalCount = await prisma.journal.count({ where: { householdId: householdAId } });
    expect(secondJournalCount).toBe(initialJournalCount);
  });

  // =========================================================================
  // 7. FORECAST ASSET VALUATION WITH ZERO AND CURRENT VALUES
  // =========================================================================
  it("Invariant 7: Forecasting correctly uses currentValue and handles zero values with nullish coalescing", async () => {
    // Asset with initialValue 50,000, currentValue updated to 75,000
    await prisma.asset.create({
      data: {
        householdId: householdAId,
        name: "Gold Coins",
        category: "GOLD",
        initialValue: new Prisma.Decimal(50000),
        currentValue: new Prisma.Decimal(75000),
        status: "ACTIVE",
      },
    });

    // Asset with currentValue explicitly 0 (depreciated vehicle)
    await prisma.asset.create({
      data: {
        householdId: householdAId,
        name: "Old Scooter",
        category: "VEHICLE",
        initialValue: new Prisma.Decimal(30000),
        currentValue: new Prisma.Decimal(0),
        status: "ACTIVE",
      },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdAId, "BASELINE");
    scenario.incomeGrowthRate = 0;
    scenario.expenseInflationRate = 0;
    scenario.investmentReturnRate = 0;
    scenario.assetGrowthRate = 0;

    const forecast = await FinancialForecastingService.runForecast({
      householdId: householdAId,
      startDate: "2026-10-01",
      horizonMonths: 1,
      scenario,
    });

    // Month 1 physical assets valuation should be 75,000 + 0 = 75,000 (NOT 75,000 + 30,000 from || 30000!)
    const month1Assets = forecast.netWorthTrajectory[0].projectedPhysicalAssets;
    expect(month1Assets).toBe(75000);
  });
});