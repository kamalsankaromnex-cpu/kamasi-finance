# KAMASI FINANCE — FINANCIAL CORE CONTRACT v1.0

This document defines the binding architectural constitution for the financial engine of **Kamasi Finance**.
All future feature developments, API modifications, domain service extensions, and AI contributions MUST comply with these 16 non-negotiable rules.

---

## 16 NON-NEGOTIABLE ARCHITECTURAL LAWS

1. **`Account.balance` is a projection**:
   `Account.balance` represents the cumulative sum of historical double-entry journal entries and must match the ledger projection calculated by `ReconciliationService`.

2. **`LedgerService` is the SOLE Balance Mutation Owner**:
   No UI, API route, background job, or domain service (Goal, Investment, Asset, Liability, Transaction, CSV) may directly execute balance mutations (`increment`, `decrement`, or `balance: x`). All balance updates flow exclusively through `LedgerService.postJournal`.

3. **Posted Journals are Immutable**:
   Once a `Journal` enters `POSTED` status, its amount, debits, credits, and date can NEVER be updated or deleted from the database.

4. **Corrections happen through Reversal Journals**:
   The ONLY permitted mechanism to amend a posted journal is by creating a compensating reversal journal via `LedgerService.reverseJournal()`.

5. **Single Journal Link Invariant**:
   Every posted financial transaction MUST be deterministically linked to exactly one `Journal` via `Transaction.journalId`.

6. **Double-Entry Balance Law**:
   Every journal posting MUST be balanced:
   $$\sum \text{debit} === \sum \text{credit}$$
   Unbalanced postings throw `UNBALANCED_JOURNAL`.

7. **Reversal is 1:1**:
   A journal can be reversed at most ONCE. Enforced by database constraint `reversalOfId String? @unique`.

8. **Irreversibility of Reversal Journals**:
   A compensating reversal journal itself CANNOT be reversed (`CANNOT_REVERSE_REVERSAL`).

9. **Idempotency Standard**:
   All financial operations (Expense, Income, Transfer, Refund, Goal Contribution, Goal Withdrawal, Adjustment) accept an `Idempotency-Key`. Submitting a duplicate key returns the existing operation without creating duplicate journals or balance deltas.

10. **Mandatory Household Isolation (P0 Security)**:
    Cross-household access is strictly prohibited across Accounts, Journals, Transactions, Receipts, Goals, Assets, and Liabilities.

11. **Account Type Immutability**:
    An Account's `type` (`BANK`, `CREDIT`, `INVESTMENT`, `CASH`, `LOAN`) is immutably locked once historical ledger activity exists for that account.

12. **Account Currency Immutability**:
    An Account's `currency` is immutably locked once historical ledger activity exists for that account.

13. **Transfers are Not Income or Expense**:
    Account-to-account transfers MUST be processed via `FinancialCommand.postTransfer()` debiting source and crediting destination accounts. Transfers NEVER count as income or expense.

14. **Refund Invariant**:
    Cumulative refunds on an expense transaction can NEVER exceed the original transaction amount ($\text{Total Refunds} \le \text{Original Amount}$).

15. **Atomic Concurrency Guarantee**:
    Concurrent financial operations (goal withdrawals, refunds, transfers) MUST execute inside isolated database transactions (`tx`) using atomic conditional checks (`currentAmount >= requestedAmount`).

16. **Deterministic Migration Reproducibility**:
    The database migration history MUST cleanly reproduce the complete production schema from scratch (`EMPTY DB -> npx prisma migrate deploy`).

---

## APPLICATION ARCHITECTURE PIPELINE

```text
               UI Component / Import
                         │
                         ▼
                    API Route
                         │
                         ▼
               Domain Application Service
                         │
                         ▼
                 FinancialCommand
                         │
                         ▼
                  LedgerService (SOLE balance mutation owner)
                         │
        ┌────────────────┴────────────────┐
        │ - Idempotency Validation       │
        │ - Overdraft / Credit Check      │
        │ - Double-Entry Balance Check    │
        │ - Account-Type Delta Calculation│
        └────────────────┬────────────────┘
                         │
                         ▼
        Balanced Journal + Entries + Account.balance Update
```
