# Defect register

## Fixed during this task

| ID | Severity | Defect | Resolution | Verification |
|---|---|---|---|---|
| FIX-01 | Critical | API role/household trust relied on stale JWT claims | Authorization now confirms active membership and role in the database per request | Typecheck, suite; invitation/viewer API smoke |
| FIX-02 | High | Private accounts and associated transactions exposed to household peers | List/detail/mutation queries enforce shared-or-owner visibility; related user fields are selected safely | API smoke: hidden list row, direct detail 404 |
| FIX-03 | Critical | Invalid transaction amounts/types, incomplete transfer references, missing safe retry handling | Validate positive finite amounts, type/date/category/accounts, require Idempotency-Key; void instead of destructive deletion | API smoke for negative, duplicate, changed payload, transfer |
| FIX-04 | High | Income, bill, and goal contributions could be replayed or exceed outstanding amount | Added idempotency and conditional outstanding-balance updates to these posting paths | Source review and full existing suite; dedicated endpoint runtime cases still needed |
| FIX-05 | High | Invitation code was weak and no redemption path existed | Cryptographic one-time code, expiry/email/role checks, atomic redemption and acceptance route | API smoke for matching-email viewer acceptance |
| FIX-06 | High | Account balance correction was classified as income/expense | Corrections use adjustment transaction types | Typecheck/build; report aggregation needs further end-to-end proof |
| FIX-07 | High | Payslip/employment API returned excess user data and weak scoping | Restrict reads and related-user selection; block nonmember employment creation | Typecheck, existing suite |
| FIX-08 | Medium | Dashboard used mock data; transactions used local fallback behavior | Dashboard is API-backed; transaction form uses API accounts/categories and safe write path | Build; authenticated UI not covered |
| FIX-09 | Medium | Lint command prompted for setup and Next workspace root was ambiguous | Added noninteractive ESLint config/script and Next output tracing root | `npm run lint`, build pass |
| FIX-10 | Medium | Repository had no Prisma migration history for schema changes | Added initial schema baseline and idempotency-key migration | Deployed successfully to an isolated empty DB |

## Open / release-blocking evidence gaps

| ID | Severity | Issue or evidence gap | Required next action |
|---|---|---|---|
| OPEN-01 | High | Baseline migration has not been adopted against the existing populated `dev.db` or a production database | Establish a safe baseline/`migrate resolve` procedure after verified backup and schema comparison; never run the empty-database baseline on populated data |
| OPEN-02 | High | Only selected API paths have runtime integration coverage | Add route-level/integration tests for receipts, bills, goal contributions, void blockers, role revocation and household IDOR |
| OPEN-03 | High | Authenticated UI journeys and all screens have not been exercised | Add a dedicated synthetic browser fixture and cover primary modules/accessibility/responsive states |
| OPEN-04 | Medium | Account adjustments, dashboard, reports, budget totals and account balances lack full independent reconciliation | Define adjustment semantics and run multi-module oracle checks |
| OPEN-05 | Medium | No password recovery, rate limiting, statement import/reconciliation, attachment, or notification workflow found | Confirm requirements, then design prioritized secure workflows |
| OPEN-06 | Medium | Concurrency, rollback injection, restore, and performance were not tested | Add isolated reliability/load setup and execute before production use |
| OPEN-07 | Medium | No user-facing README, operations, migration, backup/restore guide | Document deployment, upgrade, monitoring, restore and data-retention procedures |

The task fixed source-confirmed defects but does not declare the application production-ready while high-risk verification items remain.
