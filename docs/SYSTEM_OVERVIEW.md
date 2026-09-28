# Kamasi Finance — System Overview and Technical Documentation

**Evidence basis:** repository source, Prisma schema, Docker files, and the audit dated 2026-09-25. The findings in that audit include a follow-up implementation section; the historical findings near the start of that report must be read alongside that section and the current code. This document describes repository behavior; it is not a claim that every feature has been validated at runtime.

## 1. System overview

Kamasi Finance is a household personal-finance web application. It provides account and transaction tracking, income and expense planning, recurring bills, budgets, goals, investments, assets and liabilities, salary/payslip tracking, family access, reporting, and long-range financial forecasts.

The application is a single Next.js web app. The browser renders pages in `src/app`, calls same-origin JSON endpoints under `src/app/api`, and the server uses Prisma to read and update relational data. Household membership associates users with a shared finance workspace. The database schema, rather than the in-memory `src/lib/store.ts`, is used by the API routes for persistence; that store and mock data are legacy/demo support and should not be confused with production persistence.

## 2. Workflow and data lifecycle

1. A user opens the site. Middleware permits login/registration paths and checks the `kamasi_session` cookie on other paths.
2. Registration creates a password hash, user, household, and initial membership (see `src/app/api/auth/register/route.ts`). Login verifies the password and issues a signed session token (see `src/app/api/auth/login/route.ts` and `src/lib/auth.ts`).
3. The browser displays feature pages such as Accounts, Transactions, Budgets, Income/Expenses, Bills, Goals, Investments, Family, Salary, Forecasting, and Reports.
4. A page submits JSON to its API route. The handler authenticates the request, derives the household from session claims, validates selected inputs, checks relevant records, and queries or mutates Prisma models.
5. Financial writes commonly update a ledger transaction and related account balance together in a Prisma transaction. Some flows also update income/bill occurrences, goals, or payslip status. Transaction creation requires an `Idempotency-Key` and rejects reuse with different data.
6. The API returns JSON. Pages update their displayed state; reports/forecasts aggregate stored finance data and forecast calculations. CSV parsing/export helpers exist in `src/lib/csv.ts`; the presence of these helpers does not establish a complete statement import workflow.

Specific workflows are implemented to different levels. Refer to `docs/ACTUAL_AUDIT_2026-09-25.md` for source-level findings, missing endpoints, and items not runtime-tested.

## 3. Solution architecture

```text
Browser (React pages and UI components)
        │ same-origin HTTP / JSON
        ▼
Next.js 15 application (App Router, middleware, route handlers)
        │ Prisma Client
        ▼
Relational database (schema currently declares SQLite)
```

- **Frontend:** Next.js App Router and React pages/components. Tailwind CSS styles the interface; Recharts supplies chart components; Lucide React supplies icons.
- **Backend:** Next.js route handlers under `src/app/api`. Shared libraries implement authentication, RBAC, validation, forecasting, currency, CSV, and Prisma access.
- **Persistence:** Prisma ORM and a relational schema. `prisma/schema.prisma` currently declares SQLite at `file:./dev.db`.
- **APIs:** same-origin REST-like JSON routes for auth, accounts, transactions, budgets, income, bills, categories, investments, liabilities, assets, goals, forecasting, employment/payslips, and household membership/invitations.
- **External services:** no third-party finance-data, payment, email, or market-data integration is evidenced in the inspected source. Invitation delivery should not be assumed; inspect the invitation route before relying on it.

## 4. Technical details

| Technology | Role |
|---|---|
| Node.js 22 (Docker image) | Server runtime in container deployment |
| Next.js 15 / React 19 | Web application, pages, middleware, and server API handlers |
| TypeScript 5.7 | Application language and type checking |
| Prisma 6 / Prisma Client | Database schema, queries, and transaction handling |
| SQLite (schema) | Current declared local database provider |
| SQLite | Local and single-instance container database; persistent Docker volume stores the database file |
| jose / bcryptjs | HS256 JWT signing/verification and password hashing |
| Zod | Input schema validation dependency; usage is route-specific |
| Tailwind CSS 3 | Utility-first styling |
| Recharts 2 | Charts |
| PapaParse | CSV parsing and serialization |
| date-fns | Date utilities |
| Vitest | Unit/test runner configured by package scripts |
| ESLint | Lint tooling configured by package scripts |

## 5. Module breakdown

| Module | Main responsibility | Main interactions |
|---|---|---|
| `src/app/*` pages | Dashboard and feature screens | Calls API routes; uses shared layout/UI |
| `src/components/layout` | Application shell, navigation, header | Wraps pages |
| `src/components/ui` | Buttons, cards, dialogs, inputs, tables, tabs, selects, badges, progress | Reused by feature pages |
| `src/app/api/auth/*` | Registration, login, logout, current session | `User`, `Household`, `HouseholdMember`; auth library |
| Finance API routes | CRUD and workflow endpoints for finance features | Prisma models; auth/RBAC and validation helpers |
| `src/lib/auth.ts` | Password hashing, signed session, cookie handling | `bcryptjs`, `jose`, Next cookies |
| `src/lib/rbac.ts` | Request session resolution and viewer mutation restriction | Household membership and auth library |
| `src/lib/prisma.ts` | Shared Prisma client singleton | Prisma Client and environment configuration |
| `src/lib/financial-validation.ts` | Positive money parsing, transaction type/key checks, response field filtering | Prisma Decimal and transaction route |
| `src/lib/forecasting.ts` | Annual scenario projection and financial independence estimate | Forecasting API/page and scenario data |
| `src/lib/csv.ts` | CSV transaction parsing/export helper | PapaParse; UI/API integration must be confirmed per flow |
| `src/lib/currency.ts`, `utils.ts` | Currency and general helpers | Feature pages and finance modules |
| `src/lib/store.ts`, `mock-data.ts` | In-memory mock/demo state | Not durable and not the API persistence layer |
| `prisma/schema.prisma`, migrations, `seed.ts` | Relational model, migration SQL, seed data | Prisma CLI and application |

## 6. Data flow and database design

All core financial entities are scoped to `Household`. `HouseholdMember` links users to households and stores a role. Important relationship groups are:

- **Identity and access:** `User` → `HouseholdMember` ↔ `Household`; household invitations use `HouseholdInvitation`.
- **Ledger and accounts:** `Account`, `Category`, and `Transaction` belong to a household. Transactions reference source account, optional transfer destination, optional category, user, and optional income/bill/recurring references. Transaction amounts and account balances use Prisma `Decimal`.
- **Planning:** `Budget` is unique by household/category/month/year; `Goal` stores target and current amounts; `ForecastScenario` has `ForecastMilestone` children.
- **Recurring and income:** `RecurringTransaction` has `RecurringBillOccurrence` children. `IncomeSource` has `IncomeOccurrence` children. Transactions can link to an occurrence to record receipt/payment.
- **Net worth:** `Investment` may reference an account; `Asset` and `Liability` belong to a household.
- **Employment:** `EmploymentProfile` links user and household, optionally to an income source; `PayslipRecord` links to employment, user, optional account and optional transaction, and is unique by employment/month/year.

The schema uses UUID string identifiers, timestamps, referential relations, and cascade or set-null deletion behavior. Migration files include a baseline and an idempotency-key migration. The Prisma datasource reads `DATABASE_URL`; local configuration uses `file:./dev.db`, while Compose uses `/app/prisma/data/finance.db` on a named persistent volume. The existing populated local database has no migration history; follow the backup and migration instructions in `docs/DEPLOYMENT_OPERATIONS.md` before applying schema changes to it.

Forecast computation in `src/lib/forecasting.ts` is application-side and projects income, inflated expenses, milestone cash flows, liquid investment return, physical asset appreciation, liabilities, and net worth by year. It is a deterministic scenario calculation using user-provided assumptions, not a live market-data feed.

## 7. Security and performance

**Implemented controls evidenced in source:** passwords are bcrypt-hashed (cost parameter 10); the session is a signed HS256 JWT with seven-day expiry; its cookie is HttpOnly, SameSite=Lax, and Secure in production. Middleware gates non-public paths. API authorization verifies the session and rechecks household membership/role. Viewer role is denied mutations by `assertCanMutate`. Finance handlers generally scope operations to the household. Transaction route validates positive finite amounts and transaction type, requires a valid idempotency key, and omits that key from responses.

**Limitations and review priorities:** the existing audit identified privacy/access-control concerns around private-account visibility and a route that may serialize a full related user record, including sensitive fields. It also notes that membership is checked in API request handling but middleware only validates the JWT. Review `docs/ACTUAL_AUDIT_2026-09-25.md` before exposing this application to real household financial data. Do not treat security as fully verified from this overview.

No cache, queue, rate limiter, or horizontal scaling configuration is evidenced. Prisma is configured to log queries/warnings in development and errors in production. Indexing is sparse in the schema; performance should be measured with realistic household data before scaling. SQLite is generally a single-node choice; a PostgreSQL deployment requires a provider/schema migration and compatibility verification.

## 8. Deployment and infrastructure

Local scripts include `npm run dev`, `npm run build`, `npm run start`, Prisma generate/migrate/seed commands, lint, typecheck, and Vitest. The Dockerfile uses a multi-stage Node 22 Alpine build, runs as a non-root user, and exposes port 3000. `docker-compose.yml` defines PostgreSQL 16 and the app.

SQLite is selected consistently for the schema, environment example, and Compose deployment. Compose uses a named volume and requires `JWT_SECRET` from its runtime environment rather than embedding a default secret. `next.config.ts` enables standalone output, matching the Dockerfile. The deployment operations guide specifies the remaining host/TLS, backup, restore, monitoring, and CI setup. SQLite Compose is a single-instance deployment; use a deliberate migration and data-conversion project before moving existing financial records to another provider or multi-instance hosting.

Expected runtime configuration includes `DATABASE_URL`, `JWT_SECRET` (at least 32 bytes), and optionally `NEXT_PUBLIC_APP_URL`. Never use the checked-in Compose sample secret for a public deployment.

## 9. Testing and maintenance

The repository includes Vitest tests for forecasting, validation, currency, budgets, income, persistence, regression, and security, plus an API smoke script and QA reports under `docs/qa`. Package scripts expose lint, typecheck, and test commands. The existing audit reports typecheck passed, while the full test suite was not run because its database setup could affect the configured developer database; lint required interactive configuration; production build, browser/E2E, isolated database integration, migrations, and backup/restore were not established as passing there.

Error handling is route-based: handlers return JSON status/error responses and generally log server-side failures. Maintenance should preserve money invariants and household boundaries, use isolated test databases, apply migrations through a controlled deployment step, and periodically verify backup restoration. Add operational monitoring, structured logs, alerting, and automated integration/E2E coverage before production use.

## Feature scope and completion

Implemented in the repository: authentication/session handling, household membership/invitations, accounts and ledger transactions, categories, budgets, income sources and receipts, recurring bill rules/payments, goals and contributions, investments, assets/liabilities, employment and payslips, forecasting, and a dashboard/reports UI. “Implemented” here means source and routes exist, not that a full browser workflow has passed acceptance testing.

Not established as complete or absent from the API surface in the source inventory: password recovery, automated invitation delivery, general transaction edit, member removal/role editing, complete category and goal/investment/asset/liability lifecycle endpoints, bank statement integrations, refunds/reversals and credit-card settlement accounting, notification delivery, and automated report/export generation. CSV helpers/import UI do not constitute a bank integration. These remain product scope decisions; no workflow behavior has been invented in this document.
