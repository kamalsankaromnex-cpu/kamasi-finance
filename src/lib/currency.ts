import { Prisma } from "@prisma/client";

/**
 * Format monetary amount into Indian Rupee (INR ₹) standard format (e.g. ₹1,50,000.00).
 */
export function formatINR(amount: number | Prisma.Decimal | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "₹0.00";
  }

  const num = typeof amount === "number"
    ? amount
    : typeof amount === "string"
    ? parseFloat(amount)
    : amount.toNumber();

  if (isNaN(num)) return "₹0.00";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * Converts input value to number safely for UI display or mathematical calculations.
 */
export function decimalToNumber(val: Prisma.Decimal | number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return val.toNumber();
}

/**
 * Parses user string input into Prisma.Decimal representation.
 */
export function toDecimal(val: number | string | Prisma.Decimal): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}
