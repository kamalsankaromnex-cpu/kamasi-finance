# Kamasi Finance — Cross-Module Dependency Matrix

## Executive Summary
This document defines the authoritative dependency relationships across all backend financial modules, accounting engines, classification trees, and lifecycle operations in Kamasi Finance.

Every dependency enforces the invariant pipeline:
$$\text{Dependency Exists} \longrightarrow \text{Ownership Valid} \longrightarrow \text{Lifecycle Valid} \longrightarrow \text{Permission Valid} \longrightarrow \text{Financial Action Allowed} \longrightarrow \text{Atomic Posting / Ledger} \longrightarrow \text{Audit} \longrightarrow \text{Reporting}$$

---

## 1. Authoritative Backend Cross-Module Dependency Matrix

| Source Domain | Target Dependency | Requirement | Household Boundary | Lifecycle Check | Financial Impact | Validation / Failure Code |
|---|---|---|---|---|---|---|
| **Account Creation** | Financial Institution | Optional | Strict Isolation | Active | None (Metadata) | `INSTITUTION_NOT_FOUND` |
| **Account Creation** | User Holder | Required | Household Member | Active Member | None (Ownership) | `MEMBER_REQUIRED` |
| **Opening Balance** | Account | Required | Strict Isolation | Non-Archived | Double-Entry Equity Posting | `ACCOUNT_REQUIRED` |
| **Income Occurrence** | Income Source | Required | Strict Isolation | Active | Projection / Schedule | `INCOME_SOURCE_NOT_FOUND` |
| **Income Credit** | Receiving Account | Required for CREDITED | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Bank, Cr Revenue Ledger | `ACCOUNT_REQUIRED` |
| **Expense** | Payment Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Expense, Cr Bank Ledger | `ACCOUNT_REQUIRED` |
| **Expense** | Category | Required | Strict Isolation | Active (`EXPENSE`) | Classification & Budget Actuals | `CATEGORY_REQUIRED` |
| **Expense** | Scope | Conditional | Strict Isolation | Active Scope | Classification Hierarchy | `SCOPE_INVALID` |
| **Expense** | Cost Center | Conditional | Strict Isolation | Active Facility | Multi-entity Cost Allocation | `COST_CENTER_INVALID` |
| **Expense Refund** | Payment Account | Required | Strict Isolation | Non-Archived | Dr Bank, Cr Expense Ledger | `ACCOUNT_REQUIRED` |
| **Investment Draft** | Investment Account | Optional | Strict Isolation | Non-Archived (`INVESTMENT`) | None (Draft Holding) | `ACCOUNT_REQUIRED` |
| **Investment BUY** | Paying Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Investment, Cr Bank Ledger | `ACCOUNT_REQUIRED` |
| **Investment SELL** | Receiving Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Bank, Cr Investment + Gain/Loss | `ACCOUNT_REQUIRED` / `INSUFFICIENT_HOLDINGS` |
| **Investment Income** | Receiving Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Bank, Cr Dividend/Interest Ledger | `ACCOUNT_REQUIRED` |
| **Investment Fee** | Paying Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Fee Expense, Cr Bank Ledger | `ACCOUNT_REQUIRED` |
| **Investment Reversal**| Original Event | Required | Strict Isolation | Not Already Reversed | Compensating Reversal Journal | `EVENT_ALREADY_REVERSED` / `CANNOT_REVERSE_REVERSAL` |
| **Borrowing Creation**| Lender | Required | Strict Isolation | Active Lender | Liability Domain Contract | `LENDER_REQUIRED` |
| **Borrowing Disburse**| Receiving Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Bank, Cr Loan Liability Ledger | `RECEIVING_ACCOUNT_REQUIRED` |
| **Borrowing Repay** | Paying Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Liability + Dr Interest, Cr Bank | `PAYMENT_ACCOUNT_REQUIRED` / `REPAYMENT_EXCEEDS_PRINCIPAL` |
| **Borrowing Rev Disb**| Subsequent Repayments| Required = 0 | Strict Isolation | Repayment Count == 0 | Blocks reversal if repayments exist | `CANNOT_REVERSE_DISBURSED_LOAN_WITH_REPAYMENTS` |
| **Asset Acquisition** | Funding Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Asset, Cr Bank Ledger | `FUNDING_ACCOUNT_REQUIRED` |
| **Asset Disposal** | Receiving Account | Optional/Conditional| Strict Isolation | Non-Archived | Dr Bank/Cash, Cr Asset + Gain/Loss | `RECEIVING_ACCOUNT_REQUIRED` |
| **Goal Deposit** | Source Account | Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Goal Protected, Cr Bank Ledger | `ACCOUNT_REQUIRED` |
| **Goal Withdrawal** | Destination Account| Required | Strict Isolation | Non-Archived (`BANK`/`CASH`) | Dr Bank, Cr Goal Protected Ledger | `ACCOUNT_REQUIRED` / `INSUFFICIENT_FUNDS` |
| **Goal Funding v2** | Verified History | Strict Read-Only | Strict Isolation | Certified Reports Only | Zero Mutation (Pure Planning) | `INSUFFICIENT_FINANCIAL_DATA` / `REQUIRES_ASSUMPTION` |
| **Budget Definition** | Category / Scope | Required | Strict Isolation | Active Category | Spending Cap Comparison | `CATEGORY_REQUIRED` |
| **Reporting Engine** | Double-Entry Ledger| Authoritative Truth | Strict Isolation | `status: "POSTED"` Journals | Single Financial Authority | `UNAUTHORIZED` |
| **Forecasting Engine**| Core Subsystems | Strict Read-Only | Strict Isolation | Certified Ledger + Contracts | Zero Mutation (Pure Projection) | None |
| **AI Assistant** | Financial Query Eng| Strict Read-Only | Strict Isolation | User Confirmation Required | Zero Direct Ledger Mutation | `ACTION_CONFIRMATION_REQUIRED` |

---

## 2. Invariant Rules Enforced

1. **Zero Direct Balance Mutations**: `Account.balance` is never directly mutated by any business service. All mutations execute strictly through `LedgerService.postJournalEntries` or `LedgerService.reverseJournal`.
2. **Deterministic Goal Funding Invariant**: Goal Funding v2 never fabricates income, expenses, interest rates, or investment returns. Missing data is tagged `REQUIRES_ASSUMPTION` or `UNKNOWN`. Goal Funding never executes transactions directly.
3. **Double-Entry Balance Equality**: Every journal guarantees $\sum \text{Debits} = \sum \text{Credits}$ to 4 decimal places.
4. **Weighted-Average Cost Accounting**: Investment cost basis and realized gain/loss are calculated solely via weighted average cost per unit.
5. **Compensating Reversal Lineage**: Reversals link atomically via `reversalOfEventId`, prevent duplicate reversals, and post balanced reversal journals.
6. **Cross-Household Access Prevention**: Foreign keys and IDs pointing to different households are rejected immediately with `404` or `403`.
