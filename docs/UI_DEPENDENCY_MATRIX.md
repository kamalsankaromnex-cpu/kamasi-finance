# Kamasi Finance — Global UI Dependency Matrix

## Executive Summary
This document records how each user interface screen and action modal in Kamasi Finance detects, responds to, and guides users through missing or inactive dependencies.

No screen presents a blank state, broken dropdown, or unhandled 500 error. Each page provides human-readable explanations and explicit Call-to-Action (CTA) navigation.

---

## 1. UI Dependency Specification

| UI Screen | User Action | Required Dependency | Dependency State | UI Behavior & Guidance | Primary CTA Navigation |
|---|---|---|---|---|---|
| **/accounts** | Page Load | Household Membership | Missing / Empty | Renders empty state card: "No financial accounts yet. Add your first bank, cash, or wallet account." | `[Add Account]` modal trigger |
| **/accounts** | Add Account | Financial Institution | Missing / Inactive | Select shows "Other / Direct Bank" fallback. Does not block creation. | Optional Institution Selector |
| **/income** | Mark Received | Destination Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"A receiving account is required before marking income as received."* | `[Create Account]` → `/accounts` |
| **/income** | Record Expected | Income Source | Empty (`sources.length === 0`) | Explains income source required before scheduling occurrences. | `[New Income Source]` button |
| **/expenses** | Quick Add | Payment Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"Add a cash/bank account before recording this expense."* | `[Create Account]` → `/accounts` |
| **/expenses** | Advanced Add | Payment Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"Add a cash/bank account before recording this expense."* | `[Create Account]` → `/accounts` |
| **/expenses** | Any Add | Category | Inactive / Archived | Filtered out from category selector; only active categories are selectable. | `Manage Categories` tab |
| **/investments**| Buy Units | Paying Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"No funding bank or cash account available. Create an account before recording this purchase."* | `[Create Account]` → `/accounts` |
| **/investments**| Sell Units | Available Holding Units | Units == 0 | Disables Sell button or rejects action: *"Cannot sell investment with zero units."* | `[Buy Units]` action |
| **/investments**| Dividend / Interest | Receiving Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"Receiving bank account required for income payout."* | `[Create Account]` → `/accounts` |
| **/investments**| Reverse Event | Financial Event | Already Reversed | Hides Reverse action button on reversed events; displays `REVERSED` badge. | N/A (Guarded) |
| **/borrowing** | Disburse Loan | Receiving Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"A receiving account is required before recording loan disbursement."* | `[Create Account]` → `/accounts` |
| **/borrowing** | Repay Loan | Paying Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"A paying account is required before recording loan repayment."* | `[Create Account]` → `/accounts` |
| **/borrowing** | Reverse Disbursement| Downstream Repayments | Repayments > 0 | Explains in dialog: *"Disbursement cannot be reversed once repayments exist. Reverse repayments first."* | Guided Reversal |
| **/savings-goals**| Deposit to Goal | Source Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"No source bank account available."* | `[Create Account]` → `/accounts` |
| **/savings-goals**| Withdraw Funds | Destination Bank Account | Empty (`accounts.length === 0`) | Replaces selector with warning alert: *"No destination bank account available."* | `[Create Account]` → `/accounts` |
| **/savings-goals**| Goal Funding v2| Financial Data | Incomplete Data | Does not invent numbers; tags inputs `REQUIRES_ASSUMPTION` / `UNKNOWN`. | `[Add Financial Data]` |
| **/reports** | View Reports | Ledger Transactions | Empty | Renders clean zero-balance tables and empty state messages without NaN or error. | `[Record Transactions]` |
| **/forecasting**| Scenario Run | Verified History | Empty | Projections calculate based strictly on explicit parameters, showing unassumed baseline. | `[Configure Scenario]` |
| **/ai** | Execute Action | User Confirmation | Pending Confirmation | Shows parsed proposal diff and requires explicit user click before executing command. | `[Confirm & Execute]` |

---

## 2. Global State Transitions

```text
[User Triggers Action]
        ↓
[Dependency Check]
   ├── Dependencies Available ──→ Render Normal Form & Selectors ──→ Submit ──→ Refresh UI
   └── Dependency Missing      ──→ Render Explanatory Banner & CTA ──→ Navigate to Dependency ──→ Return & Resume
```
