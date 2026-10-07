-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "initialValue" DECIMAL NOT NULL DEFAULT 0.00,
    "currentValue" DECIMAL NOT NULL DEFAULT 0.00,
    "value" DECIMAL NOT NULL DEFAULT 0.00,
    "purchaseDate" DATETIME,
    "acquisitionDate" DATETIME,
    "disposedAt" DATETIME,
    "disposalProceeds" DECIMAL,
    "notes" TEXT,
    "assetAccountId" TEXT,
    "acquisitionJournalId" TEXT,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_acquisitionJournalId_fkey" FOREIGN KEY ("acquisitionJournalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Asset" ("id", "householdId", "name", "type", "value", "purchaseDate", "notes", "createdAt", "updatedAt", "initialValue", "currentValue")
SELECT "id", "householdId", "name", "type", "value", "purchaseDate", "notes", "createdAt", "updatedAt", "value", "value" FROM "Asset";

DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateTable
CREATE TABLE "AssetFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0.00,
    "gainOrLoss" DECIMAL DEFAULT 0.00,
    "journalId" TEXT,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetFinancialEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetFinancialEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetFinancialEvent_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetLifecycleHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
