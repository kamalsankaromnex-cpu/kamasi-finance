import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";

export interface ValuationInput {
  householdId: string;
  assetId: string;
  value: Prisma.Decimal;
  valuationDate?: Date;
  notes?: string;
}

export interface EMIPaymentInput {
  householdId: string;
  liabilityId: string;
  accountId: string;
  principalAmount: Prisma.Decimal;
  interestAmount: Prisma.Decimal;
  paymentDate?: Date;
  idempotencyKey?: string;
}

export class AssetLiabilityDomainService {
  /**
   * Record asset valuation adjustment strictly via FinancialCommand (non-cash event).
   */
  static async recordAssetValuation(tx: Prisma.TransactionClient, input: ValuationInput) {
    const asset = await tx.asset.findFirst({
      where: { id: input.assetId, householdId: input.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    const previousValue = asset.value;
    const delta = input.value.sub(previousValue);

    // 1. Post Non-Cash Valuation Adjustment via FinancialCommand if delta != 0
    if (!delta.isZero()) {
      await FinancialCommand.postAssetValuationAdjustment(tx, {
        householdId: input.householdId,
        assetName: asset.name,
        deltaAmount: delta,
      });
    }

    // 2. Create Valuation history entry
    const valuation = await tx.assetValuation.create({
      data: {
        assetId: input.assetId,
        value: input.value,
        valuationDate: input.valuationDate || new Date(),
        notes: input.notes || null,
      },
    });

    // 3. Update Asset current value
    const updatedAsset = await tx.asset.update({
      where: { id: input.assetId },
      data: { value: input.value },
    });

    return { asset: updatedAsset, valuation };
  }

  /**
   * Process Loan EMI payment (Principal reduction + Interest expense split) strictly via FinancialCommand.
   */
  static async recordLiabilityEMIPayment(tx: Prisma.TransactionClient, input: EMIPaymentInput) {
    const liability = await tx.liability.findFirst({
      where: { id: input.liabilityId, householdId: input.householdId },
    });
    if (!liability) throw new Error("LIABILITY_NOT_FOUND");

    // 1. Single-path Financial Command execution (overdraft check, journal, and account balance update ONCE)
    await FinancialCommand.postLoanPayment(tx, {
      householdId: input.householdId,
      payingAccountId: input.accountId,
      liabilityName: liability.name,
      principalAmount: input.principalAmount,
      interestAmount: input.interestAmount,
      idempotencyKey: input.idempotencyKey,
    });

    // 2. Update Liability balance metrics
    const currentOutstanding = liability.outstandingAmount;
    const newOutstanding = currentOutstanding.sub(input.principalAmount);
    const finalOutstanding = newOutstanding.lt(0) ? new Prisma.Decimal(0) : newOutstanding;
    const newStatus = finalOutstanding.isZero() ? "SETTLED" : "PARTIALLY_SETTLED";

    const updatedLiability = await tx.liability.update({
      where: { id: input.liabilityId },
      data: {
        outstandingAmount: finalOutstanding,
        status: newStatus,
      },
    });

    return updatedLiability;
  }
}
