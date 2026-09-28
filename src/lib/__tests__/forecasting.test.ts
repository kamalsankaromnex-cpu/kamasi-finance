import { describe, it, expect } from "vitest";
import { runForecastSimulation } from "../forecasting";

describe("2026-2050 Financial Forecasting Engine Tests", () => {
  it("projects terminal 2050 net worth under 6% inflation, 8% salary growth, and 11% CAGR return", () => {
    const result = runForecastSimulation({
      startYear: 2026,
      endYear: 2050,
      initialLiquidInvestments: 9083000,
      initialAnnualIncome: 3900000,
      initialAnnualExpenses: 894000,
      inflationRate: 6.0,
      salaryGrowthRate: 8.0,
      investmentReturnRate: 11.0,
      retirementAge: 55,
      currentAge: 32,
      milestones: [
        { name: "Villa Construction", targetYear: 2030, estimatedCost: 3500000, type: "EXPENSE" },
      ],
    });

    expect(result.years.length).toBe(25);
    expect(result.years[0].year).toBe(2026);
    expect(result.years[24].year).toBe(2050);

    // Terminal net worth should be positive and substantially grown
    expect(result.terminalNetWorth2050).toBeGreaterThan(9083000);
  });

  it("deducts major milestone expense in target year 2030", () => {
    const result = runForecastSimulation({
      startYear: 2026,
      endYear: 2050,
      initialLiquidInvestments: 5000000,
      initialAnnualIncome: 2000000,
      initialAnnualExpenses: 500000,
      inflationRate: 5.0,
      salaryGrowthRate: 7.0,
      investmentReturnRate: 10.0,
      milestones: [
        { name: "House Down Payment", targetYear: 2030, estimatedCost: 2000000, type: "EXPENSE" },
      ],
    });

    const year2030 = result.years.find((y) => y.year === 2030);
    expect(year2030?.milestoneExpenses).toBe(2000000);
  });
});
