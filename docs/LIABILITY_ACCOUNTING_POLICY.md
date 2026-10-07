# Liability Accounting Policy & Sub-Ledger Specification

## Overview

This policy defines the authoritative accounting treatments for liabilities (Loans, Mortgages, Credit Cards, Personal Debts, Payables, and Other Liabilities) in Kamasi Finance.

Liabilities operate as a specialized sub-ledger. The cached `Liability.outstandingAmount` field MUST represent **outstanding principal only** ($\text{principalAmount} - \sum \text{repaidPrincipal}$) and MUST remain 100% reconcilable against historical `LiabilityFinancialEvent` records and double-entry `Journal` entries.

---

## 1. Liability Financial Events & Double-Entry Accounting Rules

### 1.1 Borrowing (Incurring Liability)
When debt is incurred, the liability transitions from `DRAFT` ➔ `ACTIVE`.
- **Domain Event**: `BORROW`
- **Accounting Command**: `FinancialCommand.postLiabilityBorrow()`
- **Ledger Entries**:
  - **Debit**: Cash / Bank Account $\text{Principal Amount}$
  - **Credit**: Liability Account $\text{Principal Amount}$
- **Effect**: Bank balance increases by debt amount; Liability balance increases by exact principal borrowed.

---

### 1.2 Principal Repayment
Principal repayments reduce debt and cash. Principal repayments ARE NOT EXPENSES.
- **Domain Event**: `REPAYMENT`
- **Accounting Command**: `FinancialCommand.postLiabilityRepayment()`
- **Ledger Entries**:
  - **Debit**: Liability Account $\text{Principal Repaid}$
  - **Credit**: Cash / Bank Account $\text{Principal Repaid}$
- **Effect**: Liability balance decreases; Bank balance decreases; Net Worth remains unchanged.

---

### 1.3 Interest Accrual (`INTEREST_ACCRUED`)
Accruing interest recognizes interest expense without immediately deducting bank funds.
- **Domain Event**: `INTEREST_ACCRUED`
- **Accounting Command**: `FinancialCommand.postLiabilityInterestAccrual()`
- **Ledger Entries**:
  - **Debit**: Interest Expense Account $\text{Interest Amount}$
  - **Credit**: Interest Payable / Liability Account $\text{Interest Amount}$
- **Effect**: Net Worth decreases by interest accrued; Outstanding principal remains unchanged.

---

### 1.4 Combined EMI Repayment (`postLiabilityEMI`)
Repaying a scheduled EMI containing both principal reduction and interest expense.
- **Domain Event**: `REPAYMENT`
- **Accounting Command**: `FinancialCommand.postLiabilityEMI()`
- **Ledger Entries**:
  - **Debit**: Liability Account $\text{Principal Amount}$
  - **Debit**: Interest Expense Account $\text{Interest Amount}$
  - **Credit**: Cash / Bank Account $(\text{Principal} + \text{Interest})$
- **Effect**: Liability balance decreases by $\text{Principal}$; Bank balance decreases by $\text{Total EMI}$; Interest expense recognized.

---

## 2. Invariants & Definitions

1. **`outstandingAmount` Definition**:
   $$\text{outstandingAmount} = \text{Remaining Principal} = \text{principalAmount} - \sum \text{repaidPrincipal}$$
   *Interest payments/accruals DO NOT alter `outstandingAmount`.*

2. **Repayment Validation Boundary**:
   Enforces: $\text{requestedPrincipal} \le \text{outstandingAmount}$.

3. **Result-Based Settlement**:
   Status automatically transitions to `SETTLED` when $\text{outstandingAmount} = 0$. Arbitrary manual settlement without a financial event is prohibited.
