# Kamasi Finance — Production Hardening Policy

## 1. Performance SLA & Benchmark Targets
Indexes and query optimization are designed to support target performance benchmarks. Actual performance is measured using representative datasets and recorded query plans.

| Operational Category | SLA / Target Benchmark (p95) |
| :--- | :--- |
| **Simple Financial Query** | `< 200 ms` |
| **Reporting / Dashboard Query** | `< 500 ms` |
| **Forecast Generation** | `< 1,000 ms` (1 sec) |
| **AI Context Assembly** | `< 1,000 ms` (1 sec) |
| **Large Report Query** | `< 2,000 ms` (2 sec) |

---

## 2. Query Optimization & Indexing Rules
- Every database index must map directly to authoritative access patterns (e.g. `[householdId, status, date]`, `[householdId, accountId, date]`).
- Indexes must be validated via `EXPLAIN QUERY PLAN` before finalizing migrations.
- Index creation must never be used to guarantee performance SLAs without empirical benchmark verification.

---

## 3. Server-Derived Household Authorization Model
All API endpoints, financial domain services, reporting queries, forecasting scenarios, AI assistant queries, AI action proposals, and file/receipt storage operations MUST enforce server-derived household authorization:

$$\text{Authentication} \longrightarrow \text{Household Membership} \longrightarrow \text{Role} \longrightarrow \text{Capability} \longrightarrow \text{Resource Ownership} \longrightarrow \text{Action}$$

- **Core Security Mandate**: Server code MUST derive the authorized household context directly from the authenticated user's session or household membership. Client-supplied `request.householdId` values MUST NEVER determine authorization.
- Every resource accessed must be strictly validated as belonging to the server-verified household context.

---

## 4. RBAC Capability Matrix

| Capability | Owner | Partner / Member | Viewer |
| :--- | :---: | :---: | :---: |
| **View Accounts & Balances** | ✓ | ✓ | ✓ |
| **View Reports & Forecasts** | ✓ | ✓ | ✓ |
| **Create Expense / Income** | ✓ | ✓ | — |
| **Manage Investments & Liabilities** | ✓ | ✓ | — |
| **Archive Financial Records** | ✓ | Configurable | — |
| **Execute AI Financial Action** | ✓ | Configurable | — |
| **Manage Household & Members** | ✓ | — | — |

---

## 5. Audit Chain Verification Policy
Audit verification must use `verifyAuditChain(householdId)` returning an `AuditVerificationResult` envelope:

```ts
export interface AuditVerificationResult {
  valid: boolean;
  householdId: string;
  eventsChecked: number;
  firstInvalidEventId?: string;
  failureType?: 'PAYLOAD_TAMPERED' | 'PREVIOUS_HASH_MISMATCH' | 'ACTOR_TAMPERED' | 'ENTITY_TAMPERED' | 'SEQUENCE_GAP';
  verifiedAt: Date;
}
```

The system must detect payload tampering, actor tampering, entity tampering, previous hash tampering, event deletion, event insertion, or event reordering, and isolate the exact event ID where corruption occurred.

---

## 6. Backup & Restore Integrity Protocol
A backup is considered successful **ONLY IF** an automated restore test passes the following acceptance pipeline:

$$\text{Source DB} \longrightarrow \text{Backup} \longrightarrow \text{Scratch DB} \longrightarrow \text{Restore} \longrightarrow \text{Schema Verification} \longrightarrow \text{Record Count Comparison} \longrightarrow \text{Double-Entry Check} \longrightarrow \text{Audit Check} \longrightarrow \text{PASS}$$

Restoration MUST verify exact record counts across Accounts, Transactions, Journals, JournalEntries, AuditEvents, Assets, Liabilities, Investments, and Goals.

---

## 7. Multi-Bucket Rate Limiting
Rate limiting must enforce isolated sliding-window buckets to prevent workload interference:
- `AUTH`: 10 req/min
- `AI_QUERY`: 20 req/min
- `AI_ACTION`: 10 req/min
- `REPORT`: 30 req/min
- `FORECAST`: 15 req/min
- `FILE_UPLOAD`: 10 req/min
- `GENERAL_API`: 100 req/min

---

## 8. Observability & Correlation Tracking
All operations must pass structured correlation contexts containing:
- `requestId`, `correlationId`, `householdId`, `userId`, `operation`, `entityId`, `idempotencyKey`, `duration`, `result`

**Data Redaction Policy**: Passwords, refresh tokens, auth headers, and sensitive financial payloads MUST NEVER be logged in plain text.

---

## 9. AI Security Boundaries
- The LLM prompt is **NOT** a security boundary.
- Authorization, tool parameter validation, proposal hash validation, expiration checking, cross-household blocking, and role checking MUST be executed in TypeScript/domain code prior to LLM invocation or action dispatch.
