# Financial Module Rules & Standardized Flow

## The 10 Frozen Architecture Rules

1. **Sole Balance Mutator**: `LedgerService` is the **only** permitted mutator of `Account.balance`.
2. **Immutable Journals**: Posted `Journal` records are immutable. Reversals use compensating entries (`reversalOfId`).
3. **Balanced Posting**: Every financial command produces a balanced double-entry `Journal` ($\sum \text{Debits} = \sum \text{Credits}$).
4. **Atomic Transactions**: All domain state updates, ledger commands, lifecycle logs, and audit entries execute within a single Prisma transaction (`tx`).
5. **Mandatory Idempotency**: Financially mutating API endpoints and commands require `idempotencyKey` handling.
6. **Multi-Tenant Isolation**: Every query and mutation MUST filter by `householdId`. Cross-household operations fail immediately.
7. **Separate Lifecycles**: Business record state (`DRAFT`, `ACTIVE`) is separate from Ledger status (`POSTED`, `VOIDED`).
8. **Append-Only Audit**: Audit logs are append-only SHA-256 hash chains (`AuditEvent`). Updates/deletes are prohibited.
9. **Zero Silent Deletion**: Historical financial records are never deleted; status transitions to `ARCHIVED` or `VOIDED`.
10. **Reconcilable Projections**: Cached domain balances (e.g. `Asset.currentValue`) MUST reconcile against underlying ledger events.

---

## Standardized Module Pipeline Architecture

Every financial module in Phase 3 MUST follow this exact sequence:

```
[1. UI / API Request]
       │
       ▼
[2. Domain Service] ──► (Validates parameters, checks idempotency)
       │
       ▼
[3. Lifecycle Validator] ──► (Asserts valid status transition, e.g., DRAFT -> ACTIVE)
       │
       ▼
[4. FinancialCommand] ──► (Constructs balanced JournalEntry inputs)
       │
       ▼
[5. LedgerService] ──► (Enforces balance check, updates Account.balance, creates Journal)
       │
       ▼
[6. Domain Event / Record Update] ──► (Updates domain state & creates sub-ledger event)
       │
       ▼
[7. AuditService] ──► (Appends SHA-256 hash-chained AuditEvent record)
```
