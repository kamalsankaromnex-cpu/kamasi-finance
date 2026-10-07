import { Prisma } from "@prisma/client";
import { PostJournalParams, JournalEntryInput } from "./financial.types";
import { FinancialAuditService } from "./audit.service";
import { AuditService } from "./audit/audit.service";

export class LedgerService {
  /**
   * Account-type-aware balance delta calculation.
   * Centralized accounting normal balance semantics:
   * - Debit-Normal: ASSET, BANK, CASH, INVESTMENT, EXPENSE, CREDIT (stored as asset/card balance)
   *   balance = opening + debit - credit  => delta = debit - credit
   * - Credit-Normal: LIABILITY, LOAN, INCOME, EQUITY, OTHER
   *   balance = opening + credit - debit  => delta = credit - debit
   */
  static getBalanceDelta(accountType: string, debit: Prisma.Decimal, credit: Prisma.Decimal): Prisma.Decimal {
    const typeUpper = (accountType || "BANK").toUpperCase();
    if (["BANK", "CASH", "INVESTMENT", "EXPENSE", "ASSET", "CREDIT"].includes(typeUpper)) {
      return debit.sub(credit);
    }
    // LIABILITY, LOAN, INCOME, EQUITY, OTHER
    return credit.sub(debit);
  }

  /**
   * Validate double-entry equality and structural rules.
   * 1. Minimum 2 entries.
   * 2. No negative debit or credit.
   * 3. No entry containing both debit > 0 and credit > 0.
   * 4. SUM(debit) === SUM(credit).
   */
  static validateJournal(entries: JournalEntryInput[]): { totalDebits: Prisma.Decimal; totalCredits: Prisma.Decimal } {
    if (!entries || entries.length < 2) {
      throw new Error("INVALID_JOURNAL: A journal must contain at least 2 entries");
    }

    let totalDebits = new Prisma.Decimal(0);
    let totalCredits = new Prisma.Decimal(0);

    for (const entry of entries) {
      const debit = new Prisma.Decimal(entry.debit || 0);
      const credit = new Prisma.Decimal(entry.credit || 0);

      if (debit.isNegative() || credit.isNegative()) {
        throw new Error("INVALID_JOURNAL: Negative debit or credit amounts are prohibited");
      }
      if (debit.gt(0) && credit.gt(0)) {
        throw new Error("INVALID_JOURNAL: An entry cannot contain both non-zero debit and non-zero credit");
      }
      if (debit.isZero() && credit.isZero()) {
        throw new Error("INVALID_JOURNAL: Zero-value entry is not permitted");
      }
      totalDebits = totalDebits.add(debit);
      totalCredits = totalCredits.add(credit);
    }

    if (!totalDebits.equals(totalCredits)) {
      throw new Error(`UNBALANCED_JOURNAL: Total debits (${totalDebits}) must equal total credits (${totalCredits})`);
    }

    return { totalDebits, totalCredits };
  }

  /**
   * Primary single-path Financial Ledger Posting Engine.
   * The ONLY application component allowed to mutate Account.balance.
   * Atomically validates journal, aggregates account deltas, validates overdraft limits,
   * creates Journal, JournalEntries, updates Account.balance ONCE per account, and records audit log.
   */
  static async postJournal(tx: Prisma.TransactionClient, params: PostJournalParams) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingJournal = await tx.journal.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
        include: { entries: true },
      });
      if (existingJournal) {
        if (existingJournal.householdId !== params.householdId) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_CROSS_HOUSEHOLD");
        }
        return existingJournal;
      }
    }

    // 2. Validate double-entry equality
    this.validateJournal(params.entries);

    // 3. Aggregate net deltas per account ID to avoid multiple updates on the same account
    const accountMap = new Map<string, { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>();

    for (const entry of params.entries) {
      if (!entry.accountId) continue;
      const deb = new Prisma.Decimal(entry.debit || 0);
      const cred = new Prisma.Decimal(entry.credit || 0);

      const existing = accountMap.get(entry.accountId);
      if (existing) {
        existing.debit = existing.debit.add(deb);
        existing.credit = existing.credit.add(cred);
      } else {
        accountMap.set(entry.accountId, { accountId: entry.accountId, debit: deb, credit: cred });
      }
    }

    // 4. Validate accounts, compute deltas, and enforce overdraft / credit limit checks
    const accountUpdates: { accountId: string; delta: Prisma.Decimal; currentBalance: Prisma.Decimal; newBalance: Prisma.Decimal }[] = [];

    for (const [accountId, aggregated] of accountMap.entries()) {
      const account = await tx.account.findFirst({
        where: { id: accountId, householdId: params.householdId, isArchived: false },
      });
      if (!account) {
        throw new Error(`ACCOUNT_UNAVAILABLE: Account ${accountId} not found in household`);
      }

      const delta = this.getBalanceDelta(account.type, aggregated.debit, aggregated.credit);
      const projectedBalance = account.balance.add(delta);

      // Overdraft & Credit Limit Protection Check
      if (account.type === "CREDIT" && account.creditLimit) {
        const minAllowedBalance = account.creditLimit.negated();
        if (projectedBalance.lt(minAllowedBalance)) {
          throw new Error("INSUFFICIENT_FUNDS: Transaction exceeds credit card limit");
        }
      } else if (["BANK", "CASH", "INVESTMENT"].includes(account.type.toUpperCase())) {
        if (projectedBalance.lt(0)) {
          throw new Error("INSUFFICIENT_FUNDS: Available account balance is insufficient");
        }
      }

      accountUpdates.push({
        accountId: account.id,
        delta,
        currentBalance: account.balance,
        newBalance: projectedBalance,
      });
    }

    // 5. SOLE AUTHORITATIVE ACCOUNT BALANCE MUTATION IN THE ENTIRE APPLICATION
    for (const update of accountUpdates) {
      await tx.account.update({
        where: { id: update.accountId },
        data: { balance: { increment: update.delta } },
      });
    }

    // 6. Create Journal & JournalEntries Records
    const journal = await tx.journal.create({
      data: {
        householdId: params.householdId,
        date: params.date || new Date(),
        referenceNo: params.referenceNo || null,
        description: params.description,
        status: params.status || "POSTED",
        idempotencyKey: params.idempotencyKey || null,
        reversalOfId: params.reversalOfId || null,
        entries: {
          create: params.entries.map((e) => ({
            accountId: e.accountId || null,
            debit: new Prisma.Decimal(e.debit || 0),
            credit: new Prisma.Decimal(e.credit || 0),
            description: e.description || null,
          })),
        },
      },
      include: { entries: true },
    });

    // 7. Audit Log Record
    await FinancialAuditService.recordLog(tx, {
      householdId: params.householdId,
      action: params.reversalOfId ? "REVERSE" : "CREATE",
      entity: "Journal",
      entityId: journal.id,
      reference: params.idempotencyKey || params.referenceNo || null,
      after: { journalId: journal.id, description: params.description, accountUpdates },
    });

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "JOURNAL",
      entityId: journal.id,
      action: params.reversalOfId ? "JOURNAL_REVERSED" : "JOURNAL_POSTED",
      fromState: params.reversalOfId ? "POSTED" : "NONE",
      toState: "POSTED",
      actorUserId: "SYSTEM",
      reason: params.description,
      metadata: { idempotencyKey: params.idempotencyKey, reversalOfId: params.reversalOfId, accountUpdates },
    });

    return journal;
  }

  /**
   * Reverse a Journal by posting a compensating reversal journal with swapped debits & credits.
   * Invariants enforced:
   * 1. Household Isolation: original.householdId MUST match requested householdId.
   * 2. Status: original.status MUST be 'POSTED'.
   * 3. Single Reversal: An original journal can only be reversed ONCE (reversalOfId @unique).
   * 4. Irreversibility of Reversals: A reversal journal itself CANNOT be reversed.
   */
  static async reverseJournal(tx: Prisma.TransactionClient, journalId: string, householdId: string) {
    const original = await tx.journal.findUnique({
      where: { id: journalId },
      include: { entries: true, reversals: true },
    });
    if (!original) throw new Error("JOURNAL_NOT_FOUND");

    // Household Isolation (P0 Security)
    if (original.householdId !== householdId) {
      throw new Error("HOUSEHOLD_ISOLATION_VIOLATION: Cross-household journal reversal is prohibited");
    }

    // Status check
    if (original.status === "VOIDED") {
      throw new Error("JOURNAL_ALREADY_VOIDED: Journal has already been voided");
    }

    // Single Reversal Invariant (1:1)
    if (original.reversals && original.reversals.length > 0) {
      throw new Error("SINGLE_REVERSAL_INVARIANT: Journal has already been reversed");
    }

    // Cannot reverse a reversal journal
    if (original.reversalOfId) {
      throw new Error("CANNOT_REVERSE_REVERSAL: A compensating reversal journal cannot be reversed");
    }

    // Swap debits and credits for compensating reversal journal
    const reversalEntries: JournalEntryInput[] = original.entries.map((e) => ({
      accountId: e.accountId,
      debit: e.credit,
      credit: e.debit,
      description: `Reversal of: ${e.description || original.description}`,
    }));

    // Post Reversal Journal
    const reversalJournal = await this.postJournal(tx, {
      householdId,
      description: `Reversal of Journal ${original.id}: ${original.description}`,
      reversalOfId: original.id,
      entries: reversalEntries,
    });

    // Mark original journal status as VOIDED
    await tx.journal.update({
      where: { id: original.id },
      data: { status: "VOIDED" },
    });

    return reversalJournal;
  }
}
