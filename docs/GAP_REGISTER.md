# Gap Register - Kamasi Finance

**Document Status**: Updated (Phase 3 Verified)  
**Date**: September 25, 2026  

---

## Complete Gap Classification & Tracking Register

| Gap ID | Priority | Domain | Category | Status | Description & Location | Remediation Action |
| :--- | :---: | :--- | :--- | :---: | :--- | :--- |
| **GAP-01** | **P0** | Architecture | Verified Issue | **RESOLVED (Phase 2)** | UI mutated in-memory store; missing Next.js API Route Handlers under `/api`. | Built 10 server-side REST API Route Handlers in `src/app/api/...` backed by Prisma ORM. |
| **GAP-02** | **P0** | Security | Verified Issue | **RESOLVED (Phase 3)** | Missing `/login`, `/register`, and `src/middleware.ts`. | Created `/login` and `/register` pages, `/api/auth/*` endpoints, and `src/middleware.ts` JWT route guard. |
| **GAP-03** | **P0** | Security / RBAC | Verified Issue | **RESOLVED (Phase 3)** | Household roles (`OWNER`, `MEMBER`, `VIEWER`) not enforced in backend. | Implemented `src/lib/rbac.ts` enforcing server-side role checks and household data isolation on all endpoints. |
| **GAP-04** | **P1** | Financial Logic | Verified Issue | **RESOLVED (Phase 1/2)** | Transfers did not update source/destination balances in [`src/lib/store.ts:48-52`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/lib/store.ts#L48-L52). | Implemented atomic double-entry balance adjustment in store & Prisma API routes (`prisma.$transaction`). |
| **GAP-05** | **P1** | Financial Logic | Verified Issue | **RESOLVED (Phase 1)** | Budget spending in [`src/app/budgets/page.tsx:52-54`](file:///c:/Users/CIE/OneDrive%20-%20Omnex%20Inc/Documents/fin/src/app/budgets/page.tsx#L52-L54) summed all historical expenses. | Scoped budget spent calculations strictly to `b.month` and `b.year`. Verified in Vitest. |
| **GAP-06** | **P1** | Financial Logic | Verified Issue | **RESOLVED (Phase 1/2)** | Savings goal allocations did not deduct bank balance. | Implemented atomic goal contribution in store & `/api/goals/[id]/contribute` route (`prisma.$transaction`). |
| **GAP-07** | **P1** | Financial Logic | Verified Issue | **RESOLVED (Phase 1)** | 2026–2050 forecasting engine compounded physical real estate at market equity CAGR (11%). | Separated Liquid Investable Capital (compounded at equity CAGR) from Fixed Physical Assets (5% appreciation). |
| **GAP-08** | **P2** | Precision | Verified Issue | **RESOLVED (Phase 2)** | Runtime store used JavaScript float numbers. | Connected UI to Prisma ORM backed by persistent Decimal storage. |
| **GAP-09** | **P2** | Investment | Verified Issue | OPEN | Brokerage balance vs holding market valuation disconnect. | Reconcile brokerage cash balance vs total security holding valuation. |
| **GAP-10** | **P2** | Forecasting | Verified Issue | OPEN | Milestone costs unindexed for inflation. | Add inflation-adjusted indexing toggle for future milestone expenses. |
| **GAP-11** | **P3** | Testing | Verified Issue | **RESOLVED (Phase 3)** | Limited test suite. | Expanded Vitest suite to 17 passed tests covering unit math, Prisma persistence, auth, RBAC, and IDOR protection. |
| **GAP-12** | **P3** | UI/UX | Suspected Issue | OPEN | CSV import modal uses textarea. | Add drag-and-drop file upload handler to CSV import dialog. |
