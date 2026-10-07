# Kamasi Finance — Goal Funding v2: Deterministic Goal Funding Planner Walkthrough

## Summary of Accomplishments

Goal Funding v2 transitions Kamasi Finance from simple funding gap suggestions (v1) into a full **Deterministic Goal Funding Planner**. The engine strictly preserves the Certified Accounting Core (`FinancialCommand` $\rightarrow$ `LedgerService` $\rightarrow$ `Journal` $\rightarrow$ `JournalEntry` $\rightarrow$ `Account.balance` $\rightarrow$ `AuditService`) and introduces zero unauthorized accounting mutations while providing transparent, mathematical, and explainable funding planning.

---

## 1. Architectural Highlights

### 1.1 Goal Model Extension (Single Source of Truth)
- Leverages the existing certified `Goal` model (`id`, `name`, `targetAmount`, `currentAmount`, `targetDate`, `priority`, `monthlyContribution`).
- Added `deadlineFlexibility` (`STRICT`, `MODERATE`, `FLEXIBLE`) with `@default("MODERATE")`.
- Added `fundingEligibility` (`NOT_ELIGIBLE`, `OPTIONAL`, `ELIGIBLE`) with `@default("OPTIONAL")` to `Asset`.
- Preserved single source of truth without duplicating the Goal model.

### 1.2 Financial Snapshot Service (`FinancialSnapshotService`)
- Reads authoritative financial truth from existing certified reporting modules:
  - Total Liquid Cash from active `BANK` and `CASH` accounts.
  - Trailing 90-day annualized expenses and net income from `FinancialReportingService`.
  - Authoritative EMI obligations from active borrowings.
  - Existing investments and eligible asset values.
- **Hard Emergency Reserve Constraint**:
  $$\text{Available Funding Cash} = \max(0, \text{Total Cash} - \text{Emergency Reserve} - \text{Earmarked Cash} - \text{Restricted Cash})$$
- **Multi-Goal Protection**:
  $$\text{Goal Funding Capacity} = \max(0, \text{Monthly Surplus} - \text{Higher-Priority Goal Commitments})$$

### 1.3 Deterministic Gap & 7 Strategy Plugins
- **Deterministic Gap Engine**:
  - Net funding gap $= \max(0, \text{Target} - (\text{Available Cash} + \text{Projected Own Savings}))$.
  - If gap $\le 0 \rightarrow$ flags `FULLY_FUNDED` and immediately stops unnecessary borrowing/investing suggestions.
- **7 Strategy Plugins**:
  1. `SaveStrategy`: Increases monthly savings within affordable capacity.
  2. `FixedIncomeStrategy`: Term instruments / recurring deposits with versioned yield rates.
  3. `InvestStrategy`: Advisory SIP simulation with short-horizon volatility risk flags (< 24 months).
  4. `SellAssetStrategy`: Reallocates only `ELIGIBLE` and `OPTIONAL` assets.
  5. `ExtendDeadlineStrategy`: Respects `deadlineFlexibility` (blocks extension if `STRICT`).
  6. `RaiseIncomeStrategy`: Informational earning benchmark without living standard compromise.
  7. `BorrowStrategy`: Certified reducing-balance EMI simulation with debt service ratio cap (35%).

### 1.4 Controlled Combination Engine (`CombinationEngine`)
Evaluates 6 controlled combinations:
1. `SAVE + FIXED_INCOME` (Conservative balanced)
2. `SAVE + INVEST` (Growth balanced)
3. `SAVE + EXTEND_DEADLINE` (Low stress)
4. `SELL_ASSET + SAVE` (Asset-assisted savings)
5. `SAVE + BORROW` (Hybrid loan + discipline)
6. `SAVE + INVEST + BORROW` (Comprehensive bridge)

### 1.5 Deterministic Ranker (`StrategyRanker`)
- Normalizes sub-scores to a 0–100 scale: Feasibility, Monthly Burden, Risk-Adjusted, Cost Efficiency, Liquidity, and Invasiveness.
- Implements the **Least-Invasive Hierarchy**:
  $$\text{Cash} > \text{Save} > \text{Fixed Income} > \text{Invest} > \text{Sell Asset} > \text{Extend Deadline} > \text{Borrow}$$
- Produces transparent reason codes (e.g. `AFFORDABLE_MONTHLY_SAVING`, `BALANCED_CONSERVATIVE_PLAN`, `EXCEEDS_AFFORDABLE_SURPLUS`).

### 1.6 Plan Lifecycle, Immutability & Health Check (`GoalFundingPlanLifecycleService`)
- Versioned immutable plan records (`GoalFundingPlan` and `GoalFundingPlanLifecycleHistory`).
- Lifecycle progression: `DRAFT` $\rightarrow$ `PROPOSED` $\rightarrow$ `USER_APPROVED` $\rightarrow$ `ACTIVE` $\rightarrow$ `COMPLETED` / `CANCELLED`.
- Version Superseding: Approving plan v$(N+1)$ automatically marks active plan v$N$ as `SUPERSEDED`.
- Stale Plan Detection: Evaluates whether changes in surplus, cash, or emergency reserves breach constraints, transitioning status to `REVIEW_REQUIRED`.

### 1.7 AI Boundary & Strict Number Validator (`AiPlanExplanationService` & `AiGoalParser`)
- **AiGoalParser**: Natural language goal drafter parsing amount, date, monthly contribution, and priority.
- **AiPlanExplanationService**: Strict number validator checks every number against an allowed whitelist. Any hallucinated number immediately triggers fallback to certified deterministic narrative text.

---

## 2. API Endpoints

- `GET /api/goals/[id]/plan`: Computes deterministic snapshot, strategies, combinations, and ranker proposal on demand.
- `POST /api/goals/[id]/plan`: Simulates with overrides (`targetDate`, `monthlyContribution`) and optionally persists proposed plan.
- `POST /api/goals/[id]/plan/approve`: Transitions plan to `ACTIVE`, supersedes prior versions, updates goal plan parameters, and logs audit events.
- `GET /api/goals/[id]/plan/monitor`: Runs health checks and triggers `REVIEW_REQUIRED` on material deviations.
- `POST /api/goals/parse-prompt`: Parses natural language prompt into structured goal form fields.

---

## 3. Verification & Test Results

1. **Planner Unit & Production Suite (`goal-funding-v2-planner.test.ts`)**:
   - 10/10 tests passed (100% pass rate).
2. **Goal Funding v1 Regression Suite (`goal-funding-production.test.ts`)**:
   - 6/6 tests passed (100% pass rate).
3. **Full Application Test Regression Suite**:
   - **51 test files passed (51/51)**.
   - **401 tests passed (401/401)**.
4. **TypeScript Compilation (`npx tsc --noEmit`)**:
   - Clean compilation, 0 errors.
5. **Next.js Production Build (`npm run build`)**:
   - Clean build, 0 errors across all routes and pages.
