# Kamasi Finance — Income, Expense, Budget & Integration Regression Test Results

**Date**: September 28, 2026  
**Test Framework**: Vitest v2.1.9  
**Execution Command**: `npm test` (`vitest run --fileParallelism=false`)  

---

## Execution Summary

```text
 RUN  v2.1.9 C:/Users/CIE/OneDrive - Omnex Inc/Documents/fin

 ✓ src/lib/__tests__/expense-budget.test.ts (11 tests) 1031ms
 ✓ src/lib/__tests__/income-management.test.ts (6 tests) 378ms
 ✓ src/lib/__tests__/financial-lifecycle-remediation.test.ts (8 tests) 621ms
 ✓ src/lib/__tests__/phase2-persistence.test.ts (4 tests) 154ms
 ✓ src/lib/__tests__/phase1-regression.test.ts (4 tests) 7ms
 ✓ src/lib/__tests__/phase3-security.test.ts (6 tests) 422ms
 ✓ src/lib/__tests__/financial-validation.test.ts (5 tests) 11ms
 ✓ src/lib/__tests__/forecasting.test.ts (2 tests) 5ms
 ✓ src/lib/__tests__/reporting.test.ts (2 tests) 7ms
 ✓ src/lib/__tests__/currency.test.ts (3 tests) 27ms

 Test Files  10 passed (10)
      Tests  51 passed (51)
   Duration  10.47s
```

---

## Identity & Referential Integrity Regression Test Execution Matrix

| Test Suite File | Test ID | Description / Assertion | Command | Result |
| :--- | :--- | :--- | :--- | :---: |
| `financial-lifecycle-remediation.test.ts` | **REG-01** | Blocks deletion/voiding of an original expense that has linked refunds | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-02** | Account archiving safeguards preserve posted transaction history | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-03** | Replaying same idempotency key returns original transaction payload | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-04** | Cumulative refunds exceeding original expense amount are rejected | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-05** | Recurring occurrences normalize different due-date timestamps to UTC midnight | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-06** | Enforces strict cross-household authorization and tenant isolation | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-07** | Existing financial primary keys remain unchanged (UUID immutability) | `npm test` | **PASS** |
| `financial-lifecycle-remediation.test.ts` | **REG-ORACLE**| **Ledger Reconciliation Oracle**: Closing balances, net worth, and net spent reconcile | `npm test` | **PASS** |
| `expense-budget.test.ts` | **EXP-ACC-01** | ₹5,000 expense reduces bank balance by exactly ₹5,000 (NOT double) | `npm test` | **PASS** |
| `income-management.test.ts` | **INC-ACC-01** | Partial receipts update outstanding balance and bank credit | `npm test` | **PASS** |
| `phase3-security.test.ts` | **SEC-01** | Prevents IDOR and cross-household data leakage | `npm test` | **PASS** |

---

## Quality & Build Checks

- **TypeScript Typecheck**: `npm run typecheck` $\rightarrow$ **PASS** (Exit Code 0).
- **Prisma Schema Alignment**: `npx prisma db push` $\rightarrow$ **PASS** (Database in sync).
- **Automated Test Suite**: 100% Pass Rate across 51 unit and integration tests.
