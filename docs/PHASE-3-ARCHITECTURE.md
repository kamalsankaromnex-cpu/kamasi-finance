# Phase 3 Expansion Master Architecture

## System Sitemaps & Phase Roadmap

Phase 3 expands Kamasi Finance into a comprehensive wealth management and financial intelligence platform built upon the locked Phase 1 Double-Entry Engine and Phase 2 Lifecycle & Audit Engine.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PHASE 3 ROADMAP                               │
│                                                                         │
│ 3.0 Architecture Freeze     ✅ Locked                                   │
│ 3.1 Assets                  ➔ Property, Land, Vehicles, Equipment, Gold │
│ 3.2 Liabilities             ➔ Mortgages, Loans, Credit Card Debt        │
│ 3.3 Investments             ➔ Stocks, Mutual Funds, FDs, EPF/PPF        │
│ 3.4 Universal Income        ➔ Recurring, Seasonal, Payroll Integration  │
│ 3.5 Financial Reports       ➔ Balance Sheet, P&L, Cash Flow, Tax       │
│ 3.6 Forecasting             ➔ Wealth Projections, FIRE Engine, Milestones│
│ 3.7 AI Financial Assistant  ➔ LLM-based Advisor, Anomaly Detection     │
│ 3.8 Performance & Security  ➔ Optimization, Security Hardening, Scale  │
│ 3.9 Production Release      ➔ Zero-Downtime Deployment & Final Gate     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Design Principles for Phase 3 Modules

1. **Domain Event-Driven Architecture**
   - Domain operations emit structured events mapped into `AuditEvent` records and `FinancialCommand` invocations.

2. **Reconcilable Domain Projections**
   - Cached projection fields (e.g. `Asset.currentValue`, `Liability.outstandingPrincipal`, `Investment.currentPrice`) MUST be 100% reconcilable against underlying domain financial event tables (`AssetFinancialEvent`, `JournalEntry`).

3. **Sub-Ledger Integration**
   - Asset, Liability, and Investment modules act as specialized sub-ledgers.
   - All sub-ledger movements settle into the central general ledger via `FinancialCommand` and `LedgerService`.

4. **Multi-Currency Support & Standardization**
   - Base monetary amounts are stored with explicit currency metadata, converted to household base currency (`INR` default) for ledger entry balance checking.

5. **RBAC & Governance Enforcement**
   - Role-Based Access Control (`OWNER`, `MEMBER`, `VIEWER`) strictly enforced at the API route level:
     - `OWNER` / `MEMBER`: Create, Edit Drafts, Post, Revalue, Dispose, Reconcile.
     - `VIEWER`: Read-only access across all financial data.

---

## Phase 3 Module Dependency Flow

```
    [3.1 Assets]  ───┐
    [3.2 Liabilities] ┼──► [3.4 Universal Income] ──► [3.5 Reports] ──► [3.6 Forecasting] ──► [3.7 AI Assistant]
    [3.3 Investments] ┘
```
