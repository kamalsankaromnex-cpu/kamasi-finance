-- CreateTable
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "horizonMonths" INTEGER NOT NULL DEFAULT 12,
    "assumptionsVersion" INTEGER NOT NULL DEFAULT 1,
    "resultJson" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForecastSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForecastSnapshot_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ForecastScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ForecastScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Baseline 2026-2050',
    "type" TEXT NOT NULL DEFAULT 'BASELINE',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "startYear" INTEGER NOT NULL DEFAULT 2026,
    "endYear" INTEGER NOT NULL DEFAULT 2050,
    "horizonMonths" INTEGER NOT NULL DEFAULT 12,
    "incomeGrowthRate" DECIMAL NOT NULL DEFAULT 5.00,
    "expenseInflationRate" DECIMAL NOT NULL DEFAULT 6.00,
    "investmentReturnRate" DECIMAL NOT NULL DEFAULT 10.00,
    "assetGrowthRate" DECIMAL NOT NULL DEFAULT 5.00,
    "assumptionsVersion" INTEGER NOT NULL DEFAULT 1,
    "inflationRate" DECIMAL NOT NULL DEFAULT 6.00,
    "salaryGrowthRate" DECIMAL NOT NULL DEFAULT 8.00,
    "retirementAge" INTEGER NOT NULL DEFAULT 60,
    "baselineMonthlySavings" DECIMAL NOT NULL DEFAULT 50000.00,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForecastScenario_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ForecastScenario" ("baselineMonthlySavings", "createdAt", "endYear", "householdId", "id", "inflationRate", "investmentReturnRate", "isDefault", "name", "notes", "retirementAge", "salaryGrowthRate", "startYear", "updatedAt") SELECT "baselineMonthlySavings", "createdAt", "endYear", "householdId", "id", "inflationRate", "investmentReturnRate", "isDefault", "name", "notes", "retirementAge", "salaryGrowthRate", "startYear", "updatedAt" FROM "ForecastScenario";
DROP TABLE "ForecastScenario";
ALTER TABLE "new_ForecastScenario" RENAME TO "ForecastScenario";
CREATE TABLE "new_IncomeOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "expectedAmount" DECIMAL NOT NULL,
    "receivedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "outstandingAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL DEFAULT 0.00,
    "deductionsAmount" DECIMAL DEFAULT 0.00,
    "taxWithheld" DECIMAL DEFAULT 0.00,
    "netAmount" DECIMAL DEFAULT 0.00,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "confirmedAt" DATETIME,
    "creditedAt" DATETIME,
    "reconciledAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledReason" TEXT,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "idempotencyKey" TEXT,
    "journalId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeOccurrence_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeOccurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeOccurrence_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IncomeOccurrence" ("archivedAt", "archivedByUserId", "cancelledAt", "cancelledReason", "confirmedAt", "createdAt", "creditedAt", "deductionsAmount", "dueDate", "expectedAmount", "grossAmount", "householdId", "id", "idempotencyKey", "incomeSourceId", "journalId", "name", "netAmount", "notes", "outstandingAmount", "periodEnd", "periodStart", "receivedAmount", "reconciledAt", "status", "taxWithheld", "updatedAt") SELECT "archivedAt", "archivedByUserId", "cancelledAt", "cancelledReason", "confirmedAt", "createdAt", "creditedAt", "deductionsAmount", "dueDate", "expectedAmount", "grossAmount", "householdId", "id", "idempotencyKey", "incomeSourceId", "journalId", "name", "netAmount", "notes", "outstandingAmount", "periodEnd", "periodStart", "receivedAmount", "reconciledAt", "status", "taxWithheld", "updatedAt" FROM "IncomeOccurrence";
DROP TABLE "IncomeOccurrence";
ALTER TABLE "new_IncomeOccurrence" RENAME TO "IncomeOccurrence";
CREATE UNIQUE INDEX "IncomeOccurrence_idempotencyKey_key" ON "IncomeOccurrence"("idempotencyKey");
CREATE UNIQUE INDEX "IncomeOccurrence_journalId_key" ON "IncomeOccurrence"("journalId");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "userId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "transferAccountId" TEXT,
    "incomeSourceId" TEXT,
    "occurrenceId" TEXT,
    "paymentMethod" TEXT,
    "referenceNo" TEXT,
    "idempotencyKey" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedByUserId" TEXT,
    "refundedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "refundOfId" TEXT,
    "merchant" TEXT,
    "receiptUrl" TEXT,
    "splitsJson" TEXT,
    "reimbursementStatus" TEXT DEFAULT 'NONE',
    "reimbursedAmount" DECIMAL NOT NULL DEFAULT 0.00,
    "recurringRuleId" TEXT,
    "recurringOccurrenceId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "postedAt" DATETIME,
    "reconciledAt" DATETIME,
    "reversedAt" DATETIME,
    "archivedAt" DATETIME,
    "archivedByUserId" TEXT,
    "replacementTransactionId" TEXT,
    "journalId" TEXT,
    CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_transferAccountId_fkey" FOREIGN KEY ("transferAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "IncomeOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringOccurrenceId_fkey" FOREIGN KEY ("recurringOccurrenceId") REFERENCES "RecurringBillOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_replacementTransactionId_fkey" FOREIGN KEY ("replacementTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "archivedAt", "archivedByUserId", "categoryId", "createdAt", "date", "description", "householdId", "id", "idempotencyKey", "incomeSourceId", "isRecurring", "isVoided", "journalId", "merchant", "notes", "occurrenceId", "paymentMethod", "postedAt", "receiptUrl", "reconciledAt", "recurringOccurrenceId", "recurringRuleId", "referenceNo", "refundOfId", "refundedAmount", "reimbursedAmount", "reimbursementStatus", "replacementTransactionId", "reversedAt", "splitsJson", "status", "tags", "transferAccountId", "type", "updatedAt", "userId", "voidedAt", "voidedByUserId") SELECT "accountId", "amount", "archivedAt", "archivedByUserId", "categoryId", "createdAt", "date", "description", "householdId", "id", "idempotencyKey", "incomeSourceId", "isRecurring", "isVoided", "journalId", "merchant", "notes", "occurrenceId", "paymentMethod", "postedAt", "receiptUrl", "reconciledAt", "recurringOccurrenceId", "recurringRuleId", "referenceNo", "refundOfId", "refundedAmount", "reimbursedAmount", "reimbursementStatus", "replacementTransactionId", "reversedAt", "splitsJson", "status", "tags", "transferAccountId", "type", "updatedAt", "userId", "voidedAt", "voidedByUserId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");
CREATE UNIQUE INDEX "Transaction_replacementTransactionId_key" ON "Transaction"("replacementTransactionId");
CREATE UNIQUE INDEX "Transaction_journalId_key" ON "Transaction"("journalId");
CREATE INDEX "Transaction_refundOfId_idx" ON "Transaction"("refundOfId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSnapshot_calculationId_key" ON "ForecastSnapshot"("calculationId");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_householdId_scenarioId_idx" ON "ForecastSnapshot"("householdId", "scenarioId");
