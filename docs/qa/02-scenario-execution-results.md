# Scenario execution results

**Date:** 2026-09-25  
**Test data:** Synthetic disposable QA identities and account values in `prisma/qa-test.db`. The application's configured `prisma/dev.db` was not written by this QA run.

## Executed scenarios

| ID | Result | Evidence |
|---|---|---|
| API-01 | PASS | Disposable owner registered and received owner session |
| API-02 | PASS | Shared and private accounts and an expense category created |
| API-03 | PASS | Expense of 12.50 against 100.00 produced 87.50; retry with same key returned same transaction and did not post twice |
| API-04 | PASS | Reusing the same key with a different payload returned HTTP 409 |
| API-05 | PASS | Negative expense returned HTTP 400 |
| API-06 | PASS | Transfer of 10.00 debited source 87.50→77.50 and credited destination 25.00→35.00 |
| API-07 | PASS | Matching-email viewer accepted one household invitation and received the VIEWER role |
| API-08 | PASS | Viewer did not receive another member's private account in list; direct read returned 404 |
| API-09 | PASS | Viewer transaction write returned HTTP 403 |
| API-10 | PASS | Unauthenticated account list returned HTTP 401 |
| API-11 | PASS | Household member response omitted `passwordHash` |
| UI-01 | PASS | Login and registration pages loaded in the isolated in-app browser |
| UI-02 | PASS | Invalid login showed “Invalid credentials” and remained on login page |
| UI-03 | PASS | Unauthenticated `/transactions` redirected to `/login` |
| DB-01 | PASS | Prisma baseline and idempotency migrations deployed to isolated empty QA database |
| TEST-01 | PASS | Full Vitest suite: 8 test files, 39 tests passed |
| BUILD-01 | PASS | TypeScript check, lint, production build, Prisma schema validation passed |

## Not executed

- Authenticated browser CRUD/navigation across all finance pages; no test-only browser login fixture is configured, and no credentials were entered through the browser.
- Every income/bill/goal/payslip workflow, concurrent requests, network retries across process restart, write-failure rollback, schema fuzzing, XSS/CSRF, rate limiting, load/performance, backup restore, and production migration/baseline adoption.
- Existing UI flows on mobile-sized viewports and screen-reader/manual accessibility review.

Results demonstrate the listed paths only. They do not imply full feature coverage or readiness for handling real funds.
