import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { isValidIdempotencyKey, isValidTransactionType, parseIsoDate, parseNonNegativeMoney, parsePositiveMoney } from "../financial-validation";

describe("financial request validation", () => {
  it("accepts finite positive decimal amounts and rejects invalid boundaries", () => {
    expect(parsePositiveMoney("0.01")?.toString()).toBe("0.01");
    expect(parsePositiveMoney("100000000000000.99")?.toString()).toBe("100000000000000.99");
    for (const value of ["0", "-0.01", "NaN", "Infinity", "12junk", "", null, true]) {
      expect(parsePositiveMoney(value)).toBeNull();
    }
  });

  it("accepts only the supported transaction kinds", () => {
    expect(isValidTransactionType("INCOME")).toBe(true);
    expect(isValidTransactionType("EXPENSE")).toBe(true);
    expect(isValidTransactionType("TRANSFER")).toBe(true);
    expect(isValidTransactionType("UNKNOWN")).toBe(false);
  });

  it("validates non-negative money and real ISO calendar dates", () => {
    expect(parseNonNegativeMoney("0")?.toString()).toBe("0");
    expect(parseNonNegativeMoney("12.34")?.toString()).toBe("12.34");
    for (const value of ["-0.01", "NaN", "Infinity", "12junk", true, null]) {
      expect(parseNonNegativeMoney(value)).toBeNull();
    }
    expect(parseIsoDate("2024-02-29")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(parseIsoDate("2025-02-29")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
    expect(parseIsoDate("2026-01-01T12:30:00Z")?.toISOString()).toBe("2026-01-01T12:30:00.000Z");
    expect(parseIsoDate("2026-01-01T12:30:00")).toBeNull();
  });

  it("preserves exact decimal arithmetic for currency amounts", () => {
    const tenCents = parsePositiveMoney("0.10");
    const twentyCents = parsePositiveMoney("0.20");
    expect(Prisma.Decimal.add(tenCents!, twentyCents!).toString()).toBe("0.3");
  });

  it("requires sufficiently long opaque idempotency keys", () => {
    expect(isValidIdempotencyKey("e2c1e6be-82b3-4fc8-8a36-34383f59831d")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("../etc/passwd................")).toBe(false);
  });
});
