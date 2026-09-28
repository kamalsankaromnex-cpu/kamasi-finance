# Full application test plan

**Purpose:** Validate household authorization, financial correctness, persistence, UI flows, and release readiness without touching the developer's finance database.

## Environment and safety

1. Use an isolated SQLite file generated specifically for QA; refuse to run fixture cleanup against `dev.db`.
2. Use synthetic names, emails, dates, and balances only. Do not enter real credentials or connect external financial accounts.
3. Seed deterministic records; capture starting balances; execute; verify ledger rows and ending balances independently; discard the isolated file after evidence is recorded.
4. Keep all currency calculations in decimal/minor units. Assert both sides of every transfer and compare totals with an independent oracle.

## Scenario catalogue

| ID | Scenario | Main assertions |
|---|---|---|
| AUTH-01 | Register, sign in/out, invalid credentials | Session created only for valid credentials; logout invalidates it |
| AUTH-02 | Household member removed or role changed | Current membership/role takes effect without waiting for old JWT expiry |
| AUTH-03 | Invite acceptance | Correct email, expiry, one-use, role, concurrent redemption |
| ACCT-01 | Shared and private accounts | Own private data visible; another member cannot list/read it |
| ACCT-02 | Balance correction | Adjustment is separately classified and does not inflate income/expense |
| TXN-01 | Income / expense | Positive finite money only; correct account, category, budget and report effects |
| TXN-02 | Transfer | Distinct valid accounts, equal debit/credit, zero income/expense effect |
| TXN-03 | Duplicate/replayed request | Same key+payload is one posting; changed payload conflicts; concurrent replay is one posting |
| TXN-04 | Void and linked records | Reverses balances exactly once; linked receipt, bill, goal and payslip rows remain consistent |
| INC-01 | Income occurrence receipt | Partial/full/over-receipt; outstanding never negative; retries do not double credit |
| BILL-01 | Bill payment | Partial/full/concurrent payment; account and occurrence reconcile; retry is safe |
| BUD-01 | Budgets | Period/category uniqueness, actual aggregation, boundary dates, overspend |
| GOAL-01 | Goal contribution | Contribution reduces account and increases progress exactly once |
| SAL-01 | Employment and payslip | Member/owner scoping, duplicate confirmation, net-pay posting |
| ASSET-01 | Assets/liabilities | Household scope, decimal precision, valuation and net-worth totals |
| FORE-01 | Forecast | Inputs, assumptions, dates, deterministic outputs and boundary values |
| REPORT-01 | Reports/exports | Ledger-to-report reconciliation, filters, timezone/currency consistency |
| SEC-01 | IDOR and role matrix | Anonymous 401, viewer mutation 403, household boundary, private-resource 404 |
| SEC-02 | Sensitive fields and injection | No password hashes/tokens in responses; malformed IDs/payloads safely rejected |
| REL-01 | Transaction atomicity | Inject failures at write boundaries; no partial ledger/balance updates |
| REL-02 | Restart and migration | Data survives restart; migration/backfill/rollback and restore documented and repeatable |
| UI-01 | Main navigation and CRUD journeys | Accessible controls, empty/loading/error/success states, refresh persistence |
| UI-02 | Responsive and browser errors | Desktop/mobile layout, no runtime/console errors, keyboard operation |

## Independent financial oracles

- Income: `ending = opening + posted income - posted expenses + signed adjustments`.
- Transfer: `source delta + destination delta = 0`; transfer amount contributes zero to income and spending.
- Occurrence: `outstanding = max(0, expected - received - paid)` and each receipt/payment has a single ledger effect.
- Goal: `progress = sum(valid contributions)`; corresponding funding-account reductions equal that sum.
- Net worth: `sum(asset values) - sum(liability balances)` using the same valuation timestamp and currency policy.
- Every API monetary input must be finite, positive where required, and persisted at the configured precision; rounding differences must be explicit.

## Exit criteria

No unresolved critical/high financial-integrity or cross-household disclosure defect; all mutations are authorized and retry-safe; integration suite passes against disposable data; typecheck/lint/build pass; migration is deployable through a documented path; required workflows pass in a real browser; known gaps are accepted and visible in release notes.

## Execution record

See [02-scenario-execution-results.md](02-scenario-execution-results.md), [05-financial-reconciliation-report.md](05-financial-reconciliation-report.md), and [07-regression-and-build-report.md](07-regression-and-build-report.md). The full matrix is not complete: authenticated browser journeys, concurrency, failure injection, import/recovery, restore, and performance remain unexecuted.
