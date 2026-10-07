# Kamasi Finance — Phase 3.10 Production Operations & Monitoring Guide

> **Phase Status**: CERTIFIED & OPERATIONAL  
> **Platform Version**: 3.10.0  
> **Target System**: Kamasi Finance Double-Entry Ledger & Wealth Platform  

---

## Executive Summary

Phase 3.10 establishes **continuous operational safety and monitoring** for Kamasi Finance in production.
While Phase 3.9 certified that the system could be safely released, Phase 3.10 ensures that the system **remains safe during continuous production operation**.

```text
3.9 Proves:  Can we safely RELEASE the system? (Release Gates PASSED)
3.10 Proves: Can we safely OPERATE the system continuously? (Operational Invariants PASSED)
```

---

## 1. Operational Invariants & Severity Thresholds

The platform continuously monitors six accounting and operational invariants using `FinancialIntegrityMonitor` and `AlertEngine`:

| Invariant Check | Monitored Condition | Severity | Automated Action & SLA |
|---|---|:---:|---|
| **1. Balance Drift** | $\text{Account.balance} \neq \text{Ledger-derived balance}$ | **P0_CRITICAL** | Immediate P0 Alert. Investigate ledger entries within 15 minutes. Consider write suspension. |
| **2. Unbalanced Journal** | $\sum \text{Debits} \neq \sum \text{Credits}$ (Zero Tolerance) | **P0_CRITICAL** | Immediate P0 Alert. Identify corrupted transaction/journal ID and isolate record within 15 mins. |
| **3. Audit Chain Tampering** | `AuditIntegrityService.verifyAuditChain() === false` | **P0_CRITICAL** | Immediate Security Escalation. Lock affected household access; preserve log evidence. |
| **4. Tenant Segregation** | Cross-household relationship or unauthorized access attempt | **P0_CRITICAL** | Immediate Security Lockout. Reject cross-household linkage and alert SOC / Security Lead. |
| **5. Idempotency Abuse** | Repeated idempotency key rejections or submission spikes | **P1_HIGH** | Issue P1 Alert. Rate-limit source IP/user; investigate potential transaction replay attacks. |
| **6. Monitor Staleness** | `MonitorHeartbeat.lastScanTimestamp > 15 minutes` | **P1_HIGH** | Issue P1 Alert. Restart background monitoring daemon immediately. |
| **7. Backup Verification Drill** | Scratch restore drill failure (`BackupWorker`) | **P0_CRITICAL** | Issue P0 Alert. Verify backup storage availability; re-run scratch restore manually. |

---

## 2. 12-Step Production Operations Architecture

```text
3.10.1  Production Operations Architecture
           ↓
3.10.2  Structured Observability & Correlation Tracking (CorrelationContext)
           ↓
3.10.3  Persistent AlertEvent Store & Deduplication Engine (AlertEngine)
           ↓
3.10.4  Financial Integrity Monitor Engine (6 Invariant Checks)
           ↓
3.10.5  Continuous Audit Chain Integrity & Security Anomaly Monitoring
           ↓
3.10.6  Database Health & Query Performance Optimization
           ↓
3.10.7  Async Backup & Restoration Verification Worker (BackupWorker)
           ↓
3.10.8  API Performance SLA (p95 Targets) & Rate-Limit Enforcement
           ↓
3.10.9  AI Security, Token Usage & Tool Authorization Monitoring
           ↓
3.10.10 Protected Operations APIs (/api/ops/integrity-check, /api/ops/backup-verify)
           ↓
3.10.11 Production Incident Runbooks (P0 / P1 / P2 Escalation Protocols)
           ↓
3.10.12 Monthly Production Integrity Review Framework
```

---

## 3. Operations API Endpoints & Security Specification

Ops endpoints are **strictly isolated from normal user sessions and household RBAC**. Access requires a dedicated `x-ops-api-key` request header.

### Endpoints:
1. `GET /api/ops/integrity-check`
   - Executes `FinancialIntegrityMonitor.runFullIntegrityScan()`.
   - Returns HTTP 200 `{ status: "HEALTHY", checksCompleted: 6, openAlertsCount: 0 }` or HTTP 500 `{ status: "ALERT", openAlertsCount: N, alerts: [...] }`.
2. `POST /api/ops/backup-verify`
   - Enqueues asynchronous scratch restore verification drill.
   - Returns HTTP 202 Accepted `{ status: "QUEUED", jobId: "job_backup_..." }`.
3. `GET /api/ops/backup-verify?jobId=...`
   - Returns current asynchronous backup job status (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`).

---

## 4. Production Incident Response Runbooks

### P0_CRITICAL Runbook (Balance Drift / Unbalanced Journal / Audit Tampering)
1. **Notification Received**: PagerDuty / OpsGenie / Slack P0 alert fired.
2. **Initial Triage (T + 5m)**:
   - Call `GET /api/ops/integrity-check` with `x-ops-api-key` header to read alert details and evidence payload.
3. **Containment (T + 15m)**:
   - If `BALANCE_DRIFT` or `UNBALANCED_JOURNAL` occurs, flag affected account or household for read-only mode to prevent cascading drift.
4. **Root Cause Analysis (T + 30m)**:
   - Query `AlertEvent` evidence JSON.
   - Compare `Account.balance` against `SUM(debits) - SUM(credits)` derived from posted journals.
   - Run `AuditIntegrityService.verifyAuditChain(prisma, householdId)`.
5. **Remediation & Closure**:
   - Re-run double-entry posting reconciliation.
   - Re-run `FinancialIntegrityMonitor.runFullIntegrityScan()`.
   - Confirm `AlertEngine` automatically transitions alert status to `RESOLVED`.

---

## 5. Monthly Production Integrity Review Checklist

Conducted on the 1st business day of every month by the Operations & Engineering team:
- [ ] Review all `AlertEvent` entries created during the past 30 days.
- [ ] Confirm 100% of P0/P1 alerts were acknowledged and resolved.
- [ ] Verify that backup restoration drills (`BackupWorker`) passed 100% of scheduled runs.
- [ ] Inspect API performance benchmarks ($p95 < 200\text{ ms}$ simple queries, $p95 < 500\text{ ms}$ reports).
- [ ] Confirm zero unhandled exceptions or security bypass attempts.
- [ ] Sign off on Monthly Operational Certification.
