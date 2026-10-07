import { Prisma } from "@prisma/client";
import { LedgerService } from "./ledger.service";
import { ReconciliationService } from "./reconciliation.service";
import { PostJournalParams } from "./financial.types";

export interface CreateJournalParams {
  householdId: string;
  description: string;
  referenceNo?: string;
  idempotencyKey?: string;
  entries: {
    accountId?: string;
    debit: number | Prisma.Decimal;
    credit: number | Prisma.Decimal;
    description?: string;
  }[];
}

export class JournalService {
  /**
   * Legacy wrapper delegating double-entry journal posting to LedgerService.
   */
  static async postJournal(
    tx: Prisma.TransactionClient,
    params: CreateJournalParams
  ) {
    const postParams: PostJournalParams = {
      householdId: params.householdId,
      description: params.description,
      referenceNo: params.referenceNo,
      idempotencyKey: params.idempotencyKey,
      entries: params.entries.map((e) => ({
        accountId: e.accountId,
        debit: new Prisma.Decimal(e.debit),
        credit: new Prisma.Decimal(e.credit),
        description: e.description,
      })),
    };

    return LedgerService.postJournal(tx, postParams);
  }

  /**
   * Legacy wrapper delegating account reconciliation to ReconciliationService.
   */
  static async reconcileAccount(
    tx: Prisma.TransactionClient,
    accountId: string
  ) {
    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    return ReconciliationService.reconcileAccount(account.id, account.householdId);
  }
}
