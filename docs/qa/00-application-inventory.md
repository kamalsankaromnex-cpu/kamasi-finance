# Application inventory

**Project:** Kamasi Finance 1.0.0  
**Assessment date:** 2026-09-25  
**Stack:** Next.js 15, React 19, TypeScript, Prisma 6, SQLite, Vitest, Tailwind, Recharts.

## User-facing routes

| Route | Area | QA status |
|---|---|---|
| `/` | Dashboard | Source reviewed; authenticated UI not exercised |
| `/family` | Household and members | Source reviewed; invitation accept API exercised |
| `/transactions` | Ledger | API posting/security smoke-tested; authenticated UI not exercised |
| `/income-expenses` | Income and expenses | Source reviewed |
| `/accounts` | Accounts | API privacy/balance smoke-tested |
| `/budgets` | Budgets | Source reviewed |
| `/bills` | Recurring bills | Source reviewed |
| `/savings-goals` | Savings goals | Source reviewed |
| `/investments` | Investments | Source reviewed |
| `/assets-liabilities` | Assets and liabilities | Source reviewed |
| `/forecasting` | Forecasting | Source reviewed; pure forecasting tests exist |
| `/reports` | Reports | Source reviewed |
| `/salary` | Employment and payslips | Source reviewed |
| `/settings` | Preferences | Source reviewed; settings API was not found |
| `/login` | Authentication | Browser load and invalid-login response checked |
| `/register` | Authentication | Browser load checked; form not submitted |

There are 16 page routes. The primary navigation exposes the finance/household modules; login/register are public, and salary is a separate page.

## API surface

There are 28 `route.ts` handlers covering accounts (collection/detail), assets, authentication (login/logout/me/register), budgets, categories, employments (collection/detail), forecasting, goals/contribution, household member/invitation management and invitation acceptance, income occurrences/sources/receipts, investments, liabilities, payslips/confirmation, recurring bills/payments, and transactions (collection/detail).

## Data model

The 20 Prisma models are `User`, `Household`, `HouseholdMember`, `Account`, `Category`, `Transaction`, `RecurringTransaction`, `Budget`, `Goal`, `Investment`, `Asset`, `Liability`, `ForecastScenario`, `ForecastMilestone`, `IncomeSource`, `IncomeOccurrence`, `RecurringBillOccurrence`, `HouseholdInvitation`, `EmploymentProfile`, and `PayslipRecord`.

## Test and delivery setup

- Vitest unit and SQLite integration tests; no Playwright/Cypress or browser test project is configured.
- Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, Prisma `validate`/migrate.
- Prisma datasource defaults to `prisma/dev.db`; QA in this run used a separate `prisma/qa-test.db` and schema override. The repository's default database was not used for test writes. The QA database contains synthetic records and is retained separately for reproducibility.
- Migrations now exist: `20260925000000_baseline` and `20260925180000_add_transaction_idempotency_key`.
- No README, routine backup/restore command, password recovery flow, data import workflow, or performance test harness was found.

## Discovery limits

This is a repository and safe local QA inventory, not a product requirements specification. Feature inventory describes discovered code and observed behavior; it does not imply every listed module is complete or production-ready.
