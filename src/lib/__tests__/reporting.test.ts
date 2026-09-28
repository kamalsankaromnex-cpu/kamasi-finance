import { describe, expect, it } from "vitest";
import { summarizeMonth } from "../reporting";

describe("ledger report aggregation", () => {
  it("sums current-month income and expenses while excluding transfers and voids", () => {
    const result = summarizeMonth([
      { date: "2026-09-01T12:00:00.000Z", amount: "5000.00", type: "INCOME" },
      { date: "2026-09-10T12:00:00.000Z", amount: 8500, type: "EXPENSE" },
      { date: "2026-09-12T12:00:00.000Z", amount: 1200, type: "TRANSFER" },
      { date: "2026-09-13T12:00:00.000Z", amount: 50, type: "VOIDED" },
      { date: "2026-09-14T12:00:00.000Z", amount: 50, type: "EXPENSE", isVoided: true },
      { date: "2026-08-31T12:00:00.000Z", amount: 900, type: "INCOME" },
      { date: "invalid", amount: 99, type: "INCOME" },
    ], 2026, 8);

    expect(result).toEqual({ income: 5000, expenses: 8500 });
    expect(result.income - result.expenses).toBe(-3500);
  });

  it("keeps decimal currency sums exact to minor units", () => {
    const result = summarizeMonth([
      { date: "2026-09-01T12:00:00.000Z", amount: "0.10", type: "INCOME" },
      { date: "2026-09-02T12:00:00.000Z", amount: "0.20", type: "INCOME" },
    ], 2026, 8);
    expect(Math.round(result.income * 100)).toBe(30);
  });
});
