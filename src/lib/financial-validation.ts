import { Prisma } from "@prisma/client";

export function parsePositiveMoney(value: unknown): Prisma.Decimal | null {
  if (!(typeof value === "string" || typeof value === "number") || value === "" || !Number.isFinite(Number(value))) return null;
  try {
    const amount = new Prisma.Decimal(value);
    return amount.isFinite() && amount.greaterThan(0) ? amount : null;
  } catch {
    return null;
  }
}

export function parseNonNegativeMoney(value: unknown): Prisma.Decimal | null {
  if (!(typeof value === "string" || typeof value === "number") || value === "" || !Number.isFinite(Number(value))) return null;
  try {
    const amount = new Prisma.Decimal(value);
    return amount.isFinite() && !amount.isNegative() ? amount : null;
  } catch {
    return null;
  }
}

export function parseFiniteMoney(value: unknown): Prisma.Decimal | null {
  if (!(typeof value === "string" || typeof value === "number") || value === "" || !Number.isFinite(Number(value))) return null;
  try {
    const amount = new Prisma.Decimal(value);
    return amount.isFinite() ? amount : null;
  } catch {
    return null;
  }
}

export function maskAccountNumber<T extends { accountNumber?: string | null }>(account: T) {
  const { accountNumber, ...safeAccount } = account;
  if (!accountNumber) return { ...safeAccount, accountNumber: null };
  const digits = accountNumber.replace(/\D/g, "");
  return { ...safeAccount, accountNumber: digits ? `**** ${digits.slice(-4)}` : "****" };
}

/** Accept date-only values or ISO timestamps with an explicit timezone. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year && calendarDate.getUTCMonth() === month - 1 && calendarDate.getUTCDate() === day ? date : null;
}

export function isValidIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9._:-]{16,128}$/.test(value);
}

export function isValidTransactionType(value: unknown): value is "INCOME" | "EXPENSE" | "TRANSFER" {
  return value === "INCOME" || value === "EXPENSE" || value === "TRANSFER";
}

export function hideIdempotencyKey<T extends { idempotencyKey?: string | null }>(transaction: T) {
  const { idempotencyKey: _idempotencyKey, ...safeTransaction } = transaction;
  return safeTransaction;
}
