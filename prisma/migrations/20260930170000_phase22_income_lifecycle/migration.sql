-- AlterTable: Add IncomeOccurrence lifecycle fields
ALTER TABLE "IncomeOccurrence" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "creditedAt" DATETIME;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "reconciledAt" DATETIME;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "archivedByUserId" TEXT;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "journalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeOccurrence_journalId_key" ON "IncomeOccurrence"("journalId");

-- CreateTable: IncomeLifecycleHistory
CREATE TABLE "IncomeLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeOccurrenceId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomeLifecycleHistory_incomeOccurrenceId_fkey" FOREIGN KEY ("incomeOccurrenceId") REFERENCES "IncomeOccurrence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IncomeLifecycleHistory_incomeOccurrenceId_idx" ON "IncomeLifecycleHistory"("incomeOccurrenceId");
