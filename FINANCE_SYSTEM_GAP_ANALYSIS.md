# Kamasi Finance — Comprehensive System Gap Analysis Report

## Executive Summary
This document provides a comprehensive, end-to-end gap analysis of the **Kamasi Finance** application. It evaluates all functional domains, security controls, ledger architecture, database integrity, user experience, and operational readiness.

Each section breaks down the **Current System Capabilities**, **Identified Gaps & Operational Risks**, **Severity Rating** (High, Medium, Low), and **Architectural Remediation Recommendations**.

---

## 1. Domain-by-Domain Gap Matrix

### 1.1 Income & Salary Engine
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Salary Calculation** | Full gross-to-net breakdown (Basic, HRA, Allowances, PF, PT, TDS, ESI). | No automated Indian Tax Regime (Old vs. New) tax slab simulator for Section 80C/80D optimizations. | **Medium** | Add an interactive ITR Tax Calculator component to the Salary module comparing tax liabilities under Old vs New Regimes. |
| **Salary Increments** | Payslips record historical monthly pay figures. | Absence of an explicit Appraisal/Increment revision history table tracking percentage pay hikes over time. | **Low** | Introduce an `EmploymentRevision` model to track appraisal dates, hike percentages, and revised CTC components. |
| **Income Occurrences** | Income sources generate pending/received occurrences. | Marking an occurrence as `FULLY_RECEIVED` requires manually picking/verifying the destination account. | **Low** | Provide an auto-credit option when confirming an income occurrence using the source's `defaultAccountId`. |

---

### 1.2 Expense Management & Double-Entry Ledger
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Expense Entries** | Quick Add, Advanced Entry with splits, CSV Import with preview, Recurring Bills, Refunds, Reversals. | Cross-currency expense support (e.g. USD software sub paid via INR card) relies on manual INR entry without live FX conversion rates. | **Low** | Integrate an offline/cached FX rate conversion provider for foreign currency transaction logging. |
| **Receipt Storage** | Stores `receiptUrl` text link. | Lacks a built-in drag-and-drop receipt image upload server route saving directly to local disk/object storage. | **Medium** | Implement a secure file upload API route (`/api/uploads/receipts`) supporting JPEG/PNG/PDF receipt image storage. |
| **Split Allocations** | Supports manual multi-category itemized splits during advanced entry. | Automation rules engine cannot currently auto-apply category percentage splits on matching raw bank imports. | **Medium** | Expand `AutomationRule` action options to support `APPLY_SPLIT` rule actions. |

---

### 1.3 Rule-Based Automation Engine
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Trigger Execution** | Supports `TRANSACTION_CREATED`, `SCHEDULED_CRON`, `BUDGET_THRESHOLD`, `RECURRING_DUE`. | Scheduled cron endpoint (`/api/cron/recurrence`) relies on external HTTP pingers or manual triggers. | **Medium** | Provide a built-in background timer interval (using Node.js `setInterval` or OS cron wrapper script) for zero-dependency standalone execution. |
| **Budget Alerts** | Deduplicated threshold alerts triggered when utilization crosses 80%/100%. | Lacks automated "Budget Surplus Auto-Sweep" action to automatically move end-of-month unspent budget balances into savings goals. | **Low** | Add `SWEEP_UNSPENT_BUDGET` action type to the automation engine rules. |

---

### 1.4 Accounts, Credit Cards, Investments & Liabilities
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Credit Card Cycle** | Tracks credit limit, billing cycle day, and payment due date. | Does not automatically generate a "Credit Card Bill Due" reminder transaction in recurring bills when a cycle closes. | **Medium** | Auto-generate a recurring bill occurrence on billing cycle day reflecting current outstanding card balance. |
| **Fixed Deposits & Loans** | Stores interest rate, principal, and maturity date. | Does not compute automated monthly compound interest accruals or generate loan EMI amortization schedules automatically. | **Medium** | Build a Loan Amortization & FD Interest Accrual schedule generator module. |
| **Investment Valuation** | Manual price and quantity tracking for Stocks, Mutual Funds, Gold, PPF. | Lacks live BSE/NSE market price sync via stock ticker APIs (relies on manual updates). | **Low** | Implement an optional market price refresh plugin for Indian stocks and mutual funds. |

---

### 1.5 Budgets & Savings Goals
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Budget Rollover** | Computes monthly category budget balances and dynamic unspent rollover. | Does not persist static end-of-financial-year budget closure snapshots for multi-year historical comparison. | **Low** | Create an annual financial year budget closure snapshot service. |
| **Savings Goals** | Complete lifecycle (`ACTIVE`, `PAUSED`, `COMPLETED`, `ARCHIVED`), deposit, withdraw, bounds checking. | Withdrawals from savings goals credit a bank account, but do not prompt the user to link a specific milestone or reason tag. | **Low** | Add optional milestone selector when withdrawing saved goal funds. |

---

### 1.6 Security, RBAC & Multi-Tenancy
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Authorization** | Strict session RBAC (`OWNER`, `MEMBER`, `CHILD`/`VIEWER`), IDOR protection on every API endpoint. | Lacks a dedicated, downloadable User Security Audit Log report (CSV/JSON export of all member logins and mutations). | **Low** | Build an Audit Log export button in Household Settings. |
| **API Idempotency** | Mandatory `Idempotency-Key` enforced on goal deposits, withdrawals, bill payments, and transaction entries. | Missing automatic rate-limiting on sensitive auth routes (`/api/auth/login`, `/api/auth/register`) to prevent brute-force attacks. | **Medium** | Implement IP-based sliding window rate-limiting middleware for authentication endpoints. |

---

### 1.7 Reporting, Export & Compliance
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Financial Reporting** | Cash flow statements, net worth tracking, category breakdowns, 2026–2050 forecasting scenarios. | Lacks direct PDF / Excel report export options for sharing financial statements with accountants/advisors. | **Medium** | Integrate a client-side/server-side PDF & Excel spreadsheet generation utility (e.g., `jsPDF`, `xlsx`). |

---

### 1.8 Database & Infrastructure Operations
| Feature Area | Current State | Identified Gap | Severity | Recommended Remediation |
|---|---|---|---|---|
| **Database Engine** | SQLite database (`prisma/dev.db`) used for development and localized deployment. | SQLite write-lock concurrency limits under high simultaneous multi-user household writes. | **Low** | Provide PostgreSQL connection configuration and migration documentation for high-concurrency production deployments. |

---

## 2. Summary Matrix of Gaps & Priority Roadmap

| Priority Level | Gap Description | Functional Impact | Target Module |
|---|---|---|---|
| **P1 (Medium)** | Direct Drag-and-Drop Receipt File Uploads | Users must paste URL text links instead of uploading local PDF/image receipts. | Expense Management |
| **P1 (Medium)** | Auth Route Rate Limiting | Risk of brute-force password attempts on `/api/auth/login`. | Security & Auth |
| **P1 (Medium)** | Automated Credit Card Statement Due Reminders | Credit card statement closure requires manual recurring bill setup. | Accounts & Cards |
| **P1 (Medium)** | Export Reports to PDF/Excel | Users cannot download styled PDF financial reports for tax/accounting. | Reporting |
| **P2 (Low)** | Indian Tax Regime (Old vs New) Comparison | Manual tax planning needed outside the app. | Salary & Income |
| **P2 (Low)** | Live NSE/BSE Investment Ticker Refresh | Portfolio values must be updated manually. | Investments |
| **P2 (Low)** | Automated FD & Loan Amortization Schedules | Compound interest & EMI principal-interest split computed manually. | Liabilities & Assets |
| **P2 (Low)** | Audit Log Export | No one-click download for household security logs. | Household Settings |

---

## 3. Next Steps & Recommended Execution Plan

1. **Phase A (Immediate Enhancements - P1 Items)**:
   - Implement IP rate limiting on `/api/auth/login`.
   - Add local receipt file upload handler (`/api/uploads/receipts`).
   - Implement PDF/Excel report export button on `/reports`.

2. **Phase B (Financial Intelligence - P2 Items)**:
   - Add Indian Tax Regime (Old vs New) tax planning utility to Salary module.
   - Build Loan Amortization Schedule generator.
   - Add Credit Card statement bill auto-generation trigger on cycle date.
