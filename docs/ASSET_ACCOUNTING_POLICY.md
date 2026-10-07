# Asset Accounting Policy & Sub-Ledger Specification

## Overview

This policy defines the authoritative accounting treatments for physical and financial assets (Property, Land, Vehicles, Equipment, Gold, Livestock, Other) in Kamasi Finance. 

Assets operate as a sub-ledger. The cached `Asset.currentValue` field MUST always remain reconcilable against historical `AssetFinancialEvent` records and posted double-entry `Journal` entries.

---

## 1. Asset Financial Events & Double-Entry Accounting Rules

### 1.1 Asset Acquisition
When an asset is acquired, it transitions from `DRAFT` ➔ `ACTIVE`.
- **Domain Event**: `ACQUISITION`
- **Accounting Command**: `FinancialCommand.postAssetAcquisition()`
- **Ledger Entries**:
  - **Debit**: Asset Account (or ASSET type account) $\text{Amount}$
  - **Credit**: Cash / Bank / Payment Account $\text{Amount}$
- **Effect**: Cash/Bank balance decreases; Total Asset Valuation increases by exact purchase amount.

---

### 1.2 Asset Revaluation (Appreciation & Depreciation)
An active asset may undergo periodic valuation updates. Revaluation does NOT alter the asset's lifecycle status (`ACTIVE` remains `ACTIVE`).
- **Domain Event**: `REVALUATION`
- **Accounting Command**: `FinancialCommand.postAssetRevaluation()`

#### Case A: Appreciation ($\text{NewValue} > \text{CurrentValue}$, $\Delta = \text{NewValue} - \text{CurrentValue}$)
- **Debit**: Asset Account $+\Delta$
- **Credit**: Revaluation Gain / Equity Adjustment Account $+\Delta$
- **Effect**: Asset value increases; Net Worth increases by $+\Delta$.

#### Case B: Depreciation / Impairment ($\text{NewValue} < \text{CurrentValue}$, $\Delta = \text{CurrentValue} - \text{NewValue}$)
- **Debit**: Depreciation Expense / Revaluation Loss Account $+\Delta$
- **Credit**: Asset Account $+\Delta$
- **Effect**: Asset value decreases; Net Worth decreases by $-\Delta$.

---

### 1.3 Asset Disposal & Gain/Loss Calculation
When an asset is sold or liquidated, it transitions from `ACTIVE` ➔ `DISPOSED`.
- **Domain Event**: `DISPOSAL`
- **Accounting Command**: `FinancialCommand.postAssetDisposal()`

#### Formulas:
$$\text{Carrying Value} = \text{Asset.currentValue}$$
$$\text{GainOrLoss} = \text{Disposal Proceeds} - \text{Carrying Value}$$

#### Case A: Gain on Disposal ($\text{Proceeds} > \text{Carrying Value}$, $\text{Gain} = \text{Proceeds} - \text{Carrying Value}$)
- **Debit**: Cash / Bank Account $\text{Proceeds}$
- **Credit**: Asset Account $\text{Carrying Value}$
- **Credit**: Gain on Asset Disposal Account $\text{Gain}$

#### Case B: Loss on Disposal ($\text{Proceeds} < \text{Carrying Value}$, $\text{Loss} = \text{Carrying Value} - \text{Proceeds}$)
- **Debit**: Cash / Bank Account $\text{Proceeds}$
- **Debit**: Loss on Asset Disposal Account $\text{Loss}$
- **Credit**: Asset Account $\text{Carrying Value}$

---

## 2. Asset Sub-Ledger Reconciliation

$$\text{Asset.currentValue} = \text{initialValue} + \sum \text{Revaluation Appreciations} - \sum \text{Depreciations} - \text{Disposed Carrying Value}$$

Any discrepancy between `Asset.currentValue` and the ledger carrying value is flagged as a sub-ledger drift during reconciliation.
