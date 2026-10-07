-- AlterTable
ALTER TABLE "IncomeOccurrence" ADD COLUMN "grossAmount" DECIMAL DEFAULT 0.00;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "deductionsAmount" DECIMAL DEFAULT 0.00;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "taxWithheld" DECIMAL DEFAULT 0.00;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "netAmount" DECIMAL DEFAULT 0.00;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "cancelledReason" TEXT;
ALTER TABLE "IncomeOccurrence" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeOccurrence_idempotencyKey_key" ON "IncomeOccurrence"("idempotencyKey");
