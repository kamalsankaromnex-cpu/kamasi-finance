# Income, Expenses, and Budgets — Scenario Test Results

**Date:** 2026-09-28  
**Environment:** disposable SQLite database (`prisma/scenario-run.db`), production build, API requests with a test household. No real household records were used.

## Results

| Scenario IDs | Result | Observation |
|---|---|---|
| INC-001, INC-002 | PASS | Created separate salary and farm income sources. |
| INC-005, INC-006 | PASS (API operation) | Source update returned success; deactivation returned success. Historical occurrence behavior after editing was not asserted. |
| INC-008, INC-009 | PASS after fix | Zero/negative expected amounts and missing frequency are rejected with 400. The first run exposed these validation gaps; source validation was added. |
| INC-015, INT-001 | PASS | ₹25,000 partial receipt against ₹43,000 expected updated outstanding to ₹18,000 and recorded bank credit. |
| INC-020 | PASS | Retrying the same receipt with the same idempotency key returned the original result and did not double-post. |
| BUD-001, BUD-004, BUD-007 | PASS | September 2026 budget created; repeated category/month/year save updated the existing record to ₹10,000. |
| BUD-005, BUD-006 | PASS after fix | Zero limit is accepted as the defined zero-budget case (UI utilization is 0% when spend is zero); negative limit is rejected with 400. |
| BUD-012, BUD-013 | PASS | ₹2,000 and ₹4,000 expense transactions were both included in grocery spending. |
| BUD-019 | PASS (negative case) | A self-transfer was rejected with 400. Transfer exclusion from budget totals is supported by the page's expense-only aggregation; no valid two-account transfer was posted in this run. |
| EXP-001, EXP-002 | PASS | A monthly bill rule and its initial occurrence were created. |
| EXP-004 | PASS | A ₹3,000 partial payment against ₹10,000 reduced the occurrence outstanding amount to ₹7,000 and reduced the account once. |
| EXP duplicate retry | PASS | Retrying the same bill payment with the same idempotency key returned the original result. |
| INT-002, budget calculation | PASS | The final category expense total reconciled to ₹9,000 (₹2,000 + ₹4,000 + ₹3,000). |
| INT-001, account balance | PASS | Account balance reconciled to ₹116,000: ₹100,000 + ₹25,000 income − ₹2,000 − ₹4,000 − ₹3,000 expenses. |
| Budget display calculation | CODE FIXED; browser check pending | Historical budget cards now filter transactions to their own month/year. Overspend utilization is no longer capped in the label; the progress bar remains capped visually. ₹8,500 / ₹8,000 therefore displays 106.25% and ₹500 over. |
| Repository Vitest suite | PASS | Ran all 8 test files against a separate disposable database: 39 tests passed. The destructive persistence fixtures did not touch the workspace database. |

The test run led to API validation fixes for income amounts/frequency, budget amounts/period/category ownership, and recurring bill amounts/frequency/account/category/date validation. Recurring bill reads were also scoped to accounts visible to the current household member. The production start script now launches the standalone server without Next's incompatible `next start` warning and resolves local relative SQLite paths.

## Not verified or not supported by the current implementation

- Income source names are not unique; duplicate-name behavior has no explicit product policy.
- Income-source edits do not version amounts by an effective date or update already-created occurrences. No scheduler was found to generate later recurring income occurrences automatically.
- Currency values are stored per source/account, but conversion and cross-currency totals are not implemented.
- Recurring bill creation generates the first occurrence only. Automatic weekly/monthly/yearly occurrence generation, skip/pause/resume, rule editing, and safe deletion endpoints are not present in the API inventory.
- Budget rollover has no schema or API representation. Refunds are not modeled as a defined reversal workflow; general transaction editing is absent.
- Concurrent posting and forced database rollback scenarios were not executed. Browser presentation and visual assertions were not run.
- The complete supplied matrix (including every backdated date, year boundary, family concurrency, and every negative variant) was not executed. These results are a targeted integration subset, not full release certification.

## Release notes

The local scenario databases were disposable, ignored by Git, and removed after the runs. The existing project database was not used by these scenarios. The database-backed Vitest suite is safe to run only with an isolated database URL because some fixtures delete rows.
