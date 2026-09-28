ALTER TABLE "Transaction" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "voidedByUserId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "refundedAmount" DECIMAL NOT NULL DEFAULT 0.00;
ALTER TABLE "Transaction" ADD COLUMN "refundOfId" TEXT REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Transaction_refundOfId_idx" ON "Transaction"("refundOfId");
