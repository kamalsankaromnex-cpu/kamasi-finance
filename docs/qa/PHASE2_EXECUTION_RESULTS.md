# Phase 2 — Execution Results

**Run date:** 2026-09-28. **Source of truth:** current repository code and current command/API output. Historical reports are reference only; earlier claims are not silently carried forward.

## Safety and environment

- Existing unit/integration suite ran against a dedicated disposable SQLite file `prisma/phase2-baseline.db`, initialized from the checked-in schema migration plus idempotency column. No developer household rows were copied or touched.
- API security baseline ran against `prisma/phase2-api.db`; post-fix regressions ran against fresh `prisma/phase2-fixed.db`, each with both migrations applied. Only synthetic QA users, households, and sentinel account data were created.
- The database-backed test files contain `deleteMany()` setup. They ran only after the isolated `DATABASE_URL` override was set in the same process.
- All disposable database files were removed after verification. No production endpoint, external financial service, or real credential was used.

## Baseline before code fixes in this phase

| Check | Result | Evidence |
|---|---|---|
| `npm test` | PASS — 8 files, 39 tests | Vitest output 2026-09-28 10:09; isolated `phase2-baseline.db` |
| `npm run typecheck` | PASS | Exit 0 |
| `npm run lint` | PASS | Exit 0 |
| `npx prisma validate` | PASS | SQLite schema valid |
| `npm run build` | PASS | Next.js 15.5.26 production build and 42 prerendered pages |
| Fresh SQLite migration path | PASS | Empty disposable DB; baseline marked applied, idempotency migration deployed |
| `docker compose config --quiet` | PASS | Compose configuration parsed; no image/container was built or started |
| Owner registration / two-household setup | PASS | Synthetic API registration returned 201 and unique household IDs |
| Foreign account read / foreign ledger read | PASS | Other household account detail 404; transaction collection returned 0 foreign rows |
| Private account list/detail and VIEWER mutation | PASS | Viewer list omitted private account, direct detail 404, account POST 403 |
| Invitation accept | PASS | Matching-email VIEWER invitation accepted and current API session role was VIEWER |
| Cross-household forecast scenario POST | FAIL | Household A posted milestone using B's scenario ID; HTTP 201; B's scenario read returned the new marker |
| Private account disclosure through income source | FAIL | Viewer response nested `defaultAccount.accountNumber = SYNTHETIC-ACCOUNT-7788` |
| Private account disclosure through income occurrence | FAIL | Viewer response nested linked transaction account number from the same private account |
| Existing targeted income/budget/bill scenario run | PASS | See `09-income-expense-budget-scenario-results.md`; partial income receipt, retry, budget validation, bill partial payment/retry, and 116,000 balance reconciliation |

The API findings are confirmed runtime defects, not static suspicions. Exact harness actions and response values are summarized above and in the matrix. The cross-household milestone row is not a cash ledger posting, but it is an unauthorized write into another household's financial plan. The nested account number responses violate the account privacy boundary already enforced by the account and transaction endpoints.

## Post-baseline fix verification

This section is updated after each fix. A fix is not PASS until its targeted regression case and relevant checks are rerun.

| Defect ID | Change | Verification | Status |
|---|---|---|---|
| P2-SEC-001 | Forecast POST now scopes scenario to authenticated household | Guarded API regression returned 404 for foreign ID and verified no marker persisted | FIXED / PASS |
| P2-SEC-002 | Income-source response hides private account relation/ID and limits account fields | Viewer regression confirmed relation, ID, account number, and balance absent | FIXED / PASS |
| P2-SEC-003 | Occurrence response filters transactions by visible account and selects safe fields | Synthetic receipt posted; viewer response lacked private transaction/account and idempotency key | FIXED / PASS |
| Post-fix checks | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Typecheck/lint exit 0; 8 files/39 tests pass; production build completed with 42 static pages | PASS |
| Post-fix API regression | `scripts/phase2-security-regression.ps1` with `KAMASI_QA_DATABASE=prisma/phase2-fixed.db` | 7 assertions passed: foreign scenario blocked/no write; private account hidden in income-source response; private linked receipt transaction/account and idempotency key hidden | PASS |
| Browser spot check | CUA opened built app `/login` and `/register` | Pages rendered; form values could not be reliably entered, so journey is not claimed as passed | PARTIAL |

## Not run / limits

- Concurrent same-key posting, simultaneous occurrence payment, and DB failure injection across route handlers.
- Valid two-account transfer through the live route in this Phase 2 run; previous 2026-09-25 smoke report is historical.
- Full report/dashboard reconciliation, historical month browser rendering, every salary and liability boundary, and every route's negative payload matrix.
- Full authenticated browser flow, responsive/keyboard checks, and console/network inspection. CUA rendered login/register pages, but form entry could not be completed reliably; no Playwright/Cypress project is configured.
- Production-mode standalone authentication over HTTPS was not tested. For the regression script, the built standalone server used `NODE_ENV=development` on localhost so the secure session cookie could be exercised over HTTP; production cookie/TLS behavior remains a deployment gate.
- Docker image build/run, production TLS host, backup/restore drill, and migration adoption against a populated copy.

Do not interpret static code review, historical QA reports, or the 39 existing tests as evidence for any not-run row in `PHASE2_FULL_SYSTEM_TEST_MATRIX.md`.
