# Financial Core Contract & Non-Negotiables

## Executive Summary

This contract defines the immutable financial engineering non-negotiables of the Kamasi Finance platform established across Phase 1 and Phase 2. Every system module, developer, domain service, and API route MUST adhere strictly to these principles.

---

## 1. Non-Negotiable Financial Invariants

1. **Double-Entry Balance Constraint**
   - For every posted `Journal`, the sum of debits MUST equal the sum of credits:
     $$\sum \text{Debits} = \sum \text{Credits}$$
   - Unbalanced journals are rejected atomically at the database level.

2. **Sole Balance Mutator Rule**
   - `LedgerService` is the **only** component in the entire application authorized to mutate `Account.balance`.
   - Direct `prisma.account.update({ data: { balance: ... } })` calls outside `LedgerService.postJournal()` are strictly forbidden.

3. **Immutability of Posted Journals**
   - Once a `Journal` is created with status `POSTED`, it is immutable.
   - Financial corrections MUST be made via compensating reversal journals (`reversalOfId`) or new financial commands. Journals are never edited or silently deleted.

4. **Atomic Transaction Scoping**
   - Domain state changes, double-entry journal postings, account balance mutations, lifecycle history logs, and SHA-256 audit events MUST execute within a single database transaction (`tx`).
   - If any step fails, the entire transaction rolls back cleanly.

5. **Mandatory Idempotency**
   - All financially mutating commands support an `idempotencyKey`.
   - Concurrent or repeated submissions with the same `idempotencyKey` yield the identical financial result without duplicate journal postings or balance mutations.

6. **Strict Multi-Tenant Household Isolation**
   - Every database query and financial command MUST be scoped to `householdId`.
   - Cross-household access attempts trigger security audit events (`CROSS_HOUSEHOLD_ACCESS_DENIED`) and fail immediately.

7. **Cryptographic Append-Only Audit Trail**
   - Every state transition and financial action produces a SHA-256 hash-chained `AuditEvent`.
   - The audit log is append-only (`record()`). No update or delete operations exist.

8. **Separation of Business Record and Ledger Lifecycle**
   - Business records manage workflow state (`DRAFT`, `ACTIVE`, `EXPECTED`, `DISPOSED`).
   - Ledger records double-entry accounting state (`Journal`, `JournalEntry`).
   - Audit trail records attribution, reason, and cryptographic state hash (`AuditEvent`).

---

## 2. Standardized Financial Pipeline

$$\text{UI / API Request} \longrightarrow \text{Domain Service} \longrightarrow \text{Lifecycle Validator} \longrightarrow \text{FinancialCommand} \longrightarrow \text{LedgerService} \longrightarrow \text{Journal + Entries} \longrightarrow \text{Account.balance} \longrightarrow \text{AuditService}$$

---

## 3. Compliance Enforcement

Any code PR or modification violating these contract rules will fail automated regression tests (`phase27-ledger-integrity.test.ts` and `phase1-fresh-db-check.ps1`).
