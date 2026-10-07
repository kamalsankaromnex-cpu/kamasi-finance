import { Prisma } from "@prisma/client";

export class InvestmentCostBasisService {
  /**
   * Calculates weighted average cost per unit: totalCostBasis / totalQuantity.
   */
  static calculateWeightedAverageCost(
    totalCostBasis: Prisma.Decimal,
    totalQuantity: Prisma.Decimal
  ): Prisma.Decimal {
    if (totalQuantity.lte(0)) {
      return new Prisma.Decimal(0);
    }
    return totalCostBasis.div(totalQuantity);
  }

  /**
   * Calculates cost basis for sold units: quantityToSell * weightedAverageCost.
   */
  static calculateCostBasisForSale(
    quantityToSell: Prisma.Decimal,
    weightedAverageCost: Prisma.Decimal
  ): Prisma.Decimal {
    return quantityToSell.mul(weightedAverageCost);
  }

  /**
   * Calculates realized gain or loss: proceeds - costBasisSold.
   */
  static calculateRealizedGainLoss(
    proceeds: Prisma.Decimal,
    costBasisSold: Prisma.Decimal
  ): Prisma.Decimal {
    return proceeds.sub(costBasisSold);
  }

  /**
   * Validates that requested sell quantity does not exceed available holding quantity.
   */
  static validateQuantity(
    requestedQuantity: Prisma.Decimal,
    availableQuantity: Prisma.Decimal
  ): void {
    if (requestedQuantity.lte(0)) {
      throw new Error("INVALID_QUANTITY: Requested quantity must be positive.");
    }
    if (requestedQuantity.gt(availableQuantity)) {
      throw new Error(
        `INVALID_QUANTITY: Cannot sell ${requestedQuantity} units; currently holding only ${availableQuantity} units.`
      );
    }
  }

  /**
   * Computes updated quantity, cost basis, and weighted average cost for a purchase.
   */
  static applyPurchase(params: {
    currentQuantity: Prisma.Decimal;
    currentCostBasis: Prisma.Decimal;
    purchaseQuantity: Prisma.Decimal;
    purchasePricePerUnit: Prisma.Decimal;
  }) {
    const purchaseCost = params.purchaseQuantity.mul(params.purchasePricePerUnit);
    const newQuantity = params.currentQuantity.add(params.purchaseQuantity);
    const newCostBasis = params.currentCostBasis.add(purchaseCost);
    const newWeightedAverageCost = this.calculateWeightedAverageCost(newCostBasis, newQuantity);

    return {
      purchaseCost,
      newQuantity,
      newCostBasis,
      newWeightedAverageCost,
    };
  }

  /**
   * Computes cost basis sold, proceeds, realized gain/loss, and updated holding metrics for a sale.
   */
  static applySale(params: {
    currentQuantity: Prisma.Decimal;
    currentWeightedAverageCost: Prisma.Decimal;
    sellQuantity: Prisma.Decimal;
    sellPricePerUnit: Prisma.Decimal;
  }) {
    this.validateQuantity(params.sellQuantity, params.currentQuantity);

    const costBasisSold = this.calculateCostBasisForSale(params.sellQuantity, params.currentWeightedAverageCost);
    const proceeds = params.sellQuantity.mul(params.sellPricePerUnit);
    const realizedGainLoss = this.calculateRealizedGainLoss(proceeds, costBasisSold);

    const newQuantity = params.currentQuantity.sub(params.sellQuantity);
    const newCostBasis = newQuantity.mul(params.currentWeightedAverageCost);
    const newWeightedAverageCost = params.currentWeightedAverageCost; // Unchanged by sale

    return {
      costBasisSold,
      proceeds,
      realizedGainLoss,
      newQuantity,
      newCostBasis,
      newWeightedAverageCost,
    };
  }

  /**
   * Depletes investment lots in FIFO order to preserve lot quantity tracking and audit history.
   * Note: Realized gain/loss is calculated solely via Weighted Average Cost Basis.
   */
  static async reconcileLots(
    tx: Prisma.TransactionClient,
    investmentId: string,
    sellQuantity: Prisma.Decimal
  ): Promise<void> {
    let remainingToSell = sellQuantity;
    const activeLots = await tx.investmentLot.findMany({
      where: { investmentId, remainingQuantity: { gt: 0 } },
      orderBy: { purchaseDate: "asc" },
    });

    for (const lot of activeLots) {
      if (remainingToSell.isZero()) break;
      const deduct = Prisma.Decimal.min(remainingToSell, lot.remainingQuantity);
      await tx.investmentLot.update({
        where: { id: lot.id },
        data: { remainingQuantity: lot.remainingQuantity.sub(deduct) },
      });
      remainingToSell = remainingToSell.sub(deduct);
    }
  }
}
