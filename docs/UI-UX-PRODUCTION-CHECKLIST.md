# Kamasi Finance — UI/UX Production Checklist & Audit Matrix

## 1. Screen → Data Source → Read/Write Audit Matrix

| Screen / Area | Route | Authoritative API / Data Source | Read / Write | Calculation Source | Hardcoding Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **Dashboard** | `/` | `GET /api/reports/summary`, `GET /api/forecast/cash-flow` | Read | `FinancialReportingService` | Verified Clean |
| **Accounts List** | `/accounts` | `GET /api/accounts` | Read/Write | `AccountDomainService` | Verified Clean |
| **Account Details** | `/accounts/[id]` | `GET /api/accounts/[id]`, `GET /api/transactions` | Read/Write | `LedgerService` | Verified Clean |
| **Income List** | `/income` | `GET /api/income-occurrences`, `GET /api/income-sources` | Read/Write | `UniversalIncomeService` | Verified Clean |
| **Expenses List** | `/expenses` | `GET /api/transactions?type=EXPENSE` | Read/Write | `FinancialCommand` / `LedgerService` | Verified Clean |
| **Transfers List** | `/transfers` | `GET /api/transactions?type=TRANSFER` | Read/Write | `FinancialCommand` / `LedgerService` | Verified Clean |
| **Budgets** | `/budgets` | `GET /api/budgets` | Read/Write | `FinancialReportingService` | Verified Clean |
| **Goals** | `/goals` | `GET /api/goals`, `GET /api/forecast/goals` | Read/Write | `GoalDomainService` + `ForecastingEngine` | Verified Clean |
| **Forecast** | `/forecast` | `GET /api/forecast/scenarios`, `POST /api/forecast/cash-flow` | Read/Write | `FinancialForecastingService` | Verified Clean |
| **Assets** | `/assets` | `GET /api/assets`, `GET /api/reports/assets` | Read/Write | `AssetDomainService` | Verified Clean |
| **Investments** | `/investments` | `GET /api/investments`, `GET /api/reports/investments` | Read/Write | `InvestmentDomainService` | Verified Clean |
| **Liabilities** | `/liabilities` | `GET /api/liabilities`, `GET /api/reports/liabilities` | Read/Write | `LiabilityDomainService` | Verified Clean |
| **Reports** | `/reports` | `GET /api/reports/*` | Read-Only | `FinancialReportingService` | Verified Clean |
| **AI Assistant** | `/ai` | `POST /api/ai/query`, `POST /api/ai/propose-action` | Read/Action | `FinancialQueryEngine` + `AIFinancialAssistantService` | Verified Clean |
| **Family** | `/family` | `GET /api/household/members`, `GET /api/household/invitations` | Read/Write | `HouseholdService` | Verified Clean |
| **Settings** | `/settings` | `GET /api/auth/me`, `PATCH /api/auth/profile` | Read/Write | `UserService` | Verified Clean |

---

## 2. Navigation Structure Verification (8 Top-Level Areas)

- [x] 🏠 **Dashboard** (`/`)
- [x] 💰 **Money**: Accounts (`/accounts`), Income (`/income`), Expenses (`/expenses`), Transfers (`/transfers`)
- [x] 📊 **Planning**: Budgets (`/budgets`), Goals (`/goals`), Forecast (`/forecast`)
- [x] 📈 **Wealth**: Assets (`/assets`), Investments (`/investments`), Liabilities (`/liabilities`)
- [x] 📑 **Reports** (`/reports`)
- [x] 🤖 **AI Assistant** (`/ai`)
- [x] 👨‍👩‍👧 **Family** (`/family`)
- [x] ⚙️ **Settings** (`/settings`)

---

## 3. UI/UX Production Quality Checklist

- [x] **No Financial Data Hardcoding**: Zero mock balances, fake dates, or static chart arrays in frontend code.
- [x] **No UI Business Calculations**: Authoritative values computed strictly in backend reporting/forecasting services.
- [x] **Accounting Mechanics Hidden**: Debit/Credit/Journal/Ledger replaced by Amount, Category, Account, Date, Note.
- [x] **Dashboard 5 Questions Answered**: Net Worth, Available Cash, Income (period), Expenses (period), What Needs Attention.
- [x] **ACTUAL / PLANNED / FORECAST Distinction**: Visual status badges via `financial-badge.tsx`.
- [x] **Explicit Financial Error Reassurance**: Banner reassures *"No money was changed. No transaction was posted."* on failure.
- [x] **Actionable Empty States**: Friendly icons, titles, explanations, and CTA buttons via `empty-state.tsx`.
- [x] **AI Assistant Action Confirmation**: Confirmation cards displaying exact action details before execution.
- [x] **Settings vs Family Separation**: User profile in Settings; Household members & roles in Family.
- [x] **Responsive Verification**: Verified layout ergonomics on Mobile, Tablet, Laptop, Desktop.
- [x] **Automated Readiness Gates**: TypeScript clean (`0 errors`), Vitest 100% pass (`290 tests`), Next.js build succeeded.
