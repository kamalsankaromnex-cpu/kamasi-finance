# Kamasi Finance — Reference Data API Contract

## 1. Financial Scopes (/api/scopes)

### GET /api/scopes
- **Query params**: `activeOnly` (boolean)
- **Response**: Array of `FinancialScope` objects with `_count` (`transactions`, `costCenters`, `scopeCategories`, `budgets`, `assets`, `liabilities`)

### POST /api/scopes
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name: string, code?: string, description?: string, color?: string, icon?: string }`
- **Response**: Created `FinancialScope` object

### PATCH /api/scopes/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **System Protection**: Cannot modify system scopes if non-system
- **Body**: `{ name?: string, description?: string, color?: string, icon?: string, isActive?: boolean }`
- **Response**: Updated `FinancialScope` object

### DELETE /api/scopes/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **System Protection**: Cannot delete system scopes
- **Logic**: If references > 0, deactivates (`isActive: false`); if references == 0, hard-deletes.
- **Response**: `{ success: true, action: 'DELETED' | 'DEACTIVATED', message: string }`

---

## 2. Categories (/api/categories)

### GET /api/categories
- **Query params**: `activeOnly` (boolean), `type` ('INCOME' | 'EXPENSE')
- **Response**: Array of `Category` objects with `scopeCategories`, `subcategoriesMaster`, and `_count`

### POST /api/categories
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name: string, type: 'INCOME' | 'EXPENSE', icon?: string, color?: string, scopeIds?: string[] }`
- **Response**: Created `Category` object

### PATCH /api/categories/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name?: string, icon?: string, color?: string, isActive?: boolean, scopeIds?: string[] }`
- **Response**: Updated `Category` object

### DELETE /api/categories/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Logic**: If references > 0, deactivates; if references == 0, hard-deletes.
- **Response**: `{ success: true, action: 'DELETED' | 'DEACTIVATED', message: string }`

---

## 3. Subcategories (/api/subcategories)

### GET /api/subcategories
- **Query params**: `categoryId` (string), `activeOnly` (boolean)
- **Response**: Array of `CategorySubcategory` objects with `category` and `_count`

### POST /api/subcategories
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name: string, categoryId: string }`
- **Response**: Created `CategorySubcategory` object

### PATCH /api/subcategories/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name?: string, isActive?: boolean }`
- **Response**: Updated `CategorySubcategory` object

### DELETE /api/subcategories/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Logic**: If references > 0, deactivates; if references == 0, hard-deletes.
- **Response**: `{ success: true, action: 'DELETED' | 'DEACTIVATED', message: string }`

---

## 4. Cost Centers / Facilities (/api/cost-centers)

### GET /api/cost-centers
- **Query params**: `scopeId` (string), `activeOnly` (boolean)
- **Response**: Array of `CostCenter` objects with `scope` and `_count`

### POST /api/cost-centers
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name: string, code?: string, scopeId: string }`
- **Response**: Created `CostCenter` object

### PATCH /api/cost-centers/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Body**: `{ name?: string, code?: string, isActive?: boolean }`
- **Response**: Updated `CostCenter` object

### DELETE /api/cost-centers/[id]
- **RBAC**: `ADMIN` or `OWNER`
- **Logic**: If references > 0, deactivates; if references == 0, hard-deletes.
- **Response**: `{ success: true, action: 'DELETED' | 'DEACTIVATED', message: string }`
