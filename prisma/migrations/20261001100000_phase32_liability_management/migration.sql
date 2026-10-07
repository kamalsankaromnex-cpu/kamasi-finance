-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Liability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "outstandingAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestRate" DECIMAL NOT NULL DEFAULT 0.00,
    "startDate" DATETIME,
    "dueDate" DATETIME,
    "lender" TEXT,
    "notes" TEXT,
    "liabilityAccountId" TEXT,
    "borrowJournalId" TEXT,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liability_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Liability_liabilityAccountId_fkey" FOREIGN KEY ("liabilityAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Liability_borrowJournalId_fkey" FOREIGN KEY ("borrowJournalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Liability" ("id", "householdId", "name", "type", "principalAmount", "outstandingAmount", "interestRate", "startDate", "dueDate", "notes", "createdAt", "updatedAt")
SELECT "id", "householdId", "name", "type", COALESCE("amount", 0.00), COALESCE("outstandingPrincipal", "amount", 0.00), COALESCE("interestRate", 0.00), "startDate", "dueDate", "notes", "createdAt", "updatedAt" FROM "Liability";

DROP TABLE "Liability";
ALTER TABLE "new_Liability" RENAME TO "Liability";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateTable
CREATE TABLE "LiabilityFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "interestAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "journalId" TEXT,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiabilityFinancialEvent_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiabilityFinancialEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiabilityFinancialEvent_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiabilityLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liabilityId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiabilityLifecycleHistory_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "Liability" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityFinancialEvent_idempotencyKey_key" ON "LiabilityFinancialEvent"("idempotencyKey");
CREATE INDEX "LiabilityFinancialEvent_liabilityId_idx" ON "LiabilityFinancialEvent"("liabilityId");
CREATE INDEX "LiabilityFinancialEvent_householdId_idx" ON "LiabilityFinancialEvent"("householdId");
CREATE INDEX "LiabilityLifecycleHistory_liabilityId_idx" ON "LiabilityLifecycleHistory"("liabilityId");
