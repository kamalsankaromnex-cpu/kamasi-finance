# Kamasi Finance — Reference Data Architecture Specification

## 1. System Overview & Core Principles

Reference Data in Kamasi Finance defines the master classification framework for transactions, assets, liabilities, and budgets across households.

### Core Architecture Rules:
1. **Reference Data is NOT Financial Data**:
   - Master reference records (Scopes, Categories, Subcategories, Cost Centers) provide classification taxonomy only.
   - Creating, modifying, or deactivating reference data **never** creates or modifies Journal entries, Journal items, or Account balances.
   - Reference data is decoupled from double-entry accounting ledgers.
2. **Zero Hardcoded Data in Frontend**:
   - The user interface does not contain hardcoded lists, mock categories, or static arrays for reference data.
   - All options are dynamically fetched via authoritative REST endpoints scoped to the user's active household.
3. **Multi-Tenant Household Isolation**:
   - Every reference record is either:
     - `isSystem: true`, `householdId: null` — System-provided reference data available to all households, protected against modification or deletion by non-system actors.
     - `isSystem: false`, `householdId: "<uuid>"` — Household-custom reference data, owned strictly by that household and invisible to other households.
4. **Safe Deletion & Referential Integrity**:
   - Records with zero historical references (e.g. 0 transactions, 0 budgets, 0 assets, 0 liabilities) may be safely hard-deleted by an authorized Household Admin/Owner.
   - Records with historical references **cannot be deleted**. Attempting to delete a referenced entity results in safe deactivation (`isActive: false`).
   - Inactive reference records are preserved for historical ledger rendering and audit compliance, but automatically omitted from new entry pickers.
5. **Universal Extensibility via Registry**:
   - The frontend architecture uses a declarative `ReferenceTypeConfig` registry. Adding a new reference entity (e.g. Tax Codes, Payment Channels) requires registering a schema definition rather than rewriting pages.

---

## 2. Entity Hierarchy & Relationship Model

```
                    ┌─────────────────────────┐
                    │     FinancialScope      │
                    │   (Where / For Whom)    │
                    └───────────┬─────────────┘
                                │
                 1:N            │            M:N
          ┌─────────────────────┴─────────────────────┐
          │                                           │
          ▼                                           ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│       CostCenter        │               │      ScopeCategory      │
│  (Facility / Location)  │               │      (Cross Matrix)     │
└─────────────────────────┘               └───────────┬─────────────┘
                                                      │
                                                      │ M:N
                                                      ▼
                                          ┌─────────────────────────┐
                                          │        Category         │
                                          │     (What / Purpose)    │
                                          └───────────┬─────────────┘
                                                      │
                                                      │ 1:N
                                                      ▼
                                          ┌─────────────────────────┐
                                          │  CategorySubcategory    │
                                          │  (Granular Breakdown)   │
                                          └─────────────────────────┘
```

### Entity Responsibilities:
- **FinancialScope**: Defines the broad operational domain (e.g., Family, Agriculture, Sericulture, Business). Scopes organize cost centers and define allowed expense/income categories.
- **CostCenter**: Represents physical or administrative locations/facilities tied to a specific Financial Scope (e.g. Silk Shed, Goat Shed #1, Main House).
- **Category**: Master classification for income and expenses (e.g., Feed & Nutrition, Veterinary Care, Groceries, Utilities).
- **ScopeCategory**: Association junction linking a Category to one or more Scopes, allowing dynamic category filtering in transaction entry forms based on the selected Scope.
- **CategorySubcategory**: Detailed classification beneath a parent Category (e.g., Concentrate Feed, Green Fodder, Medicines).

---

## 3. Reference Data Registry Pattern

The UI at `/settings/reference-data` uses a strongly typed registry:

```typescript
export type ReferenceDataType = "scopes" | "categories" | "subcategories" | "cost-centers";

export interface ReferenceTypeConfig {
  id: ReferenceDataType;
  title: string;
  singularTitle: string;
  description: string;
  endpoint: string;
  supportsScopeMapping?: boolean;
  supportsParentCategory?: boolean;
  supportsParentScope?: boolean;
}
```

This decoupling ensures that:
- Adding a future reference entity (such as Projects or Vendor Types) only requires adding a configuration entry and corresponding REST endpoint.
- Filter, search, pagination, status badge, and delete/deactivate confirmation dialogs are completely unified.

---

## 4. Deletion vs Deactivation State Machine

```
User triggers DELETE on record
          │
          ▼
Is record isSystem === true?
   ├── YES ──► Reject with 403 Forbidden ("System records cannot be deleted")
   │
   └── NO
        │
        ▼
Does record have referencing foreign keys?
(transactions > 0 OR budgets > 0 OR assets > 0 OR subcategories > 0)
   │
   ├── YES ──► Soft Deactivate: set isActive = false
   │           Record preserved for history; excluded from active dropdowns
   │           Response: { action: "DEACTIVATED", message: "..." }
   │
   └── NO ───► Hard Delete: prisma.entity.delete()
               Completely purged from database
               Response: { action: "DELETED", message: "..." }
```

---

## 5. Audit Logging

All reference data mutations (CREATE, UPDATE, DEACTIVATE, DELETE) are logged via `AuditService.record()`:
- `action`: `"CREATE"` | `"UPDATE"` | `"DELETE"`
- `entityType`: `"HOUSEHOLD"`
- `entityId`: Reference record ID
- `metadata`: `{ referenceType: "Scope" | "Category" | "Subcategory" | "CostCenter", name, changes, actionTaken }`
