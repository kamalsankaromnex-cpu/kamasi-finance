import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { FinancialForecastingService, ForecastInput } from "@/finance/forecasting/forecasting.service";

describe("Phase 3.6 — Financial Forecasting Engine Suite", () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Clean database before each test
    await prisma.forecastSnapshot.deleteMany();
    await prisma.forecastMilestone.deleteMany();
    await prisma.forecastScenario.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.incomeOccurrence.deleteMany();
    await prisma.incomeSource.deleteMany();
    await prisma.recurringTransaction.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.liability.deleteMany();
    await prisma.investment.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.account.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.user.deleteMany();
    await prisma.household.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: "forecasting-admin@kamasi.test",
        passwordHash: "hash123",
        name: "Forecasting Admin",
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: { name: "Forecasting Household", currency: "INR" },
    });
    householdId = household.id;

    await prisma.householdMember.create({
      data: { householdId, userId, role: "OWNER" },
    });

    const account = await prisma.account.create({
      data: {
        householdId,
        name: "Main Liquid Bank",
        type: "BANK",
        balance: 100000.0,
      },
    });
    bankAccountId = account.id;
  });

  afterEach(async () => {
    // Clean up
  });

  it("1. Deterministic Acceptance Test: Opening ₹100,000 + 12 x ₹110,000 Surplus = ₹1,420,000", async () => {
    // Income ₹185,000 / month
    await prisma.incomeSource.create({
      data: {
        householdId,
        name: "Primary Salary",
        category: "Salary",
        expectedAmount: 185000.0,
        frequency: "MONTHLY",
        behavior: "RECURRING",
      },
    });

    // Expenses ₹75,000 / month
    await prisma.recurringTransaction.create({
      data: {
        householdId,
        accountId: bankAccountId,
        name: "Monthly Expenses",
        amount: 75000.0,
        type: "EXPENSE",
        frequency: "MONTHLY",
      },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    // Set 0% growth to verify pure baseline surplus math
    scenario.incomeGrowthRate = 0;
    scenario.expenseInflationRate = 0;

    const forecastInput: ForecastInput = {
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    };

    const result = await FinancialForecastingService.runForecast(forecastInput);

    expect(result.cashFlows.length).toBe(12);
    expect(result.cashFlows[0].totalIncome).toBe(185000);
    expect(result.cashFlows[0].totalExpenses).toBe(75000);
    expect(result.cashFlows[0].netCashFlow).toBe(110000);

    // Month 12 closing cash must equal ₹100,000 + 12 * ₹110,000 = ₹1,420,000
    const finalMonth = result.cashFlows[11];
    expect(finalMonth.closingCash).toBe(1420000);
    expect(result.summary.netProjectedSurplus).toBe(1320000);
  });

  it("2. Deterministic Calculation ID & Reproducibility (Result A === Result B)", async () => {
    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const forecastInput: ForecastInput = {
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    };

    const calcId1 = FinancialForecastingService.generateCalculationId(forecastInput);
    const calcId2 = FinancialForecastingService.generateCalculationId(forecastInput);
    expect(calcId1).toBe(calcId2);

    const resultA = await FinancialForecastingService.runForecast(forecastInput);
    const resultB = await FinancialForecastingService.runForecast(forecastInput);

    expect(resultA.calculationId).toBe(resultB.calculationId);
    expect(resultA.summary.endingNetWorth).toBe(resultB.summary.endingNetWorth);
  });

  it("3. Hard Invariant Test: Zero Ledger or Financial-Truth Mutations", async () => {
    await prisma.incomeSource.create({
      data: { householdId, name: "Consulting", expectedAmount: 50000, frequency: "MONTHLY" },
    });
    await prisma.recurringTransaction.create({
      data: { householdId, accountId: bankAccountId, name: "Rent", amount: 20000, type: "EXPENSE" },
    });
    await prisma.goal.create({
      data: { householdId, name: "Emergency Fund", targetAmount: 200000, currentAmount: 50000, targetDate: new Date("2027-10-01") },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "OPTIMISTIC");
    const forecastInput: ForecastInput = {
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    };

    const isImmutable = await FinancialForecastingService.assertLedgerImmutability(householdId, async () => {
      await FinancialForecastingService.runForecast(forecastInput);
    });

    expect(isImmutable).toBe(true);
  });

  it("4. Actual vs Planned vs Forecast Distinction", async () => {
    await prisma.incomeSource.create({
      data: { householdId, name: "Salary", expectedAmount: 100000, frequency: "MONTHLY" },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 6,
      scenario,
    });

    // Month 1 includes planned/actual distinction, months 2-6 reflect forecast projections
    expect(result.cashFlows[0].plannedIncome).toBeGreaterThan(0);
    expect(result.cashFlows[1].forecastIncome).toBeGreaterThan(0);
  });

  it("5. Goal Shortfall & Required Contribution Math", async () => {
    const futureTargetDate = new Date();
    futureTargetDate.setMonth(futureTargetDate.getMonth() + 10);

    const goal = await prisma.goal.create({
      data: {
        householdId,
        name: "Car Purchase",
        targetAmount: 500000.0,
        currentAmount: 200000.0, // Remaining = ₹300,000
        targetDate: futureTargetDate,
        status: "ACTIVE",
      },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    });

    const gResult = result.goals.find((g) => g.goalId === goal.id);
    expect(gResult).toBeDefined();
    expect(gResult?.remainingAmount).toBe(300000);
    expect(gResult?.requiredMonthlyContribution).toBeGreaterThan(0);
    expect(gResult?.isAchieved).toBe(false);
  });

  it("6. Simulated Liability Interest Boundary (No DB Mutation)", async () => {
    const liability = await prisma.liability.create({
      data: {
        householdId,
        name: "Home Loan",
        category: "MORTGAGE",
        principalAmount: 2400000.0,
        outstandingAmount: 2400000.0,
        interestRate: 8.5,
        status: "ACTIVE",
      },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    });

    const lResult = result.liabilities.find((l) => l.liabilityId === liability.id);
    expect(lResult).toBeDefined();
    expect(lResult?.totalSimulatedInterest).toBeGreaterThan(0);
    expect(lResult?.projectedClosingOutstanding).toBeLessThan(2400000);

    // Verify DB liability record remained untouched
    const dbLiability = await prisma.liability.findUnique({ where: { id: liability.id } });
    expect(Number(dbLiability?.outstandingAmount)).toBe(2400000.0);
  });

  it("7. Investment Forecast Isolation (Realized vs Unrealized vs Forecast)", async () => {
    const investment = await prisma.investment.create({
      data: {
        householdId,
        name: "Equity Index Fund",
        category: "MUTUAL_FUND",
        type: "MUTUAL_FUND",
        totalQuantity: 100.0,
        totalCostBasis: 100000.0,
        weightedAverageCost: 1000.0,
        currentMarketValue: 120000.0, // Unrealized = ₹20,000
        realizedGainLoss: 5000.0,     // Realized = ₹5,000
        status: "ACTIVE",
      },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    scenario.investmentReturnRate = 10.0;

    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    });

    const invResult = result.investments.find((i) => i.investmentId === investment.id);
    expect(invResult).toBeDefined();
    expect(invResult?.costBasis).toBe(100000);
    expect(invResult?.unrealizedGainLoss).toBe(20000);
    expect(invResult?.realizedGainLoss).toBe(5000);
    expect(invResult?.forecastValuation).toBe(132000); // 120,000 * 1.10
    expect(invResult?.forecastGainLoss).toBe(12000);

    // Verify DB record untouched
    const dbInv = await prisma.investment.findUnique({ where: { id: investment.id } });
    expect(Number(dbInv?.totalCostBasis)).toBe(100000.0);
    expect(Number(dbInv?.realizedGainLoss)).toBe(5000.0);
  });

  it("8. Scenario Comparison: BASELINE vs CONSERVATIVE vs OPTIMISTIC", async () => {
    await prisma.incomeSource.create({
      data: { householdId, name: "Salary", expectedAmount: 150000, frequency: "MONTHLY" },
    });

    const baseline = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const conservative = FinancialForecastingService.getPresetScenario(householdId, "CONSERVATIVE");
    const optimistic = FinancialForecastingService.getPresetScenario(householdId, "OPTIMISTIC");

    const resBaseline = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario: baseline,
    });

    const resConservative = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario: conservative,
    });

    const resOptimistic = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario: optimistic,
    });

    expect(resOptimistic.summary.endingNetWorth).toBeGreaterThan(resBaseline.summary.endingNetWorth);
    expect(resBaseline.summary.endingNetWorth).toBeGreaterThanOrEqual(resConservative.summary.endingNetWorth);
  });

  it("9. Forecast Snapshot Persistence & Retrieval", async () => {
    const scenario = await prisma.forecastScenario.create({
      data: {
        householdId,
        name: "Saved Baseline",
        type: "BASELINE",
        isDefault: true,
      },
    });

    const scenarioConfig = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario: scenarioConfig,
    });

    const snapshot = await FinancialForecastingService.saveSnapshot(result, scenario.id);
    expect(snapshot.id).toBeDefined();
    expect(snapshot.calculationId).toBe(result.calculationId);

    const retrieved = await prisma.forecastSnapshot.findUnique({
      where: { calculationId: result.calculationId },
    });
    expect(retrieved).toBeDefined();
    expect(JSON.parse(retrieved!.resultJson).householdId).toBe(householdId);
  });

  it("10. Household Isolation Gate", async () => {
    const otherHousehold = await prisma.household.create({
      data: { name: "Other Household", currency: "INR" },
    });
    await prisma.account.create({
      data: { householdId: otherHousehold.id, name: "Secret Bank", balance: 999999 },
    });

    const scenario = FinancialForecastingService.getPresetScenario(householdId, "BASELINE");
    const result = await FinancialForecastingService.runForecast({
      householdId,
      startDate: "2026-10-01",
      horizonMonths: 12,
      scenario,
    });

    // Opening cash must reflect householdId (₹100,000), not otherHousehold (₹999,999)
    expect(result.cashFlows[0].openingCash).toBe(100000);
  });
});
