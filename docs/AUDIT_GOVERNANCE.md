# Audit & Governance Specification & Architecture

## Overview

The Audit & Governance Engine in Kamasi Finance provides an append-only, tamper-evident audit log for all financial events, entity state transitions, security decisions, and system operations.

---

## 10 Non-Negotiable Governance Rules

1. **Every Financial State Transition Must Generate an Audit Record**
   - No financial record (Expense, Income, Transfer, Goal, Journal) may change state without producing a corresponding `AuditEvent`.

2. **Audit Generation Must Be Atomic with Domain State Changes**
   - Audit event insertion occurs inside the exact same database transaction (`tx`) as the domain mutation and ledger command. If audit insertion fails, the entire transaction rolls back.

3. **Audit Records Are Strictly Append-Only**
   - The system exposes zero `UPDATE` or `DELETE` API endpoints or methods for `AuditEvent`. Historical audit events are immutable.

4. **Tamper-Evident SHA-256 Hash Chaining**
   - Each `AuditEvent` stores `previousHash` (pointing to the prior event's `eventHash` in the household) and computes `eventHash = SHA256(previousHash|id|action|entityType|entityId|actorUserId|createdAtIso|metadataJson)`.
   - The genesis event starts with `GENESIS`.

5. **Complete Attribution on Every Event**
   - Every `AuditEvent` captures `actorUserId`, `householdId`, `entityType`, `entityId`, `action`, `fromState`, `toState`, `reason`, and `metadataJson`.

6. **Controlled Action Taxonomy**
   - Actions are constrained to a centralized enum taxonomy (`CREATE`, `UPDATE`, `POST`, `CONFIRM`, `CREDIT`, `RECONCILE`, `REVERSE`, `REFUND`, `ARCHIVE`, `RESTORE`, `PAUSE`, `RESUME`, `COMPLETE`, `JOURNAL_POSTED`, `JOURNAL_REVERSED`, `TRANSFER_POSTED`, `CONTRIBUTION`, `WITHDRAWAL`, `ACCESS_DENIED`, `AUTHORIZATION_FAILED`, `VALIDATION_FAILED`, `IDEMPOTENCY_REPLAY`, `CROSS_HOUSEHOLD_ACCESS_DENIED`).

7. **Controlled Entity Taxonomy**
   - Entity types are strictly defined (`TRANSACTION`, `INCOME`, `EXPENSE`, `REFUND`, `TRANSFER`, `GOAL`, `JOURNAL`, `ACCOUNT`, `HOUSEHOLD`, `USER`, `ASSET`, `LIABILITY`, `INVESTMENT`).

8. **Strict Multi-Tenant Household Isolation**
   - Every query to the audit trail (`GET /api/audit`) MUST filter by `householdId = session.householdId`. Audit trails are isolated per household.

9. **Security & Idempotency Event Auditing**
   - Security breaches (access denied, cross-household access attempts) and idempotency replays produce dedicated audit entries (`ACCESS_DENIED`, `CROSS_HOUSEHOLD_ACCESS_DENIED`, `IDEMPOTENCY_REPLAY`).

10. **Separation of Ledger, Business Record, and Audit Log**
    - Ledger (`Journal`, `JournalEntry`, `Account.balance`) records financial history.
    - Business Records (`Expense`, `Income`, `Transfer`, `Goal`) manage business lifecycle status.
    - Audit Trail (`AuditEvent`) records who did what, when, and why across all layers.

---

## Controlled Action Taxonomy Reference

| Category | Actions |
| :--- | :--- |
| **Lifecycle** | `CREATE`, `UPDATE`, `POST`, `CONFIRM`, `CREDIT`, `RECONCILE`, `REVERSE`, `REFUND`, `ARCHIVE`, `RESTORE`, `PAUSE`, `RESUME`, `COMPLETE` |
| **Financial / Ledger** | `JOURNAL_POSTED`, `JOURNAL_REVERSED`, `TRANSFER_POSTED`, `CONTRIBUTION`, `WITHDRAWAL` |
| **Security & Governance** | `ACCESS_DENIED`, `AUTHORIZATION_FAILED`, `VALIDATION_FAILED`, `IDEMPOTENCY_REPLAY`, `CROSS_HOUSEHOLD_ACCESS_DENIED` |

---

## Controlled Entity Taxonomy Reference

- `TRANSACTION`
- `INCOME`
- `EXPENSE`
- `REFUND`
- `TRANSFER`
- `GOAL`
- `JOURNAL`
- `ACCOUNT`
- `HOUSEHOLD`
- `USER`
- `ASSET`
- `LIABILITY`
- `INVESTMENT`

---

## Cryptographic Hash Chaining Details

Hash algorithm: SHA-256

Input string format:
```
{previousHash}|{id}|{action}|{entityType}|{entityId}|{actorUserId}|{createdAtIso}|{metadataJson}
```

Verification procedure (`AuditIntegrityService.verifyChain`):
1. Query all events for a `householdId` ordered by `createdAt ASC, id ASC`.
2. Verify `event[i].previousHash == event[i-1].eventHash` (or `"GENESIS"` for index 0).
3. Recompute SHA-256 for `event[i]` and check `computedHash == event[i].eventHash`.
4. Flag any discrepancy as node hash tampering or link breakage.
