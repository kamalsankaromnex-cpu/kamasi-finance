# FINANCIAL FORECASTING POLICY

## Core Architectural Invariants

### 1. Zero Ledger Mutation Rule
Forecast data is **never** financial truth. Forecast calculations operate inside a strictly read-only data-access boundary and MUST NOT create, update, reverse, archive, or mutate any of the following authoritative entities:
- `Journal`
- `JournalEntry`
- `Account.balance`
- `Transaction`
- `Asset` / `AssetValuation`
- `Liability` / `LiabilityFinancialEvent`
- `Investment` / `InvestmentActivity` / `InvestmentLot`

Any attempt to invoke write methods on ledger or financial-truth domain tables during a forecast run is a critical system violation.

---

### 2. Read-Only Data Access Boundary
Forecast engines query existing financial records (Accounts, Assets, Liabilities, Investments, Income Sources, Recurring Rules, Goals) strictly via read-only repository/service methods. Projections are computed transiently in memory or serialized into isolated `ForecastSnapshot` records.

---

### 3. Scenario-Driven Assumptions Model
Projections are assumption-driven scenarios, not predictions with certainty. Supported scenario types:
- **`BASELINE`**: Reflects current recurring trends, baseline salary growth (e.g. 5%), inflation (6%), and investment return (10%).
- **`CONSERVATIVE`**: Reflects conservative growth assumptions (0% salary growth, 8% inflation, 5% investment return).
- **`OPTIMISTIC`**: Reflects growth-oriented assumptions (8% salary growth, 4% inflation, 12% investment return).
- **`CUSTOM`**: User-defined growth, inflation, return, and milestone parameters.

All scenario parameters are versioned (`assumptionsVersion`) and reproducible.

---

### 4. Tri-State Projection Distinction (ACTUAL vs PLANNED vs FORECAST)
The forecasting engine explicitly distinguishes three data tiers:
- **`ACTUAL`**: Posted double-entry ledger transactions (`JournalEntry` / `Transaction`).
- **`PLANNED`**: Known future commitments or recurring occurrences (`IncomeOccurrence` / `RecurringBillOccurrence`).
- **`FORECAST`**: Projected entries derived from scenario growth parameters and macro assumptions.

---

### 5. Cash Flow Calculation Algorithm
Projected Cash Flow is computed as:
$$\text{Projected Closing Cash} = \text{Opening Cash} + (\text{Actual/Planned Income} + \text{Forecast Income}) - (\text{Actual/Planned Expenses} + \text{Forecast Expenses}) - \text{Liability Payments} \pm \text{Investment Cash Flows}$$

**Exclusion Rule**: Internal bank transfers ($\text{Dr Bank B} / \text{Cr Bank A}$) move liquidity between accounts but are strictly excluded from projected income and expense totals.

---

### 6. Goal Shortfall Algorithm
For each active Goal:
$$\text{Projected Shortfall} = \text{Remaining Goal Target} - \text{Expected Planned Contributions}$$

Where Expected Planned Contributions are calculated from active recurring contributions through the target date. The engine computes the additional required monthly contribution and projected completion date. Completed, overdue, paused, or zero-balance goals are handled cleanly without error.

---

### 7. Simulated Liability Interest Boundary
Liability interest is simulated purely in memory:
$$\text{Forecast Closing Principal} = \text{Opening Principal} + \text{Simulated Interest} - \text{Forecast Principal Payment}$$

Simulated interest does not generate actual accounting entries or alter `Liability.outstandingAmount`.

---

### 8. Investment Forecast Isolation
Investment return projections calculate **Forecast Valuation** and **Forecast Gain/Loss**. These projections are strictly isolated from:
- **Realized Gain/Loss** (derived from posted sale double-entry journals in Phase 3.3).
- **Unrealized Gain/Loss** (derived from current market valuation vs weighted average cost basis).

Forecast returns MUST NEVER alter Phase 3.3 cost basis or realized gain/loss records.

---

### 9. Deterministic Calculation IDs & Reproducibility
For reproducible calculations, inputs are normalized and hashed:
$$\text{ForecastInput} \xrightarrow{\text{Normalize}} \text{Canonicalized JSON} \xrightarrow{\text{SHA-256}} \text{Calculation ID}$$

Identical input parameters yield identical calculation IDs and identical projected results.
