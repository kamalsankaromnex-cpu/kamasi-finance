# Kamasi Finance — Financial Command Center Architecture

## 1. Executive Summary

The **Financial Command Center** is a modern, visual, widget-based dashboard providing real-time financial oversight over the Kamasi Finance double-entry ledger.

It operates strictly as a **read-only presentation and aggregation layer** over the frozen, certified financial core.

---

## 2. Architectural Principles

1. **Zero Financial Mutation**: The dashboard never writes, modifies, updates, or deletes records in any financial table (`Journal`, `JournalEntry`, `Account.balance`, `Transaction`, `Investment`, `Borrowing`, `Goal`, `Budget`, `Asset`).
2. **Single Source of Truth**: All metrics and summaries are derived directly from authoritative services (`FinancialReportingService`, `FinancialForecastingService`, `GoalFundingPlannerService`) or through `DashboardQueryService`.
3. **No Direct React Math**: Frontend widgets never compute financial truths (such as subtracting liabilities from assets or determining surplus). All calculations are executed server-side.
4. **Dynamic Calendar Bounds**: No hardcoded years (`2026`) or static months exist. The backend computes start/end bounds dynamically based on `now: Date`.
5. **Multi-Tenant Isolation & RBAC**: Every query is strictly filtered by the authenticated user's `householdId` and permissions (`OWNER`, `MEMBER`, `VIEWER`).

---

## 3. Data Flow Architecture

```text
UI (React Server/Client Components)
   │
   ▼ HTTP GET /api/dashboard?period=MONTHLY|QUARTERLY|YEARLY|ALL_TIME
API Route (src/app/api/dashboard/route.ts)
   │ [Session Auth & Household Membership Verification]
   ▼
DashboardQueryService (src/finance/dashboard/dashboard-query.service.ts)
   │
   ├─► FinancialReportingService.getNetWorthReport()
   ├─► FinancialReportingService.getIncomeStatement()
   ├─► FinancialReportingService.getCashFlowReport()
   ├─► FinancialReportingService.getInvestmentReport()
   ├─► FinancialReportingService.getLiabilityReport()
   ├─► FinancialForecastingService.generateForecast()
   └─► GoalFundingPlannerService
   │
   ▼ Aggregate into DashboardSnapshot DTO
JSON Response
   │
   ▼
UI State Render (Recharts & Modular Widgets)
```

---

## 4. Widget Registry & Layout

The dashboard implements a modular widget layout structured in 5 key tiers:
- **Tier 1: KPI Summary Cards**: Net Worth, Available Cash, Inflow/Outflow, Investments & Debt.
- **Tier 2: Primary Visuals**:
  - `CashFlowChart`: Recharts Bar Chart showing monthly Inflow, Outflow, and Net Surplus.
  - `NetWorthChart`: Recharts Area Chart displaying 6-month historical progression and asset/liability breakdown.
- **Tier 3: Domain Allocation & Progress**:
  - `BudgetProgressWidget`: Category-level spend bars with status colors (`HEALTHY`, `WARNING`, `EXCEEDED`).
  - `GoalsWidget`: Active milestone progress and completion tracking.
  - `InvestmentsWidget`: Portfolio market value, unrealized gain/loss, and asset allocation breakdown.
  - `BorrowingsWidget`: Outstanding liabilities, repayment progress bar, and EMI details.
- **Tier 4: Long-Term Financial Planning**:
  - `ForecastChart`: 12-month net worth trajectory across Baseline, Conservative, and Optimistic scenarios.
  - `GoalFundingWidget`: Portfolio funding shortfall and certified funding engine status.
- **Tier 5: Operational Governance & Activity**:
  - `AlertsActivityWidget`: Urgent attention alerts (liquidity thresholds, budget breaches) and last 5 reconciled ledger entries.
