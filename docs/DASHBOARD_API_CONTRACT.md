# Kamasi Finance — Dashboard API Contract

## `GET /api/dashboard`

Retrieves the aggregated, read-only snapshot for the Financial Command Center.

### Query Parameters

| Parameter | Type | Required | Values | Default | Description |
|-----------|------|----------|--------|---------|-------------|
| `period` | string | No | `MONTHLY`, `QUARTERLY`, `YEARLY`, `ALL_TIME` | `MONTHLY` | Temporal scope for cash flows and budget utilization |

---

### Response Schema (`200 OK`)

```typescript
{
  "asOf": "2026-10-06T09:15:00.000Z",
  "period": {
    "type": "MONTHLY",
    "startDate": "2026-10-01T00:00:00.000Z",
    "endDate": "2026-10-31T23:59:59.999Z",
    "label": "October 2026"
  },
  "currency": {
    "code": "INR",
    "symbol": "₹"
  },
  "overview": {
    "netWorth": 1250000,
    "availableCash": 340000,
    "totalAssets": 1500000,
    "totalLiabilities": 250000,
    "incomeInPeriod": 150000,
    "expensesInPeriod": 45000,
    "netSavingsInPeriod": 105000,
    "investmentMarketValue": 750000,
    "borrowingOutstanding": 200000
  },
  "cashFlow": {
    "totalInflow": 150000,
    "totalOutflow": 45000,
    "netSurplus": 105000,
    "series": [
      { "period": "May", "income": 120000, "expenses": 40000, "netCashFlow": 80000 },
      { "period": "Jun", "income": 130000, "expenses": 42000, "netCashFlow": 88000 }
    ]
  },
  "netWorth": {
    "current": 1250000,
    "assetBreakdown": { "liquidCash": 340000, "investments": 750000, "physicalAssets": 410000 },
    "liabilityBreakdown": { "loans": 200000, "creditCards": 50000 },
    "trajectorySeries": [
      { "period": "May", "netWorth": 1000000, "totalAssets": 1200000, "totalLiabilities": 200000 }
    ]
  },
  "budget": {
    "totalBudgeted": 60000,
    "totalSpent": 45000,
    "totalRemaining": 15000,
    "utilizationPercentage": 75,
    "categories": [
      { "categoryId": "c1", "name": "Groceries", "budgeted": 20000, "actual": 15000, "remaining": 5000, "percentage": 75, "status": "HEALTHY" }
    ]
  },
  "investments": {
    "holdingsCount": 4,
    "totalCostBasis": 600000,
    "totalMarketValue": 750000,
    "unrealizedGainLoss": 150000,
    "totalReturn": 25,
    "allocation": [
      { "type": "EQUITY", "marketValue": 500000, "percentage": 67 }
    ]
  },
  "borrowings": {
    "activeCount": 1,
    "totalPrincipal": 250000,
    "totalOutstanding": 200000,
    "totalRepaid": 50000,
    "repaymentProgressPercent": 20,
    "items": [
      { "id": "b1", "name": "Auto Loan", "lenderName": "HDFC Bank", "principal": 250000, "outstanding": 200000, "emiAmount": 8500, "interestRate": 9.2 }
    ]
  },
  "goals": {
    "totalGoals": 2,
    "overallTarget": 1000000,
    "overallSaved": 400000,
    "overallProgressPercent": 40,
    "items": [
      { "id": "g1", "name": "Emergency Fund", "targetAmount": 500000, "currentAmount": 300000, "progressPercent": 60, "targetDate": "2027-01-01", "status": "ACTIVE", "priority": "HIGH" }
    ]
  },
  "forecast": {
    "available": true,
    "scenarioName": "Baseline Scenario",
    "projected3MonthNetWorth": 1350000,
    "projected6MonthNetWorth": 1450000,
    "projected12MonthNetWorth": 1650000,
    "projectedEndingCash": 550000,
    "trajectory": []
  },
  "recentActivity": [
    { "id": "tx1", "date": "10/06/2026", "description": "Grocery Store", "amount": 2500, "type": "EXPENSE", "accountName": "Checking" }
  ],
  "alerts": [
    { "id": "alert-1", "type": "INFO", "title": "Liquidity Healthy", "message": "Liquid reserves cover 7.6 months of average expenditures." }
  ]
}
```
