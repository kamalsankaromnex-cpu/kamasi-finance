import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../store";
import { runForecastSimulation } from "../forecasting";

describe("Phase 1 Financial Logic & Ledger Regression Tests", () => {
  beforeEach(() => {
    // Reset store state
    store.accounts = [
      { id: "acc-1", householdId: "hh-1", name: "HDFC Savings", type: "BANK", balance: 345000.00, currency: "INR", isArchived: false },
      { id: "acc-2", householdId: "hh-1", name: "ICICI Credit", type: "CREDIT", balance: -24500.00, currency: "INR", isArchived: false },
    ];
    store.categories = [
      { id: "cat-1", householdId: "hh-1", name: "Rent & Housing", icon: "home", color: "#ef4444", type: "EXPENSE", isDefault: true },
      { id: "cat-2", householdId: "hh-1", name: "Groceries & Food", icon: "shopping-cart", color: "#f59e0b", type: "EXPENSE", isDefault: true },
    ];
    store.transactions = [];
    store.goals = [
      { id: "gl-1", householdId: "hh-1", name: "Emergency Reserve", targetAmount: 600000.00, currentAmount: 420000.00, targetDate: "2026-12-31", priority: "HIGH" },
    ];
    store.budgets = [
      { id: "bdg-1", householdId: "hh-1", categoryId: "cat-2", month: 9, year: 2026, amount: 25000.00 },
    ];
  });

  it("atomic double-entry transfer updates both source and destination account balances", () => {
    const txn = store.addTransaction({
      householdId: "hh-1",
      accountId: "acc-1", // HDFC (source)
      transferAccountId: "acc-2", // ICICI Credit (destination)
      date: new Date().toISOString(),
      amount: 50000.00,
      type: "TRANSFER",
      isRecurring: false,
      description: "Credit card bill payment",
    });

    const hdfc = store.accounts.find((a) => a.id === "acc-1");
    const icici = store.accounts.find((a) => a.id === "acc-2");

    // HDFC balance should decrease by 50,000 (345,000 - 50,000 = 295,000)
    expect(hdfc?.balance).toBe(295000.00);

    // ICICI Credit balance should increase by 50,000 (-24,500 + 50,000 = 25,500)
    expect(icici?.balance).toBe(25500.00);

    // Deleting the transaction reverses both balances back
    store.deleteTransaction(txn.id);
    expect(hdfc?.balance).toBe(345000.00);
    expect(icici?.balance).toBe(-24500.00);
  });

  it("monthly budget calculation filters transactions strictly by month and year", () => {
    // Add August 2026 transaction (Month 8)
    store.addTransaction({
      householdId: "hh-1",
      accountId: "acc-1",
      categoryId: "cat-2", // Groceries
      date: new Date(2026, 7, 15).toISOString(), // Aug 15 2026
      amount: 12000.00,
      type: "EXPENSE",
      isRecurring: false,
      description: "August Groceries",
    });

    // Add September 2026 transaction (Month 9)
    store.addTransaction({
      householdId: "hh-1",
      accountId: "acc-1",
      categoryId: "cat-2", // Groceries
      date: new Date(2026, 8, 10).toISOString(), // Sep 10 2026
      amount: 14500.00,
      type: "EXPENSE",
      isRecurring: false,
      description: "September Groceries",
    });

    // Budget b for September 2026
    const b = store.budgets[0];

    // Compute month-scoped spent
    const septSpent = store.transactions
      .filter((t) => {
        if (t.categoryId !== b.categoryId || t.type !== "EXPENSE") return false;
        const d = new Date(t.date);
        return d.getMonth() + 1 === b.month && d.getFullYear() === b.year;
      })
      .reduce((acc, t) => acc + t.amount, 0);

    // Should equal ONLY September transaction (14,500) and ignore August (12,000)
    expect(septSpent).toBe(14500.00);
  });

  it("ledger-backed goal contribution updates goal progress and deducts bank account balance", () => {
    const success = store.contributeToGoal("gl-1", 25000.00, "acc-1");
    expect(success).toBe(true);

    const goal = store.goals.find((g) => g.id === "gl-1");
    const hdfc = store.accounts.find((a) => a.id === "acc-1");

    // Goal currentAmount increases (420,000 + 25,000 = 445,000)
    expect(goal?.currentAmount).toBe(445000.00);

    // HDFC Bank balance decreases (345,000 - 25,000 = 320,000)
    expect(hdfc?.balance).toBe(320000.00);

    // Transaction ledger record was created
    expect(store.transactions.length).toBe(1);
    expect(store.transactions[0].description).toContain("Goal Savings Allocation");
    expect(store.transactions[0].amount).toBe(25000.00);
  });

  it("forecasting simulation applies market equity CAGR strictly to liquid investments", () => {
    const result = runForecastSimulation({
      startYear: 2026,
      endYear: 2050,
      initialLiquidInvestments: 1000000.00, // 10 Lakhs liquid
      initialPhysicalAssets: 10000000.00,  // 1 Crore physical real estate
      realEstateAppreciationRate: 5.0,
      initialAnnualIncome: 2000000.00,
      initialAnnualExpenses: 500000.00,
      inflationRate: 6.0,
      salaryGrowthRate: 8.0,
      investmentReturnRate: 11.0, // 11% market return
    });

    const year2026 = result.years[0];

    // Market return on 1st year liquid capital (10 Lakhs @ 11%) = 1,10,000
    expect(year2026.investmentReturns).toBe(110000.00);

    // Verify physical assets appreciated separately at 5% rate
    const year2027 = result.years[1];
    expect(year2027.physicalAssetsValue).toBe(10500000.00); // 1 Crore * 1.05
  });
});
