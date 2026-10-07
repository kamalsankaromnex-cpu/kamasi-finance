import { Prisma } from "@prisma/client";
import { LedgerService } from "@/finance/ledger.service";

/**
 * Legacy compatibility wrapper for reverseLedgerTransaction.
 * Delegates balance reversal strictly to LedgerService.reverseJournal() or compensating journal posting.
 */
export async function reverseLedgerTransaction(
  tx: Prisma.TransactionClient,
  input: {
    transactionId: string;
    householdId: string;
    voidedByUserId: string;
  },
) {
  const transaction = await tx.transaction.findFirst({
    where: { id: input.transactionId, householdId: input.householdId },
  });

  if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
  if (transaction.isVoided) throw new Error("TRANSACTION_ALREADY_VOIDED");

  if (transaction.refundedAmount.greaterThan(0)) {
    throw new Error("CANNOT_VOID_TRANSACTION_WITH_REFUNDS");
  }

  // 1. Direct transaction.journalId relationship
  const targetJournalId = transaction.journalId;

  if (targetJournalId) {
    await LedgerService.reverseJournal(tx, targetJournalId, input.householdId);
  } else {
    // Post a compensating reversal journal for this transaction
    const entries = [];
    if (transaction.refundOfId) {
      entries.push(
        { accountId: transaction.accountId, debit: new Prisma.Decimal(0), credit: transaction.amount, description: `Reversal of Refund ${transaction.id}` },
        { debit: transaction.amount, credit: new Prisma.Decimal(0), description: `Compensating Entry` }
      );
      await tx.transaction.update({
        where: { id: transaction.refundOfId },
        data: { refundedAmount: { decrement: transaction.amount } },
      });
    } else if (transaction.type === "INCOME") {
      entries.push(
        { accountId: transaction.accountId, debit: new Prisma.Decimal(0), credit: transaction.amount, description: `Reversal of Income ${transaction.id}` },
        { debit: transaction.amount, credit: new Prisma.Decimal(0), description: `Compensating Entry` }
      );
    } else if (transaction.type === "EXPENSE") {
      entries.push(
        { accountId: transaction.accountId, debit: transaction.amount, credit: new Prisma.Decimal(0), description: `Reversal of Expense ${transaction.id}` },
        { debit: new Prisma.Decimal(0), credit: transaction.amount, description: `Compensating Entry` }
      );
    } else if (transaction.type === "TRANSFER" && transaction.transferAccountId) {
      entries.push(
        { accountId: transaction.accountId, debit: transaction.amount, credit: new Prisma.Decimal(0), description: `Reversal of Transfer Out ${transaction.id}` },
        { accountId: transaction.transferAccountId, debit: new Prisma.Decimal(0), credit: transaction.amount, description: `Reversal of Transfer In ${transaction.id}` }
      );
    }

    if (entries.length >= 2) {
      await LedgerService.postJournal(tx, {
        householdId: input.householdId,
        description: `Reversal of Transaction ${transaction.id}`,
        entries,
      });
    }
  }

  // Mark transaction as voided
  const voidedTx = await tx.transaction.update({
    where: { id: transaction.id },
    data: {
      isVoided: true,
      voidedAt: new Date(),
      voidedByUserId: input.voidedByUserId,
    },
  });

  return voidedTx;
}
