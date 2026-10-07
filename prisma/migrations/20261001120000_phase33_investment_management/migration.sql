-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MUTUAL_FUND',
    "type" TEXT NOT NULL DEFAULT 'MUTUAL_FUND',
    "symbol" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "totalQuantity" DECIMAL NOT NULL DEFAULT 0.00000000,
    "totalCostBasis" DECIMAL NOT NULL DEFAULT 0.00,
    "weightedAverageCost" DECIMAL NOT NULL DEFAULT 0.00,
    "currentPricePerUnit" DECIMAL NOT NULL DEFAULT 0.00,
    "currentMarketValue" DECIMAL NOT NULL DEFAULT 0.00,
    "realizedGainLoss" DECIMAL NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "investmentAccountId" TEXT,
    "closedAt" DATETIME,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Investment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Investment_investmentAccountId_fkey" FOREIGN KEY ("investmentAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Investment" ("id", "householdId", "name", "type", "symbol", "totalQuantity", "totalCostBasis", "weightedAverageCost", "currentPricePerUnit", "currentMarketValue", "notes", "createdAt", "updatedAt")
SELECT "id", "householdId", "name", "type", "symbol", COALESCE("quantity", 0.00000000), COALESCE("purchasePrice" * "quantity", 0.00), COALESCE("purchasePrice", 0.00), COALESCE("currentPrice", 0.00), COALESCE("currentPrice" * "quantity", 0.00), "notes", "createdAt", "updatedAt" FROM "Investment";

DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateTable
CREATE TABLE "InvestmentLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0.00000000,
    "remainingQuantity" DECIMAL NOT NULL DEFAULT 0.00000000,
    "costPerUnit" DECIMAL NOT NULL DEFAULT 0.00,
    "totalCost" DECIMAL NOT NULL DEFAULT 0.00,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentLot_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantity" DECIMAL DEFAULT 0.00000000,
    "pricePerUnit" DECIMAL DEFAULT 0.00,
    "amount" DECIMAL NOT NULL DEFAULT 0.00,
    "costBasis" DECIMAL DEFAULT 0.00,
    "gainOrLoss" DECIMAL DEFAULT 0.00,
    "journalId" TEXT,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentFinancialEvent_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentFinancialEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentFinancialEvent_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestmentLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentLifecycleHistory_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentFinancialEvent_idempotencyKey_key" ON "InvestmentFinancialEvent"("idempotencyKey");
CREATE INDEX "InvestmentLot_investmentId_idx" ON "InvestmentLot"("investmentId");
CREATE INDEX "InvestmentFinancialEvent_investmentId_idx" ON "InvestmentFinancialEvent"("investmentId");
CREATE INDEX "InvestmentFinancialEvent_householdId_idx" ON "InvestmentFinancialEvent"("householdId");
CREATE INDEX "InvestmentLifecycleHistory_investmentId_idx" ON "InvestmentLifecycleHistory"("investmentId");
