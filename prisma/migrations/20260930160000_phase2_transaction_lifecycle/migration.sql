-- AlterTable: Add Transaction lifecycle fields
ALTER TABLE "Transaction" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "Transaction" ADD COLUMN "postedAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "reconciledAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "archivedByUserId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "replacementTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_replacementTransactionId_key" ON "Transaction"("replacementTransactionId");

-- CreateTable: TransactionLifecycleHistory
CREATE TABLE "TransactionLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionLifecycleHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TransactionLifecycleHistory_transactionId_idx" ON "TransactionLifecycleHistory"("transactionId");
