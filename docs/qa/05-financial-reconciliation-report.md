# Financial reconciliation report

**Scope:** Independent checks of synthetic API postings only; all amounts are INR and exact to two decimal places.

## Executed ledger oracle

| Account | Opening | Expense | Transfer | Expected closing | Observed closing | Difference |
|---|---:|---:|---:|---:|---:|---:|
| Shared QA bank | 100.00 | -12.50 | -10.00 | 77.50 | 77.50 | 0.00 |
| Private QA cash | 25.00 | 0.00 | +10.00 | 35.00 | 35.00 | 0.00 |
| **Total** | **125.00** | **-12.50** | **0.00** | **112.50** | **112.50** | **0.00** |

The same expense idempotency key and identical payload returned the original transaction; the account remained at 87.50 after the retry. Reusing the key with changed transaction data returned 409. A negative amount returned 400. Transfer conservation held: `-10.00 + 10.00 = 0.00`.

## Not reconciled

Income occurrences, bill payments, goal contributions, payslip confirmations, adjustments, budgets, reports, assets/liabilities, and forecasts were not run through a multi-module oracle. No production or developer financial records were read or changed.

## Accounting decisions still needed

- Document whether balance adjustments affect cash-flow reports and budgets, and ensure every aggregate filters adjustment types consistently.
- Specify currency conversion, exchange-rate source/date, rounding, time zone, and posting-date policy before claiming cross-currency reconciliation.
- Define behavior for over-receipts, refunds, reversed payments, card settlements, and loan principal/interest splits.
- Establish an audit trail for voids and corrections and verify its reports preserve original and reversal links.

The zero variance above applies only to the two tested synthetic accounts and does not establish general ledger completeness.
