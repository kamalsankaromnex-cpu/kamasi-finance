import { describe, it, expect } from "vitest";
import { formatINR, decimalToNumber, toDecimal } from "../currency";
import { Prisma } from "@prisma/client";

describe("Currency & Decimal Utility Unit Tests", () => {
  it("formats numbers into Indian Rupee (INR ₹) standard format", () => {
    expect(formatINR(150000)).toBe("₹1,50,000.00");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(34500.5)).toBe("₹34,500.50");
  });

  it("handles Prisma Decimal values safely without precision loss", () => {
    const dec = new Prisma.Decimal("4200000.75");
    expect(decimalToNumber(dec)).toBe(4200000.75);
    expect(formatINR(dec)).toBe("₹42,00,000.75");
  });

  it("converts input to Prisma Decimal", () => {
    const converted = toDecimal("9500000.00");
    expect(converted).toBeInstanceOf(Prisma.Decimal);
    expect(converted.toString()).toBe("9500000");
  });
});
