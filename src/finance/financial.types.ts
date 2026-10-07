import { Prisma } from "@prisma/client";

export type AccountType = "BANK" | "CREDIT" | "CASH" | "INVESTMENT" | "LOAN" | "EXPENSE" | "INCOME" | "EQUITY" | "OTHER";

export interface JournalEntryInput {
  accountId?: string | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description?: string | null;
}

export interface PostJournalParams {
  householdId: string;
  date?: Date;
  referenceNo?: string | null;
  description: string;
  status?: "POSTED" | "VOIDED";
  idempotencyKey?: string | null;
  reversalOfId?: string | null;
  entries: JournalEntryInput[];
}

export interface SingleAccountBalanceCheck {
  id: string;
  type: string;
  balance: Prisma.Decimal;
  creditLimit: Prisma.Decimal | null;
}
