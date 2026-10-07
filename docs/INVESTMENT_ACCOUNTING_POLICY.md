# Investment Accounting Policy — Phase 3.3

## 1. Overview & Core Philosophy

This document defines the authoritative sub-ledger double-entry accounting policy and cost-basis valuation rules for **Investment Management** (Phase 3.3) in Kamasi Finance.

---

## 2. Sole Authoritative Cost-Basis Method: Weighted Average

### 2.1 Rule of Cost Basis
**Weighted Average Cost Basis is the sole authoritative realized cost-basis method.** `InvestmentLot` records preserve acquisition and quantity history to support lot-level audit reconciliation, but FIFO lot matching is **not** used to determine realized gain/loss.

### 2.2 Mathematical Definitions

1. **Purchase / Acquisition (`BUY`)**:
   $$\text{totalQuantity}_{\text{new}} = \text{totalQuantity}_{\text{old}} + Q_{\text{buy}}$$
   $$\text{totalCostBasis}_{\text{new}} = \text{totalCostBasis}_{\text{old}} + (Q_{\text{buy}} \times P_{\text{buy}})$$
   $$\text{weightedAverageCost}_{\text{new}} = \frac{\text{totalCostBasis}_{\text{new}}}{\text{totalQuantity}_{\text{new}}}$$

2. **Liquidation / Sale (`SELL`)**:
   $$\text{costBasisSold} = Q_{\text{sell}} \times \text{weightedAverageCost}$$
   $$\text{proceeds} = Q_{\text{sell}} \times P_{\text{sell}}$$
   $$\text{realizedGainLoss} = \text{proceeds} - \text{costBasisSold}$$
   $$\text{totalQuantity}_{\text{new}} = \text{totalQuantity}_{\text{old}} - Q_{\text{sell}}$$
   $$\text{totalCostBasis}_{\text{new}} = \text{totalQuantity}_{\text{new}} \times \text{weightedAverageCost} = \text{totalCostBasis}_{\text{old}} - \text{costBasisSold}$$
   $$\text{weightedAverageCost}_{\text{new}} = \text{weightedAverageCost}_{\text{old}} \quad (\text{unchanged by sale})$$

3. **Revaluation (`REVALUATION`)**:
   $$\text{currentMarketValue} = \text{totalQuantity} \times \text{currentPricePerUnit}$$
   - Revaluation **MUST NOT** alter `totalCostBasis` or `realizedGainLoss`.
   - Revaluation tracks unrealized market fluctuations ($\text{currentMarketValue} - \text{totalCostBasis}$), remaining strictly separate from realized accounting gains/losses.

---

## 3. Double-Entry Accounting Rules & Financial Commands

### 3.1 `BUY` Command (`postInvestmentBuy`)
- **Debit**: Investment Asset Account $(Q_{\text{buy}} \times P_{\text{buy}})$
- **Credit**: Paying Cash/Bank Account $(Q_{\text{buy}} \times P_{\text{buy}})$

### 3.2 `SELL` Command (`postInvestmentSell`)
- **Sale at Profit** ($\text{proceeds} > \text{costBasisSold}$):
  - **Debit**: Receiving Cash/Bank Account ($\text{proceeds}$)
  - **Credit**: Investment Asset Account ($\text{costBasisSold}$)
  - **Credit**: Realized Investment Gain Account ($\text{proceeds} - \text{costBasisSold}$)

- **Sale at Loss** ($\text{proceeds} < \text{costBasisSold}$):
  - **Debit**: Receiving Cash/Bank Account ($\text{proceeds}$)
  - **Debit**: Realized Investment Loss Account ($\text{costBasisSold} - \text{proceeds}$)
  - **Credit**: Investment Asset Account ($\text{costBasisSold}$)

### 3.3 `DIVIDEND` & `INTEREST` Income Commands (`postInvestmentIncome`)
- **Dividend**:
  - **Debit**: Receiving Cash/Bank Account ($\text{amount}$)
  - **Credit**: Dividend Income Account ($\text{amount}$)
- **Interest**:
  - **Debit**: Receiving Cash/Bank Account ($\text{amount}$)
  - **Credit**: Interest Income Account ($\text{amount}$)
- *Note*: Income events **do not alter** `totalQuantity`, `totalCostBasis`, or `weightedAverageCost`.

### 3.4 `FEE` Command (`postInvestmentFee`)
- **Debit**: Investment Fee Expense Account ($\text{amount}$)
- **Credit**: Paying Cash/Bank Account ($\text{amount}$)
- *Note*: Fee events **do not alter** `totalQuantity` or `totalCostBasis`.

---

## 4. Investment Lifecycle Engine

```
       DRAFT ──► BUY ──► ACTIVE
                            │
                      ┌─────┴─────┐
                      ▼           ▼
               PARTIALLY_SOLD  CLOSED
                      │           │
                      └─────┬─────┘
                            ▼
                         ARCHIVED
```

- **`DRAFT`**: Unposted investment draft. Zero ledger activity.
- **`ACTIVE`**: Positions purchased via `BUY`. Units $> 0$.
- **`PARTIALLY_SOLD`**: Partial liquidation completed; remaining units $> 0$.
- **`CLOSED`**: All units liquidated ($\text{totalQuantity} = 0$).
- **`ARCHIVED`**: Historical investment record archived.

---

## 5. System Invariants & Boundary Guards

1. **Quantity Protection**: Cannot sell more units than currently held ($\text{requestedQuantity} \le \text{totalQuantity}$).
2. **Cost-Basis Protection**: Realized gain/loss is calculated automatically from weighted average cost basis and proceeds; arbitrary UI inputs are strictly rejected.
3. **Idempotency**: Replaying `BUY` / `SELL` / `DIVIDEND` / `FEE` with identical `idempotencyKey` returns cached result without double posting.
4. **Household Isolation**: Multi-tenant security prevents cross-household access or modification.
