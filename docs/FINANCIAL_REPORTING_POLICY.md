# Financial Reporting Policy — Kamasi Finance

## 1. Executive Summary & Architecture Flow

Kamasi Finance enforces a strict **Read-Only Reporting Projection Architecture**. Financial truth is derived directly from posted double-entry journals, authoritative balance projections, and immutable sub-ledgers. 

Reporting code must **never** modify financial records, maintain independent parallel balances, or rely on unverified UI inputs.

```text
       Double-Entry Ledger (Journals & JournalEntries)
     + Sub-Ledgers (Assets, Liabilities, Investments, Goals)
                             │
                             ▼
                Reporting Query Engine
           (FinancialReportingService)
                             │
                             ▼
                 Read-Only Projections
       (Net Worth, Income Statement, Cash Flow, etc.)
                             │
                             ▼
             API Endpoints / Visual Dashboard
```

---

## 2. Reporting Principles & Invariants

### 2.1 Ledger Truth Invariant
Reports MUST derive financial numbers from posted double-entry journals (`Journal` + `JournalEntry`) and authoritative sub-ledger records.

$$\text{Ledger-Derived Balance} = \text{Account.balance} = \text{Report-Derived Balance}$$

### 2.2 Strict Read-Only Guarantee
Reporting endpoints and services are strictly query-only (`GET` operations). No report generation logic is permitted to execute database mutations, update balances, or alter transaction states.

### 2.3 Date & Period Standardization
All reports support standardized period filtering (`MONTH`, `QUARTER`, `YEAR`, `CUSTOM`).
- **Posting Date**: The primary date used for financial reporting is the journal posting date (`Journal.date` or `createdAt`).
- **Exclusions**:
  - `VOIDED` journals and `REVERSED` journal pairs are strictly excluded from income, expense, and cash flow aggregates.
  - Soft-archived records are excluded from active operational reporting while remaining visible in historical audit archives.

### 2.4 Transfer Isolation Rules
Internal transfers between household accounts ($\text{Dr Bank B} / \text{Cr Bank A}$) move liquidity across accounts but represent **zero net income** and **zero net expense**.
- **Rule**: `TRANSFERS` MUST NOT be included in Income Statements or Expense Analysis reports.
- **Cash Flow Treatment**: Internal transfers cancel out in net cash flow calculations and are categorized separately from Operating, Investing, and Financing activities.

### 2.5 Investment Concept Isolation
Investment performance reporting maintains strict accounting separation between distinct financial metrics:
- **Realized Gain / Loss**: Taxable gain or loss realized upon unit liquidation ($\text{Proceeds} - \text{Weighted Avg Cost Basis Sold}$).
- **Unrealized Gain / Loss**: Non-cash mark-to-market paper valuation adjustment ($\text{Current Market Value} - \text{Total Cost Basis}$).
- **Investment Income**: Cash dividends and interest received ($\text{Dr Bank} / \text{Cr Dividend Income}$).
- **Rule**: $\text{Realized Gain/Loss} \neq \text{Unrealized Gain/Loss} \neq \text{Investment Income}$.

---

## 3. Core Report Specifications

| Report Name | Mathematical Definition | Primary Categories / Breakdown |
| :--- | :--- | :--- |
| **Net Worth** | $\text{Total Assets} - \text{Total Liabilities}$ | Liquid Cash/Bank, Investments, Property, Land, Vehicles, Gold, Equipment, Livestock, Loans, Mortgages, Credit Cards |
| **Income Statement** | $\text{Gross Income} - \text{Total Expenses} = \text{Net Income}$ | 10 Universal Income streams vs 12 Expense categories |
| **Expense Analysis** | Categorized Expense Sums over Period | Housing, Food, Transport, Healthcare, Utilities, Family, Farm, Business, etc. |
| **Cash Flow** | $\text{Opening Cash} + \text{Inflows} - \text{Outflows} = \text{Closing Cash}$ | Operating Activity, Investing Activity, Financing Activity (Transfers excluded) |
| **Investment Performance** | Total Return = Realized + Unrealized + Income − Fees | Cost Basis, Market Value, Realized Gain/Loss, Unrealized Gain/Loss, Dividends, Fees |
| **Asset Position** | Purchase Cost, Current Value, Gain/Loss | Carrying Value, Appreciation/Depreciation, Disposal Proceeds, Gain/Loss |
| **Liability Position** | Original Principal − Repayments + Accrued Interest | Outstanding Principal, Interest Accrued/Paid, Remaining Obligations |
| **Goal Progress** | $\text{Completion \%} = \frac{\text{Current}}{\text{Target}} \times 100\%$ | Target Amount, Current Amount, Remaining Amount, Required Monthly Contribution |
