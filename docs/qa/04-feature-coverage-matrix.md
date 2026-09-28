# Feature coverage matrix

Legend: **S** source inspected, **U** unauthenticated browser checked, **API** runtime API smoke checked, **T** existing automated tests, **—** no direct execution.

| Feature / page | API | UI | Financial oracle | Notes |
|---|---:|---:|---:|---|
| Authentication | S | U | — | Register API used only for synthetic local QA accounts; invalid login and protected redirect checked |
| Dashboard | S | — | — | UI now API-backed; values not compared against a full ledger oracle |
| Family / invitations | API | S | — | One matching-email VIEWER invite was accepted; concurrent/expired/revoked cases not tested |
| Accounts | API | S | Partial | Private-account filtering checked; correction lifecycle not fully reconciled |
| Transactions | API | S | Partial | Expense retry, changed-key conflict, negative rejection, transfer conservation checked |
| Income and receipts | S | S | — | Dedicated receipt runtime cases not run |
| Budgets | S | S | — | Period/category aggregation not independently checked |
| Bills | S | S | — | Payment and occurrence reconciliation not runtime checked |
| Savings goals | S | S | — | Goal contribution endpoint not runtime checked |
| Investments | S | S | — | Valuation lifecycle not tested |
| Assets and liabilities | S | S | — | Net-worth oracle not executed |
| Forecasting | S | S/T | — | Pure library tests pass; UI and assumptions unverified |
| Reports | S | S | — | Export/reconciliation not tested |
| Salary / payslips | S | S | — | Scope hardening source-reviewed, workflow not runtime tested |
| Settings | S | S | — | No dedicated preferences API identified |
| Anonymous route protection | API | U | — | Account API 401 and transactions-page redirect checked |
| Viewer role | API | — | — | Mutation 403 verified |
| DB migrations | API/DB | — | — | Both migrations deployed only to isolated empty QA SQLite database |

All 16 page routes and 28 API handlers were discovered. Coverage of a page/API in source is not equivalent to execution. See [02-scenario-execution-results.md](02-scenario-execution-results.md).
