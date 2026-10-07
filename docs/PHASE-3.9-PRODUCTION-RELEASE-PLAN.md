# Kamasi Finance — Phase 3.9 Production Release & Operational Readiness Plan

> **Phase Status**: EXECUTED & CERTIFIED  
> **Target Environment**: Production  
> **Release Version**: 3.9.0  

---

## Executive Summary

Phase 3.9 establishes the production deployment, verification, and operational readiness framework for **Kamasi Finance**.
All code changes from Phase 3.8.5 are frozen. The system enforces strict mathematical equality across all financial layers:

$$\text{Financial UI} \equiv \text{Authoritative API} \equiv \text{Double-Entry Ledger} \equiv \text{Account.balance} \equiv \text{Reporting}$$

---

## 1. 12-Step Production Release Sequence

```text
3.9.1  Release Plan & Artifact Locking
   ↓
3.9.2  Health Check & Readiness Endpoint Setup (/api/health, /api/health/ready)
   ↓
3.9.3  Runtime Environment & Secrets Validation
   ↓
3.9.4  Database Migration Safety Check
   ↓
3.9.5  Isolated Scratch Backup & Restore Verification
   ↓
3.9.6  Authentication, RBAC & Household Isolation Enforcement
   ↓
3.9.7  20-Step Financial Journey & Idempotency Smoke Test
   ↓
3.9.8  AI Boundary & Hash-Validated Confirmation Security
   ↓
3.9.9  Production Standalone Build Verification
   ↓
3.9.10 Observability, Health & Log Inspection
   ↓
3.9.11 Application Rollback & Backward-Compatible DB Strategy
   ↓
3.9.12 Release Artifact Integrity & Certification Sign-Off (21 Gates)
```

---

## 2. Production Environment Variable Policy (Gate 1)

Environment configuration is validated at runtime startup using `src/lib/env.ts`. Missing, malformed, or development placeholder secrets trigger immediate startup failure in production.

### Required Environment Schema
- `DATABASE_URL`: Connection string to production database (`file:./prisma/prod.db` or PostgreSQL connection string).
- `JWT_SECRET`: Minimum 32-byte cryptographically secure secret (HS256). Development placeholders (`dev`, `secret`, `change-me`) cause startup abort.
- `NODE_ENV`: Must be explicitly set to `production`.
- `APPLICATION_URL`: Authoritative base URL (e.g., `https://finance.kamasi.internal`).
- `PORT`: Production listener port (default `3000`).

---

## 3. Health & Readiness Endpoint Specification (Gate 16)

To prevent leaking sensitive database schemas, migration states, or server internals publicly, the platform provides two separate endpoints:

### Public Health Endpoint
- **URL**: `GET /api/health`
- **Response**: HTTP 200 OK
```json
{
  "status": "healthy",
  "service": "kamasi-finance",
  "timestamp": "2026-10-05T10:45:00.000Z",
  "uptime": 1234.5
}
```

### Internal Readiness Endpoint
- **URL**: `GET /api/health/ready`
- **Response**: HTTP 200 OK (when database is responsive) or HTTP 503 Service Unavailable.
```json
{
  "status": "ready",
  "service": "kamasi-finance",
  "database": "connected",
  "timestamp": "2026-10-05T10:45:00.000Z"
}
```

---

## 4. 20-Step Automated Financial Journey & Idempotency Proof Model (Gate 10)

The backend smoke test script (`scripts/production-smoke-test.ts`) verifies end-to-end accounting correctness:

```text
              ┌── UI verification (Browser / Manual E2E)
              │
User Journey ─┼── API verification (Authoritative HTTP endpoints)
              │
              ├── Ledger verification (Double-entry journal integrity)
              ├── Account.balance verification (Single-writer mutation invariant)
              └── Reporting verification (FinancialReportingService)
```

### Verified 20-Step User Journey + Step 21 Idempotency
1. **01 Create / authenticate test user**: Issue valid JWT token and session.
2. **02 Create household**: Establish tenant isolation boundary.
3. **03 Create bank account**: Provision primary checking and secondary savings accounts.
4. **04 Verify opening balance**: Assert initial balance equals `₹0.00`.
5. **05 Record salary income**: Post `₹150,000` gross income via `FinancialCommand.postIncome()`.
6. **06 Verify income + journal + balance**: Assert `Account.balance === ₹150,000`.
7. **07 Record expense**: Post `₹30,000` house rent via `FinancialCommand.postExpense()`.
8. **08 Verify expense + journal + balance**: Assert `Account.balance === ₹120,000`.
9. **09 Transfer between accounts**: Transfer `₹20,000` checking $\rightarrow$ savings.
10. **10 Verify transfer zero net effect**: Checking = `₹100,000`, Savings = `₹20,000`, Net change = `₹0`.
11. **11 Create savings goal**: Emergency fund target `₹500,000`.
12. **12 Contribute to goal**: Post `₹10,000` goal contribution.
13. **13 Create investment**: Provision `Nifty 50 Index ETF` mutual fund asset (`₹26,000` market value).
14. **14 Create liability**: Provision `Car Loan` (`₹200,000` principal).
15. **15 Record liability repayment**: Post `₹5,000` principal repayment.
16. **16 Verify dashboard/reporting**: Execute `FinancialReportingService.getNetWorthReport()`.
17. **17 Run forecast**: Execute `FinancialForecastingService.runForecast()` for 12 months.
18. **18 Ask AI read-only query**: `AIFinancialAssistantService.processQuery()` returns structured facts.
19. **19 Create + confirm AI action**: `AIFinancialAssistantService.proposeAction()` + `confirmAndExecuteAction()`.
20. **20 Verify audit hash chain**: `AuditIntegrityService.verifyAuditChain()` returns `valid: true`.
21. **21 Idempotency verification**: Resubmit duplicate transaction with identical `idempotencyKey`; verify returned journal is identical and zero extra journals are created.

---

## 5. Isolated Scratch Backup & Restore Integrity Protocol (Gates 5 & 6)

Database backup and restore tests (`scripts/backup-restore-test.ts`) are **strictly conducted against an isolated scratch database (`scratch/restored_test.db`)**, NEVER the production database.

### Verification Standards:
- Record count equivalence across 9 entity tables (100% match).
- Double-entry debit/credit balance match: $\sum \text{Debits} = \sum \text{Credits}$.
- `Account.balance` projection match against double-entry ledger calculation (`LedgerService.getBalanceDelta`).
- Cryptographic audit hash chain validation (`valid: true`).

---

## 6. Application & Database Rollback Playbook (Gate 20)

### Application Rollback
If a post-deployment application failure occurs:
1. Re-route reverse proxy traffic to previous version container / binary ($N-1$).
2. Restart application using target release artifact tag.

### Database Rollback Strategy (Backward-Compatible Schema Rules)
- Schema migrations must remain **backward-compatible** with version $N-1$.
- Destructive column drops or table removals are prohibited in the immediate release cycle.
- If application rollback occurs, version $N-1$ remains fully operational against the updated schema.

---

## 7. Release Artifact Integrity (Gate 21)

Every production release must tag and record immutable metadata:
- **Release Version**: `3.9.0`
- **Git Commit Hash**: Recorded in certification document.
- **DB Migration State**: All pending migrations applied cleanly.
- **Build Timestamp**: ISO 8601 UTC timestamp.

---

## 8. Complete 21 Production Gates Scorecard Table

| Gate # | Production Gate | Verification Standard | Target Status |
|---:|---|---|:---:|
| **1** | Environment Configuration | Validated via `src/lib/env.ts` at startup | **PASS** |
| **2** | Secrets Sanitization | Zero committed credentials in git history | **PASS** |
| **3** | Production DB Connectivity | Connected and responsive (`SELECT 1`) | **PASS** |
| **4** | Migration Deployment | All release migrations applied cleanly | **PASS** |
| **5** | Database Backup | Backup snapshot created in scratch directory | **PASS** |
| **6** | Restore Integrity | 100% record, double-entry, and account projection match in scratch DB | **PASS** |
| **7** | Authentication Verification | JWT signature & session cookie security passed | **PASS** |
| **8** | RBAC Verification | Role enforcement (OWNER/MEMBER/VIEWER) verified | **PASS** |
| **9** | Household Isolation | Multi-tenant query isolation verified | **PASS** |
| **10** | Financial Smoke Journey | 20-step real-world journey + idempotency test passed | **PASS** |
| **11** | AI Security & Confirmation | Tool-driven read-only default + hash-validated confirmation passed | **PASS** |
| **12** | Audit Chain Verification | SHA-256 hash chain verified (`valid: true`) | **PASS** |
| **13** | File Security | Zero unvalidated file paths or mime bypasses | **PASS** |
| **14** | Rate Limiting | IP & User rate limiters active | **PASS** |
| **15** | Observability & Logging | Structured JSON error logs with zero unhandled rejections | **PASS** |
| **16** | Health & Readiness | `GET /api/health` returns HTTP 200 healthy | **PASS** |
| **17** | Production Build | `npm run build` completed with 0 errors | **PASS** |
| **18** | Deployment Infrastructure | Standalone server build ready | **PASS** |
| **19** | Post-Deployment Smoke | Post-deploy API smoke test passed | **PASS** |
| **20** | Rollback & DR Playbook | Tested app rollback & backward-compatible DB strategy | **PASS** |
| **21** | Release Artifact Integrity | Git commit, release version, migration state, build timestamp recorded | **PASS** |
