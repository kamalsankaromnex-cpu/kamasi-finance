# Kamasi Finance — Universal Project & Financial Planning Engine v2
## Architecture Specification

---

### 1. Executive Summary

The **Universal Project & Financial Planning Engine v2** is Kamasi Finance's initiative-level planning, budgeting, funding, commitment tracking, and financial execution coordination layer.

It bridges long-range, milestone-driven real-world objectives (such as *Sister Marriage*, *Goat Farm Expansion*, *Machinery Purchase*, *River Water Scheme*, *House Construction*, *Land Acquisition*, and *Business Expansion*) with Kamasi Finance's certified immutable double-entry ledger.

---

### 2. Core Architectural Principle

```text
┌────────────────────────────────────────────────────────┐
│                   PROJECT DEFINITION                   │
│        (Title, Scope, Lifecycle State, Metadata)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            VERSIONED FINANCIAL PLAN (v1..vN)           │
│   • Cost Breakdown (Estimated / Approved / Revised)    │
│   • Funding Plan (Savings, Loan, Income, Asset Sale)   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              PAYMENT REQUIREMENTS SCHEDULE             │
│        (Due Dates, Priority, Payee, Status)            │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│           LEDGER LINKAGE & ACTUAL ALLOCATION           │
│     (Posted Transactions -> ProjectPaymentAllocation)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         IMMUTABLE DOUBLE-ENTRY FINANCIAL CORE          │
│       LedgerService ≡ Journal ≡ Account.balance        │
└────────────────────────────────────────────────────────┘
```

#### Non-Negotiable Invariants

1. **Strict Tripartite Separation**:
   $$\mathbf{PLAN} \neq \mathbf{COMMITMENT} \neq \mathbf{ACTUAL}$$
   - **Plan**: Estimated or budgeted amounts. Planning an expense or funding source does **not** create ledger entries and does **not** change bank balances.
   - **Commitment**: Scheduled payment requirements that must be honored by given deadlines. Still not money out the door until paid.
   - **Actual**: Authoritative financial movement recorded as posted `Transaction` records in the immutable ledger. Linked to projects via `ProjectPaymentAllocation`.

2. **Zero Ledger Mutations During Planning**:
   - Creating projects, versioning plans, adding cost items, setting up payment schedules, and drafting funding channels produce **zero journal entries** and **zero modifications** to `Account.balance`.

3. **Funding Channels Separation**:
   - Funding sources explicitly isolate `PLANNED`, `COMMITTED`, and `RECEIVED` amounts.
   - Bank accounts and liquid assets pledged to a project are validated against live ledger balances and monitored for cross-project over-allocation conflicts.

4. **Universal Modeling**:
   - Single unified database model family (`Project`, `ProjectFinancialPlan`, `ProjectCostItem`, `ProjectPaymentRequirement`, `ProjectFundingSource`, `ProjectPaymentAllocation`, `ProjectTask`, `ProjectMilestone`).
   - Adapts to personal, agricultural, industrial, real estate, and commercial projects without creating bespoke schemas or separate tables.

---

### 3. Lifecycle State Machine

- **DRAFT**: Initial concept, rough cost estimates.
- **PLANNED**: Scope defined, cost items budgeted, funding channels identified, ready for execution.
- **ACTIVE**: Execution ongoing, vendor commitments due/paid, transactions allocated.
- **ON_HOLD**: Temporarily paused due to funding constraints or operational delays.
- **COMPLETED**: All milestones finished, commitments paid and allocated.
- **CANCELLED**: Initiative abandoned, unallocated commitments voided.
- **ARCHIVED**: Record sealed for long-term historical retention.

Each state transition is strictly validated and recorded immutably in `ProjectLifecycleHistory` with timestamp, user ID, and transition notes.

