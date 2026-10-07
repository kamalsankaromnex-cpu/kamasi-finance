# Universal Income Accounting Policy — Kamasi Finance

## 1. Executive Summary & Core Invariants

Kamasi Finance implements a **Universal Income Engine**. Rather than creating separate, isolated financial ledgers for each real-life income stream, all income categories operate through a single, unified sub-ledger accounting framework.

```text
Income Source (Salary / Agriculture / Livestock / Rental / Dividend / etc.)
                    │
                    ▼
            Income Occurrence
                    │
      ┌─────────────┴─────────────┐
      │                           │
  EXPECTED / CONFIRMED        CREDITED
  (0 Ledger Activity)             │
                          FinancialCommand.postIncome()
                                  │
                           LedgerService
                                  │
                                  ▼
                         Double-Entry Journal
                     (Dr Bank / Cr Income Category)
                                  │
                                  ▼
                           Account.balance
```

---

## 2. Universal Income Categories

The Universal Income Engine natively supports 10 canonical categories across corporate, agricultural, small business, and investment streams:

| Category | Typical Frequency / Pattern | Description |
| :--- | :--- | :--- |
| `SALARY` | Recurring (Monthly) | Fixed employment salary, hourly wage, corporate pay |
| `BUSINESS` | Recurring / Irregular | Business revenue, product sales, service invoice collections |
| `AGRICULTURE` | Seasonal / One-Time | Crop harvests (paddy, sugarcane, cotton, horticulture) |
| `SERICULTURE` | Seasonal / One-Time | Silk cocoon harvests and sericulture trade |
| `LIVESTOCK` | Irregular / One-Time | Goat farming, dairy, poultry, cattle sales |
| `RENTAL` | Recurring (Monthly) | Residential, commercial, or equipment lease income |
| `FREELANCE` | Irregular / One-Time | Consulting, contract work, gig economy payouts |
| `INTEREST` | Recurring / Periodic | Savings bank interest, fixed deposit yields, bond coupons |
| `DIVIDEND` | Periodic / Irregular | Equity dividends, mutual fund payouts |
| `OTHER` | One-Time / Miscellaneous | Gifts, tax refunds, asset sales earnings, misc income |

---

## 3. Double-Entry Accounting Rules

### 3.1 Simple Income Posting
When gross salary/income equals net received amount (no deductions recorded):

$$\text{Debit: Asset Account (Bank / Cash)} \quad \$X$$
$$\text{Credit: Income Account (Universal Category)} \quad \$X$$

$$\sum \text{Debits} = \sum \text{Credits}$$

### 3.2 Gross Income & Deductions Breakdown
When income includes gross pay, tax withheld at source (TDS), provident fund (PF), or professional tax:

$$\text{Debit: Asset Account (Net Bank Credit)} \quad \$N$$
$$\text{Debit: Tax Withheld Account (TDS / Tax Paid)} \quad \$T$$
$$\text{Debit: Deductions Account (PF / Retainage / Fees)} \quad \$D$$
$$\text{Credit: Income Revenue Category (Gross Income)} \quad \$G$$

Where $\$G = \$N + \$T + \$D$.

$$\sum \text{Debits} = \$N + \$T + \$D = \$G = \sum \text{Credits}$$

---

## 4. Income Lifecycle Matrix

All income occurrences strictly follow the established Phase 2 / Phase 3 state machine:

```text
EXPECTED ──► CONFIRMED ──► CREDITED ──► RECONCILED ──► ARCHIVED
   │            │              │
   ▼            ▼              ▼
CANCELLED   CANCELLED      REVERSED
```

### State Rules & Balance Integrity

1. **`EXPECTED`**: Planned or projected future income.
   - **Ledger Impact**: Zero (0 balance change).
2. **`CONFIRMED`**: Verified income amount, awaiting bank settlement or credit date.
   - **Ledger Impact**: **Zero (0 balance change)**. *Critical Invariant: Confirmed income MUST NEVER mutate `Account.balance`.*
3. **`CREDITED`**: Funds received in bank account or cash ledger.
   - **Ledger Impact**: Executes `FinancialCommand.postIncome()`, posts double-entry journal, mutates `Account.balance`.
4. **`RECONCILED`**: Bank statement verified against credited journal.
   - **Ledger Impact**: Zero additional ledger activity.
5. **`CANCELLED`**: Uncredited expected/confirmed income that will not be received.
   - **Ledger Impact**: Zero ledger activity.
6. **`REVERSED`**: Credited income cancelled due to bounce, error, or clawback.
   - **Ledger Impact**: Executes compensating reversal journal ($\text{Dr Income} / \text{Cr Bank}$).

---

## 5. Architectural Invariants

1. **Sole Balance Mutator**: `LedgerService` is the only component permitted to alter `Account.balance`.
2. **Idempotency Mandatory**: Submitting parallel credit requests with the same `idempotencyKey` returns the existing credit journal without double-posting.
3. **Household Isolation**: Income sources and occurrences are strictly isolated by `householdId`.
4. **Audit Integrity**: Every state transition records an append-only `AuditEvent` with SHA-256 hash-chaining.
