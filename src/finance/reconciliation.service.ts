import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LedgerService } from "./ledger.service";

export interface ReconciliationResult {
  accountId: string;
  accountName: string;
  accountType: string;
  storedBalance: number;
  calculatedBalance: number;
  difference: number;
  status: "MATCH" | "DRIFT";
}

export class ReconciliationService {
  /**
   * Reconcile a single account by checking stored Account.balance against JournalEntries sum.
   * Read-only. Does not mutate balance.
   */
  static async reconcileAccount(accountId: string, householdId: string): Promise<ReconciliationResult> {
    const account = await prisma.account.findFirst({
      where: { id: accountId, householdId },
    });
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");

    const entries = await prisma.journalEntry.findMany({
      where: {
        accountId,
        journal: { householdId, status: { in: ["POSTED", "VOIDED"] } },
      },
      select: { debit: true, credit: true },
    });

    let calculatedBalance = new Prisma.Decimal(0);
    for (const entry of entries) {
      const delta = LedgerService.getBalanceDelta(account.type, entry.debit, entry.credit);
      calculatedBalance = calculatedBalance.add(delta);
    }

    const storedNum = account.balance.toNumber();
    const calcNum = calculatedBalance.toNumber();
    const diff = Math.abs(storedNum - calcNum);

    const isMatch = diff < 0.001;

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      storedBalance: storedNum,
      calculatedBalance: calcNum,
      difference: diff,
      status: isMatch ? "MATCH" : "DRIFT",
    };
  }

  /**
   * Reconcile all active accounts in a household.
   */
  static async reconcileHousehold(householdId: string): Promise<ReconciliationResult[]> {
    const accounts = await prisma.account.findMany({
      where: { householdId, isArchived: false },
      select: { id: true },
    });

    const results: ReconciliationResult[] = [];
    for (const acc of accounts) {
      results.push(await this.reconcileAccount(acc.id, householdId));
    }
    return results;
  }
}
