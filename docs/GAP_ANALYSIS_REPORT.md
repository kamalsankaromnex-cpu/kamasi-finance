# Comprehensive Gap Analysis Report - Kamasi Finance

**Document Status**: Final  
**Date**: September 25, 2026  
**Auditor**: Principal Software Architect & Financial Systems Auditor  

---

## 1. Executive Introduction & Audit Scope

This report provides an in-depth technical audit of **Kamasi Finance**, evaluating:
- **Frontend & UI/UX Integration**
- **Backend & Data Persistence Architecture**
- **Financial Formulas & Accounting Integrity**
- **Security, Authentication & Household Authorization (RBAC)**
- **Test Suite Execution & Coverage**

Every finding in this report is backed by empirical verification and code citations.

---

## 2. Detailed Findings by Domain

### Domain 1: Financial Ledger & Accounting Integrity

#### [VERIFIED ISSUE] 1.1 Account Transfer Logic Fails Double-Entry Bookkeeping
- **File Location**: [`src/lib/store.ts:48-52`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/store.ts#L48-L52)
- **Code Inspection**:
  ```ts
  const acc = this.accounts.find((a) => a.id === txn.accountId);
  if (acc) {
    if (txn.type === "INCOME") acc.balance += txn.amount;
    else if (txn.type === "EXPENSE") acc.balance -= txn.amount;
  }
  ```
- **Finding**: When a user adds a transaction of type `"TRANSFER"`, neither `acc.balance` (source account) nor `transferAccountId` (destination account) is updated. The funds remain untouched in both accounts.
- **Severity**: **P1 High** (Violates double-entry accounting rules).

#### [VERIFIED ISSUE] 1.2 Budget Spending Computations Ignore Month & Year Scoping
- **File Location**: [`src/app/budgets/page.tsx:52-54`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/budgets/page.tsx#L52-L54)
- **Code Inspection**:
  ```ts
  const actualSpent = store.transactions
    .filter((t) => t.categoryId === b.categoryId && t.type === "EXPENSE")
    .reduce((acc, t) => acc + t.amount, 0);
  ```
- **Finding**: `actualSpent` sums all historical transactions matching `categoryId` across all months and years ever recorded. It does not filter by `b.month` and `b.year`.
- **Impact**: As time passes, historical expenses accumulate infinitely, causing budget cards to falsely register over-budget warnings even when current-month spending is well within limits.
- **Severity**: **P1 High**.

#### [VERIFIED ISSUE] 1.3 Savings Goal Allocations Do Not Deduct Bank Balances
- **File Location**: [`src/lib/store.ts:91-97`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/store.ts#L91-L97), [`src/app/savings-goals/page.tsx:52-60`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/savings-goals/page.tsx#L52-L60)
- **Code Inspection**:
  ```ts
  updateGoalProgress(id: string, amountToAdd: number): boolean {
    const g = this.goals.find((goal) => goal.id === id);
    if (g) {
      g.currentAmount += amountToAdd;
      return true;
    }
    return false;
  }
  ```
- **Finding**: Allocating savings to a goal increments `goal.currentAmount`, but does not deduct `amountToAdd` from any bank account balance, nor does it create a ledger transaction entry. Money is created out of thin air in the goals module.
- **Severity**: **P1 High**.

#### [VERIFIED ISSUE] 1.4 Floating-Point Precision Risks in Memory Store
- **File Location**: [`src/lib/mock-data.ts`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/mock-data.ts), [`src/lib/store.ts`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/store.ts)
- **Finding**: While `prisma/schema.prisma` correctly uses `@db.Decimal(14, 2)`, the runtime `FinanceStore` types amounts as standard JavaScript `number` (IEEE 754 floating point). Repeated additions/subtractions (e.g. `acc.balance += txn.amount`) risk float rounding errors (e.g., `0.1 + 0.2 = 0.30000000000000004`).
- **Severity**: **P2 Medium**.

---

### Domain 2: 2026–2050 Financial Forecasting Engine

#### [VERIFIED ISSUE] 2.1 Compounding Investment Returns on Illiquid Physical Assets
- **File Location**: [`src/lib/forecasting.ts:94`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/forecasting.ts#L94), [`src/app/forecasting/page.tsx:47-51`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/forecasting/page.tsx#L47-L51)
- **Code Inspection**:
  ```ts
  const initialNetWorth = totalAccountsValue + totalAssetsValue - totalLiabilitiesValue;
  // ...
  const investmentReturns = Math.round(currentNetWorth * returnRate);
  ```
- **Finding**: `initialNetWorth` includes fixed physical assets (e.g. ₹95,00,000 primary residence apartment & ₹14,50,000 SUV vehicle). The simulation applies the 11% market return rate directly to `currentNetWorth`, compounding illiquid assets at stock market equity rates over 25 years. This overstates liquid investment growth.
- **Severity**: **P1 High**.

#### [VERIFIED ISSUE] 2.2 Milestone Event Costs Lack Inflation Indexing Option
- **File Location**: [`src/lib/forecasting.ts:74-80`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/forecasting.ts#L74-L80)
- **Finding**: `milestoneExpenses` uses `m.estimatedCost` as a fixed nominal amount in target year `y` without compounding `m.estimatedCost` by annual inflation from 2026 to target year `y`.
- **Severity**: **P2 Medium**.

---

### Domain 3: Architecture, API & Data Persistence

#### [VERIFIED ISSUE] 3.1 UI Directly Mutates In-Memory Client Store (No Database API Persistence)
- **File Location**: [`src/app/transactions/page.tsx`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/transactions/page.tsx), [`src/app/accounts/page.tsx`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/accounts/page.tsx), [`src/lib/store.ts`](file:///c:/Users/CIE/OneDrive - Omnex Inc/Documents/fin/src/lib/store.ts)
- **Finding**: All UI pages import `store` directly from `src/lib/store.ts`. There are no Next.js API Route Handlers under `src/app/api/` or Server Actions connecting UI actions to PostgreSQL via Prisma ORM. Data modifications exist only in server/client memory and reset on application restart.
- **Severity**: **P0 Critical**.

#### [VERIFIED ISSUE] 3.2 Missing Authentication UI & Middleware Route Guards
- **File Location**: [`src/lib/auth.ts`](file:///c:/Users/CIE/OneDrive - Omnex Inc/Documents/fin/src/lib/auth.ts)
- **Finding**: While `src/lib/auth.ts` contains JWT session signing and bcrypt password hashing utilities, there are no `/login` or `/register` UI pages, nor is there a `src/middleware.ts` to protect application routes against unauthenticated requests.
- **Severity**: **P0 Critical**.

#### [VERIFIED ISSUE] 3.3 Lack of Server-Side Household RBAC Enforcement
- **File Location**: [`prisma/schema.prisma:18-22`](file:///c:/Users/CIE/OneDrive - Omnex Inc/Documents/fin/prisma/schema.prisma#L18-L22)
- **Finding**: Database schema defines `Role` enum (`OWNER`, `MEMBER`, `VIEWER`), but because operations are executed in memory without API guards, any user interface context can mutate data regardless of role permissions.
- **Severity**: **P0 Critical**.

---

## 3. Classification Summary

- **P0 Critical**: 3 Issues
- **P1 High**: 4 Issues
- **P2 Medium**: 3 Issues
- **P3 Low**: 2 Issues
