# Kamasi Finance — Evidence-Based Repository Audit

> **Superseded status note (2026-09-25):** This document records the initial, pre-fix static audit and its findings are historical. Several findings below have since been fixed and verified; the current QA evidence and open issues are in [docs/qa/03-defect-register.md](qa/03-defect-register.md), [docs/qa/02-scenario-execution-results.md](qa/02-scenario-execution-results.md), and [docs/qa/07-regression-and-build-report.md](qa/07-regression-and-build-report.md). Do not read the original “no migrations,” “no invitation acceptance,” “no lint config,” or unscoped access claims below as current state.

**Audit date:** 2026-09-25  
**Scope/status:** Static implementation audit plus safe local checks. This is not a complete end-to-end/browser or database-backed audit. No source, schema, migration, configuration, or database files were intentionally changed. The report is the only intended new artifact.

## Executive summary

**Historical release readiness at initial audit: NOT READY (high risk).** Findings below describe the initial source review. The implementation follow-up dated 2026-09-25 records subsequent changes, and those changes are reflected in the current code. Do not read the initial findings as current findings without checking their status in the follow-up section. Database/browser integration and production operations still require isolated validation.

The repository has no README, no Prisma migrations directory, no browser/E2E configuration, and no explicit backup/restore scripts. Three pre-existing `.md` audit reports claim broad passes, but their claims conflict with inspected implementation and are not accepted as evidence.

## Evidence and methods

- Inventory: enumerated `src/app` routes/pages, API route handlers, components, libraries, tests, Prisma schema/seed and docs.
- Executed: `npm run typecheck` — exit 0.
- Executed: `npx vitest run --fileParallelism=false src/lib/__tests__/currency.test.ts src/lib/__tests__/forecasting.test.ts src/lib/__tests__/phase1-regression.test.ts` — 3 files, 9 tests passed.
- Attempted `npm run lint` — stopped with exit 1 at an interactive Next.js ESLint setup prompt; not a lint pass. Next also warned it selected parent `C:\Users\CIE\package-lock.json` rather than the project lockfile as workspace root.
- Not run: `npm test` and database-backed integration tests. `phase2-persistence.test.ts` calls global `deleteMany()` on transactions, budgets, goals, accounts, categories, household members, and households before creating fixtures. It points to `prisma/dev.db`; running it would risk existing user data. `phase3-security.test.ts` writes directly to that database too.
- No browser/server session or isolated test DB was configured; no UI journey, console, network, reload persistence, concurrency, restore, or live permission test is claimed.
- `.env` was not read or exposed. No real financial data/credentials were used.

## Feature inventory

Status describes implementation evidence, not user-facing completion. `PARTIAL` means code exists but important workflow or validation is absent/unverified.

| Area | Repository evidence | Status |
|---|---|---|
| Dashboard | `/`, charts/summary UI; transaction and account APIs | PARTIAL; reconciliation not exercised |
| Authentication | register/login/logout/me, JWT cookie, middleware | PARTIAL; no recovery/reset; session validity does not re-check membership |
| Family/household | family/settings pages; list/invite/revoke API | FAIL/PARTIAL; no invite acceptance, member removal, or role update route found |
| Accounts | page; list/create/read/update/archive endpoints | PARTIAL; private-account filtering absent; balance adjustment affects ledger totals |
| Transactions/income/expenses | transactions and income-expense pages; post/delete and income-source/receipt APIs | PARTIAL; invalid transaction shapes can persist; no general edit endpoint |
| Categories | API auto-provisions defaults and creates categories | PARTIAL; no update/delete route found |
| Budgets | page and list/upsert API | PARTIAL; no rollover/history workflow verified; uniqueness with nullable category deserves DB-level validation |
| Bills/recurring | bills page; recurring rules and payment API | PARTIAL; rule lifecycle/occurrence generation and concurrency not fully tested |
| Salary/employment/payslips | pages and employment/payslip APIs | PARTIAL; no external payroll integration evidenced |
| Savings goals | page, create and contribute APIs | PARTIAL; withdrawal/edit/archive absent in discovered API surface |
| Investments | page and list/create API | PARTIAL; valuation records/edit/delete/history not evidenced |
| Assets/liabilities | page and list/create APIs | PARTIAL; update/delete and linked loan amortization workflows not evidenced |
| Forecasting | page, API, pure forecasting library/tests | PARTIAL; assumptions/data reconciliation unverified |
| Reports/exports | report page, CSV utility | PARTIAL; no report/export API route found in inventory |
| Settings/profile | page; no dedicated settings/profile API identified | UI-only/NOT TESTED |
| Cards, statements, refunds/reversals, attachments, notifications, recovery | no complete corresponding workflows found in route/schema inventory | NOT IMPLEMENTED or NOT EVIDENCED |

Navigation items in `src/components/layout/sidebar.tsx` point to corresponding pages in `src/app`. This was source inspection only; links were not clicked in a browser.

## Findings

### RESOLVED IN FOLLOW-UP — private household accounts are returned to all household members

`src/app/api/accounts/route.ts:20-27` scopes by household only and returns all accounts; it does not filter `isShared` or the requesting user. The schema has `Account.isShared` and `userId`. The per-account GET similarly scopes only by household (`src/app/api/accounts/[id]/route.ts:15-19`). Transactions GET returns household transactions with account/user relations (`src/app/api/transactions/route.ts:12-20`). Therefore UI hiding cannot ensure household privacy; another member can retrieve records for a private account through the API. **Impact:** exposure of private financial data. **Status:** source-confirmed, runtime exploit not attempted.

### RESOLVED IN FOLLOW-UP — transaction POST accepts invalid amounts/types and incomplete transfers

`src/app/api/transactions/route.ts:41-42` only checks truthiness, so negative amounts pass and zero is rejected. A negative expense reverses the expected account balance change. `type` is not constrained to the supported enum; unknown values create a transaction while skipping every balance update (`:90-109`). Transfer destination validation runs only when both type is TRANSFER and `transferAccountId` is truthy (`:57-68`); a TRANSFER without destination is still created and debits source only (`:100-109`). `categoryId` is not checked against household/type. **Impact:** ledger and balances can diverge; invalid/cross-household references may be recorded. **Status:** source-confirmed, no live posting executed.

### RESOLVED IN FOLLOW-UP — role and household membership are trusted from a 7-day JWT

JWT includes `householdId` and `role` for seven days (`src/lib/auth.ts`); middleware only verifies JWT signature/expiry (`src/middleware.ts:26-41`), and API authorization returns those claims (`src/lib/rbac.ts`). There is no per-request lookup to establish that the user remains a member, retains that role, or still has access to the household. **Impact:** revoked/changed membership or role changes can remain effective until token expiry; changing a user’s membership cannot promptly revoke access. **Status:** source-confirmed.

### RESOLVED IN FOLLOW-UP — invitation workflow is incomplete and invitation codes are guessable

`src/app/api/household/members/route.ts` exposes GET/POST/DELETE for invitation listing/creation/revocation, but no accept/join endpoint or user account linkage was found. Codes are generated with `Math.random()` and only six base-36 characters (`:51`). There is no shown delivery workflow. **Impact:** invitation feature cannot complete joining through this API; predictable codes are unsafe if later used as bearer credentials. **Status:** source-confirmed.

### MEDIUM — account balance edits create income/expense ledger entries

`src/app/api/accounts/[id]/route.ts:101-117` turns a balance reconciliation difference into an `INCOME` or `EXPENSE` transaction. This changes dashboard/report income or spending for what is a balance correction, and may skew budgets. No explicit adjustment transaction type is present in the schema. Also the negative-balance guard uses `if (requestedBalance && ...)`, so exact zero bypasses the truthy guard but is accepted; not itself a failure. **Impact:** financial summaries may misclassify adjustments.

### MEDIUM — `isShared` does not affect account list visibility

Account create/update supports `isShared` (`src/app/api/accounts/route.ts:52-73`, `[id]/route.ts:52-79`), but list/read does not apply it. This is part of the high privacy issue above; it also means private/shared setting has no effective read behavior.

### MEDIUM — important workflows absent from API surface

No invite acceptance/member removal, general transaction update, category maintenance, goal withdrawal/edit, investment/asset/liability update/delete, password recovery, statement import, or notification endpoints were found. Treat requested capabilities such as credit-card statements, refunds/reversals, attachments and recurring reminders as not evidenced/likely absent, not as tested failures.

### MEDIUM — schema and migration/recovery evidence is missing

`prisma/schema.prisma` uses SQLite `file:./dev.db`; repository has `dev.db` plus two backup-looking files, but no `prisma/migrations` directory, migration history, backup/restore command or documented recovery procedure was found. Prior docs' backup/restore claims were not repeated because doing so would mutate/overwrite user data. Production PostgreSQL is mentioned in existing docs/docker configuration, but safe restore was not verified.

### LOW — lint workflow is interactive and root selection is ambiguous

`npm run lint` launches `next lint`, prompts for ESLint setup, and exits 1. It also selects a parent lockfile as workspace root while this project has its own lockfile. The audit did not alter lint config.

## Transaction posting matrix (source-level expectations)

| Operation | Expected effect | Actual implementation evidence | Result |
|---|---|---|---|
| Income, amount `A` | Account `+A`, income `+A`, one ledger record | transaction create then account increment in `$transaction` | Atomic path exists; no idempotency key/duplicate-request guard |
| Expense, amount `A` | Account `-A`, expense/budget actual `+A`, one ledger record | create then decrement | Atomic path exists; negative values accepted; no runtime reconciliation |
| Transfer `A`, source→destination | Source `-A`, destination `+A`, no income/expense | create then both balance updates in `$transaction` when destination provided | Valid complete transfer path atomic; missing destination silently posts a source-only debit |
| Delete income/expense/transfer | Reverse original balance effects and remove ledger row | `[id]/route.ts` reverses inside `$transaction` | Source-level reverse paths; no related occurrence/receipt/goal restoration shown |
| Income receipt | Account `+A`, income row, occurrence received/outstanding update | receipt route wraps writes in `$transaction` | Atomic; over-receipt clamps outstanding to zero but still increments received above expected; duplicate retries can double post |
| Bill payment | Account `-A`, expense row, occurrence payment and optional principal reduction | payment route conditionally updates outstanding then writes all in `$transaction` | Better concurrency guard on outstanding; duplicate requests may succeed only until remaining balance exhausted |
| Balance adjustment | Change account balance without income/expense totals | implemented as income or expense ledger row | MISMATCH: adjustment is included in ordinary transaction totals |
| Credit card settlement / refund / loan amortization | No duplicate expense; split/refund rules | no full settlement/refund ledger workflow established | NOT TESTED / NOT EVIDENCED |

Concrete before/after amounts were not generated because no isolated database was available and database tests target the user's actual SQLite file. No fabricated reconciliation is presented.

## Security and privacy review

- API handlers generally call `authorizeRequest`; mutating handlers typically call `assertCanMutate`, which only denies VIEWER. This allows both MEMBER and OWNER to perform most mutations by design; owner-only behavior is only applied to invitations.
- Household IDs are generally taken from token claims and many reads/writes are scoped by household. This is positive source evidence but not runtime IDOR testing.
- Private account access is not scoped by `isShared`/owner (HIGH finding).
- Current account list/detail routes explicitly select only safe user-holder fields (`id`, `name`). The earlier full-user serialization concern is resolved in the current source; runtime response serialization still belongs in integration testing.
- Membership/role revocation is not consulted on requests (HIGH finding).
- No rate limiting on login/registration was identified in inspected handlers. No reset/recovery controls exist in discovered routes.
- Prisma logs queries/warnings in development (`src/lib/prisma.ts`); no evidence found that request bodies/passwords are logged, but errors are logged in API handlers and were not exhaustively inspected.
- No CSRF browser test performed; session cookie uses HttpOnly, SameSite=Lax and Secure only in production.

## Database and reliability

- Prisma schema models users, households/members/invitations, accounts, categories, transactions, recurring rules/occurrences, budgets, goals, investments, assets/liabilities, forecasting, income, employment and payslips.
- Monetary values mostly use Prisma Decimal. API parsing/validation is inconsistent; several routes use truthiness/`parseFloat`/raw Decimal constructors without schema validation.
- Transaction grouping exists for account transfers, account reconciliation, receipts, recurring payments, payslip confirmation and goal contributions. Atomicity does not prevent repeated non-idempotent requests.
- SQLite file and two backup-looking copies exist; contents were not inspected. No orphan/duplicate scan was run to avoid opening personal financial records.
- Foreign keys and cascades are declared in Prisma schema, but actual DB pragma/configuration, constraints, indices and migration history were not independently verified.
- No concurrent API requests, rollback injection, restart persistence, or isolated restore tests performed.

## UI/UX and browser

All sidebar destinations correspond to page files. Page source shows feature forms/tables, but no browser was opened: loading states, empty/error states, keyboard accessibility, responsive layouts, console errors and network failures are **NOT TESTED**. A user-visible flow should not be described as complete from source alone.

## Automated checks

| Check | Outcome |
|---|---|
| TypeScript (`npm run typecheck`) | PASS, exit 0 |
| Pure unit selection (3 files) | PASS, 9 tests |
| Full Vitest suite | BLOCKED intentionally: DB test setup destructive to configured dev DB |
| Lint (`npm run lint`) | BLOCKED/FAIL: interactive setup prompt, exit 1 |
| Production build | NOT RUN |
| Browser/E2E | NOT CONFIGURED/NOT RUN |
| Database integration, migration, backup/restore | NOT RUN; safe isolated test DB absent |

## Prioritized remediation roadmap

**P0 — before any release**
1. Enforce `isShared` and owner access on every account and transaction read, including nested relations; never return full User records/password hashes.
2. Revalidate active membership/role server-side or provide immediate revocation semantics for tokens; enforce household relation for referenced category/account/source and every mutation.
3. Validate transaction enum, strictly positive finite decimal amount, dates, same-household category, and require a distinct valid destination for transfers. Make API validation consistent.
4. Add idempotency/replay protection for money-posting endpoints and safe concurrent occurrence updates.
5. Complete invitation acceptance with cryptographically secure, expiring, one-time codes and role validation.

**P1 — financial correctness**
1. Define an adjustment/reconciliation ledger type that does not inflate income/expense, or otherwise correctly classify it in every aggregate.
2. Prevent receipts above expected amount or explicitly model overpayment; make receipt retries idempotent.
3. Specify and test credit card settlement, refund, reversal and loan principal/interest accounting.
4. Reconcile dashboard, budgets and reports against ledger-derived amounts for month boundaries/time zones.

**P2 — module completeness**
1. Implement missing member removal/join, transaction edit, category and goal/investment/asset/liability lifecycle endpoints as product requirements dictate.
2. Add account/transaction privacy controls, history, and explicit status/archival policies.
3. Add recovery, export and notification workflows only if intended product scope.

**P3 — operations and UX**
1. Configure noninteractive lint and explicit Next output tracing root.
2. Add isolated integration/E2E fixtures and safe CI database setup; never globally delete from configured developer DB.
3. Document migrations, backup/restore and environment setup; verify recovery on disposable copies.
4. Browser-test loading/empty/error states, responsive layouts, accessibility and navigation.

## Regression checklist

- VIEWER cannot mutate any route; MEMBER/OWNER roles match an explicit permission matrix; revoked members lose access immediately.
- Household A cannot read/write Household B data; private account owner can read it while other members cannot; no API response contains password hashes.
- Reject zero/negative/NaN/infinite amounts, invalid dates, unknown types, invalid category IDs, same-account transfers, and transfers without destinations without changing any record.
- Income/expense/transfer create and reversal produce exact ledger/balance/report changes once, including replay/concurrent requests.
- Income receipt cannot exceed expected amount unless specifically modeled; retries do not double post; receipt rollback restores every row and balance.
- Partial/full bill payment and liability principal/interest split reconcile after retry/concurrency and failure injection.
- Account adjustments do not distort income/expense/budget totals.
- Monthly boundaries and timezone/date handling agree across ledger, budget, dashboard and reports.
- Registration, login, logout, expiry, invitation accept/revoke, account archive, refresh persistence, migrations and backup/restore work on isolated fixtures.
- Lint, typecheck, unit/integration tests, build and browser suite run noninteractively and pass.

## Release decision and limitations

**Do not release based on current evidence.** Three high-severity source-level risks require remediation/verification. Only typecheck and nine DB-free tests are verified. API behavior, database state, cross-household access, financial reconciliation with concrete records, browser behavior, production build, migration safety and disaster recovery remain untested. This report does not claim exhaustive interactive testing or a complete pass/fail classification of every individual form state.

## Implementation follow-up (2026-09-25)

The follow-up request authorized implementation. Changes now made:

- API authorization rechecks household membership and current role on every `authorizeRequest` call, so role changes/revocations do not wait for the JWT to expire. `/api/auth/me` uses this same check.
- Account list/detail and transaction list/delete now enforce private-account ownership. User relation serialization is limited to safe profile fields; salary/payslip reads are scoped to self except OWNER, and employment profiles cannot be assigned to users outside the household.
- Transaction creation rejects unsupported types, non-positive/non-finite amounts, invalid dates/categories, archived/private accounts belonging to someone else, and incomplete/same-account transfers. Transaction forms and CSV import use actual API-backed account/category data and no longer silently create local-only transactions after API failures.
- Account reconciliation records `ADJUSTMENT_INCREASE`/`ADJUSTMENT_DECREASE`, excluded from income/expense actuals; deletion reverses the account effect. Ledger voiding preserves an audit row and blocks source-linked bill/income/payslip/goal transactions whose associated workflow cannot safely be reversed here.
- Income receipts validate positive decimals/dates, reject receipts above the remaining occurrence amount and use a conditional atomic outstanding update. Bill payments and goal contributions validate positive amounts/private-account access.
- Money-posting routes use unique idempotency keys backed by the new nullable unique `Transaction.idempotencyKey` field. Account, receipt, bill, goal, manual transaction and CSV UI submissions send keys. Keys are omitted from serialized API responses. Invitation codes now use 256-bit random tokens; owners see code only at creation, invitation acceptance checks email, expiry and one-time status and changes the active session. The family screen supports joining.
- ESLint now runs noninteractively via `eslint src prisma`; JSX lint errors were corrected. Next tracing root is explicit. The dashboard now loads ledger/accounts/goals/assets/liabilities/investments from APIs instead of hardcoded mock balances and chart values.
- Added `src/lib/financial-validation.ts` and DB-free tests for decimal/type/key validation.

Verification after implementation: `npm run typecheck` passed; `npm run lint` passed; four DB-free Vitest files passed (12 tests); `npm run build` passed; `npx prisma validate` passed. `npx prisma generate` was run. Database-backed tests and browser/E2E journeys remain unrun because integration tests mutate the configured SQLite database and no isolated DB/browser test setup is configured.

**Deployment action required:** the additive migration at `prisma/migrations/20260925180000_add_transaction_idempotency_key/migration.sql` has not been applied to `prisma/dev.db` or any production database. Since the application code uses the new column, deploy this migration to the intended database before running the updated app. It is a nullable column plus a unique index; no existing data is intentionally rewritten. The request was to avoid running migrations against the user's actual database, so application of this migration remains outstanding.

Not implemented in this follow-up: product-scope modules that were absent in the inventory (password recovery, external statement integrations, refunds/credit-card settlement workflows, broader create/edit/archive lifecycles, export/report generation, notification delivery, backup/restore automation). These still require product decisions and are not represented as completed. UI/browser and real database reconciliation remain unverified.

Migration packaging note: an initial schema migration generated from the pre-idempotency Prisma schema is included at `prisma/migrations/20260925000000_baseline/migration.sql`, followed by the additive idempotency migration. A fresh database can apply both with `prisma migrate deploy`. The existing populated SQLite database has no migration history; do not run `migrate deploy` against it as-is. First back it up and baseline its current schema by marking the initial migration as applied, then apply only the idempotency migration. Neither baseline resolution nor deployment was run here.
