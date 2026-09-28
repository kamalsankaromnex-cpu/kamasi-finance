# Phase 3E — Browser Acceptance Results

**Date:** 2026-09-28  
**Tool:** configured Codex in-app browser automation (CUA)  
**Origin:** `http://localhost:3105`  
**Data:** synthetic registered household/user only; disposable `prisma/phase3-qa.db`.

## Executed journey

| ID | Scenario | Preconditions / data | Steps | Expected | Actual | Status / severity | Evidence |
|---|---|---|---|---|---|---|---|
| UI-001 | Register/login synthetic household | Disposable app server and QA DB | Register with synthetic identity; sign out; log in | Session opens registered household | Registration and login succeeded; user menu offered sign out | PASS | CUA browser navigation/form interaction; `http://localhost:3105/register` and authenticated routes |
| UI-002 | Create two accounts | Synthetic household; amounts ₹1,000 and ₹250 | Create bank and cash accounts | Both appear with balances | Accounts page rendered Browser Salary Bank ₹1,000 and Browser Transfer Cash ₹250 | PASS | Rendered `/accounts` AX tree |
| UI-003 | Add income stream and employment | Synthetic user and accounts | Add employment ₹5,000 and consulting stream ₹400 | Cards show source and amount | Employment and stream visible; pending receipt ₹400 | PASS | Rendered `/income-expenses` AX tree |
| UI-004 | Generate payslip and confirm salary | September 2026 payslip, basic ₹5,000, HRA ₹0 | Generate payslip, select account/date/amount, confirm | Payslip credited once and account rises | Payslip generated; confirmation rendered `CREDITED TO BANK`, credited ₹5,000, destination Browser Salary Bank | PASS | Salary & Payslips UI snapshot showing payslip components/status |
| UI-005 | Record grocery expense and budget | September 2026 synthetic ledger; expense ₹8,500; target ₹8,000 | Quick Add Expense, choose Groceries & Food; set budget limit | Utilization 106.25% | Expense card displayed −₹8,500; total spent ₹8,500; planned ₹8,000; displayed utilization rounded to 106% | PASS with display precision defect P2 | Rendered `/budgets` AX snapshots |
| UI-006 | Recurring bill, partial payment | Synthetic bill ₹500, due 2026-09-28 | Create bill rule; open Pay Now; attempt amount ₹100 | Partial payment saved, remaining ₹400 | Form validation showed value 500100 because number field automation appended text; no payment was submitted | NOT RUN, P1 coverage gap | CUA AX form snapshot and “Value must be <= 500” message |
| UI-007 | Transfer between two accounts via browser | Two synthetic accounts | Open transaction flow, transfer and inspect both balances | Correct paired balance movement | API transfer reconciliation passed; browser transfer path not exercised | NOT RUN, P1 | API output only; not browser evidence |
| UI-008 | Financial report reconciliation | Synthetic household ledger has salary ₹5,000 and expense ₹8,500 | Open reports and compare monthly values | Report must reflect current household ledger | Page rendered sample totals ₹3,37,500 gross income / ₹74,500 expenses, not the synthetic ledger; fixed data confirmed in `src/app/reports/page.tsx` | FAIL, P0 | Rendered `/reports` AX snapshot and source inspection |
| UI-009 | Household identity and data isolation | Synthetic account logged in | Inspect shell identity; cross household API check | Shell identifies active user/household; other household cannot read records | Header shows `Alex Kamasi`, `alex@kamasi.com`, `Kamasi Family Household`, and 2 members while `/api/auth/me` identifies synthetic user. API cross-household record lookup returned not found in API regression. | FAIL UI identity P1; PASS API isolation | CUA shell snapshots; API regression two-household 404 assertion |
| UI-010 | Historical budget month filter | Synthetic month-specific ledger | Inspect budgets page controls and change month | Past month can be selected and values update | No month selector/control on observed budget summary or expense history UI | NOT IMPLEMENTED, P1 | `/budgets` AX tree |
| UI-011 | Updated authenticated shell | Fresh second synthetic household, no accounts | Register user and inspect rendered shell after `/api/auth/me` resolves | Display actual name, email, household, currency, member count, role | Rendered `Phase 3 Verify Owner`, `phase3verify20260928@example.com`, `Phase 3 Verify Household`, OWNER, INR and household member count; no Alex/Kamasi identity. | PASS; confirms P3-004 fix | CUA AX snapshot at `http://localhost:3106/` |
| UI-012 | Updated report household scoping | Same fresh household with no posted transactions | Navigate to Reports | Empty household reports zero totals, never sample data | September 2026 income ₹0, expenses ₹0, net ₹0; 0 transaction rows; no unrelated fixed totals. | PASS for empty household isolation; non-empty browser reconciliation NOT RUN | CUA AX snapshot `http://localhost:3106/reports`; report aggregation unit tests |

## Journey scope and reproducibility

Synthetic acceptance path used a newly registered user, created accounts through `/accounts`, income/employment and payslip through `/income-expenses`, grocery expense and budget through `/budgets`, recurring bill through `/bills`, and report review through `/reports`. Browser actions are in the local interactive session, and results above transcribe the rendered accessibility tree.

To reproduce manually: start the app pointed at a disposable SQLite DB with a test-only 32+ character JWT secret; register a new synthetic account; create a bank account and cash account; add an employment and income source; generate and confirm a payslip; add an ₹8,500 grocery expense; set an ₹8,000 September budget; inspect the UI utilization; create a ₹500 recurring bill; compare the report with the transaction ledger. Do not use live household data. API cross-household regression can be rerun with `scripts/phase3-financial-api-regression.ps1`.

## Gate result

Browser automation is configured and was used. It does not provide Playwright trace/video artifacts, but rendered AX snapshots and actual interactions provide evidence for the executed steps. After the initial findings, shell identity and report totals were corrected. A second synthetic household confirmed its identity renders correctly and reports zero rows/totals instead of canned values. The first household’s populated ledger was not rechecked in the updated UI, so report reconciliation remains partial. Browser acceptance remains **not passed** because bill payment/transfer paths, historical filter, and populated report comparison remain incomplete.
