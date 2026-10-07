# Domain Event & Action Taxonomy Catalog

## Taxonomy Overview

This catalog defines the standardized action names, entity types, lifecycle states, and financial commands used across Kamasi Finance.

---

## Controlled Entity Taxonomy

- `TRANSACTION`
- `INCOME`
- `EXPENSE`
- `REFUND`
- `TRANSFER`
- `GOAL`
- `ASSET`
- `LIABILITY`
- `INVESTMENT`
- `JOURNAL`
- `ACCOUNT`
- `HOUSEHOLD`
- `USER`

---

## Controlled Action Taxonomy

| Action Category | Enum Values | Description |
| :--- | :--- | :--- |
| **Lifecycle** | `CREATE`, `UPDATE`, `POST`, `CONFIRM`, `CREDIT`, `RECONCILE`, `REVERSE`, `REFUND`, `ARCHIVE`, `RESTORE`, `PAUSE`, `RESUME`, `COMPLETE`, `ACQUIRE`, `REVALUE`, `DISPOSE` | Business entity state transitions |
| **Financial / Ledger** | `JOURNAL_POSTED`, `JOURNAL_REVERSED`, `TRANSFER_POSTED`, `CONTRIBUTION`, `WITHDRAWAL`, `ASSET_ACQUISITION`, `ASSET_REVALUATION`, `ASSET_DISPOSAL` | Double-entry ledger events |
| **Security & Governance** | `ACCESS_DENIED`, `AUTHORIZATION_FAILED`, `VALIDATION_FAILED`, `IDEMPOTENCY_REPLAY`, `CROSS_HOUSEHOLD_ACCESS_DENIED` | Security violation and governance events |

---

## Financial Command Registry

| Command | Input Parameters | Ledger Debit | Ledger Credit |
| :--- | :--- | :--- | :--- |
| `postExpense` | `householdId`, `accountId`, `amount`, `description` | Expense Category | Cash / Bank Account |
| `postIncome` | `householdId`, `accountId`, `amount`, `description` | Cash / Bank Account | Income Category |
| `postTransfer` | `householdId`, `sourceAccountId`, `destinationAccountId`, `amount` | Destination Bank Account | Source Bank Account |
| `postRefund` | `householdId`, `accountId`, `amount`, `refundOfId` | Cash / Bank Account | Expense Category |
| `postGoalContribution` | `householdId`, `accountId`, `goalName`, `amount` | Goal Savings Earmark | Bank Account |
| `postGoalWithdrawal` | `householdId`, `accountId`, `goalName`, `amount` | Bank Account | Goal Savings Earmark |
| `postAssetAcquisition` | `householdId`, `accountId`, `assetName`, `amount` | Asset Account | Bank Account |
| `postAssetRevaluation` | `householdId`, `assetName`, `delta`, `isAppreciation` | Asset Account (Gain) / Adjustment (Loss) | Adjustment (Gain) / Asset Account (Loss) |
| `postAssetDisposal` | `householdId`, `accountId`, `assetName`, `proceeds`, `carryingValue`, `gainOrLoss` | Bank (Proceeds) [+ Loss Account if loss] | Asset Account (Carrying) [+ Gain Account if gain] |
