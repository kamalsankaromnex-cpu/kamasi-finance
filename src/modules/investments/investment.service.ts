import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { LedgerService } from "@/finance/ledger.service";
import { InvestmentLifecycle, InvestmentStatus } from "@/finance/lifecycle/investment-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";
import { InvestmentCostBasisService } from "@/finance/investment-cost-basis.service";
import { validateClassificationCombination } from "@/lib/services/classification-service";

export interface CreateDraftInvestmentInput {
  householdId: string;
  userId?: string | null;
  name: string;
  category?: string;
  type?: string;
  symbol?: string | null;
  currency?: string;
  description?: string | null;
  scopeId?: string | null;
  investmentAccountId?: string | null;
  notes?: string | null;
}

export class InvestmentDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Investment lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.investmentLifecycleHistory.create({
      data: {
        investmentId: params.investmentId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        action: params.action,
        reason: params.reason || null,
        performedBy: params.performedBy || null,
      },
    });

    const auditActionMap: Record<string, AuditActionType> = {
      CREATE: "CREATE",
      UPDATE: "UPDATE",
      BUY: "BUY",
      SELL: "SELL",
      DIVIDEND: "DIVIDEND",
      INTEREST: "INTEREST",
      FEE: "FEE",
      REVALUE: "REVALUE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
      REVERSE: "REVERSE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "INVESTMENT",
      entityId: params.investmentId,
      action: mappedAction,
      fromState: params.fromStatus,
      toState: params.toStatus,
      actorUserId: params.performedBy || "SYSTEM",
      reason: params.reason || null,
      metadata: params.metadata || null,
    });

    return history;
  }

  /**
   * Create an unposted DRAFT Investment position.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async createDraft(tx: Prisma.TransactionClient, input: CreateDraftInvestmentInput) {
    if (input.scopeId) {
      const classValidation = await validateClassificationCombination({
        householdId: input.householdId,
        scopeId: input.scopeId,
        isNewRecord: true,
      });
      if (!classValidation.valid) {
        throw new Error(`VALIDATION_ERROR: ${classValidation.error}`);
      }
    }

    const investment = await tx.investment.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        category: input.category || "MUTUAL_FUND",
        type: input.type || "MUTUAL_FUND",
        symbol: input.symbol || null,
        currency: input.currency || "INR",
        status: "DRAFT",
        description: input.description || null,
        scopeId: input.scopeId || null,
        totalQuantity: new Prisma.Decimal(0),
        totalCostBasis: new Prisma.Decimal(0),
        weightedAverageCost: new Prisma.Decimal(0),
        currentPricePerUnit: new Prisma.Decimal(0),
        currentMarketValue: new Prisma.Decimal(0),
        realizedGainLoss: new Prisma.Decimal(0),
        investmentAccountId: input.investmentAccountId || null,
        notes: input.notes || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      investmentId: investment.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE",
      performedBy: input.userId || null,
    });

    return investment;
  }

  /**
   * Update DRAFT, ACTIVE, or PARTIALLY_SOLD metadata.
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      data: Partial<CreateDraftInvestmentInput>;
    }
  ) {
    const existing = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!existing) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canEdit(existing.status as InvestmentStatus)) {
      throw new Error(`CANNOT_EDIT_INVESTMENT: Investment in ${existing.status} status cannot be edited.`);
    }

    if (params.data.scopeId) {
      const classValidation = await validateClassificationCombination({
        householdId: params.householdId,
        scopeId: params.data.scopeId,
        isNewRecord: false,
      });
      if (!classValidation.valid) {
        throw new Error(`VALIDATION_ERROR: ${classValidation.error}`);
      }
    }

    const updateData: Prisma.InvestmentUpdateInput = {};
    if (params.data.name !== undefined) updateData.name = params.data.name;
    if (params.data.category !== undefined) updateData.category = params.data.category;
    if (params.data.type !== undefined) updateData.type = params.data.type;
    if (params.data.symbol !== undefined) updateData.symbol = params.data.symbol;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;
    if (params.data.scopeId !== undefined) {
      updateData.scope = params.data.scopeId ? { connect: { id: params.data.scopeId } } : { disconnect: true };
    }

    const updated = await tx.investment.update({
      where: { id: existing.id },
      data: updateData,
    });

    await this.recordLifecycleHistory(tx, {
      investmentId: updated.id,
      householdId: params.householdId,
      fromStatus: existing.status,
      toStatus: updated.status,
      action: "UPDATE",
      performedBy: params.userId || null,
    });

    return updated;
  }

  /**
   * Buy / Invest Units: DRAFT -> ACTIVE or ACTIVE -> ACTIVE.
   * Updates totalQuantity, totalCostBasis, and weightedAverageCost.
   * Posts double-entry journal (Debit Investment Asset / Credit Bank).
   */
  static async buyInvestment(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      quantity: Prisma.Decimal;
      pricePerUnit: Prisma.Decimal;
      payingAccountId?: string | null;
      investmentAccountId?: string | null;
      effectiveDate?: Date;
      idempotencyKey?: string | null;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingEvent = await tx.investmentFinancialEvent.findFirst({
        where: {
          investmentId: params.investmentId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const investment = await tx.investment.findUniqueOrThrow({ where: { id: params.investmentId } });
        return { investment, financialEvent: existingEvent };
      }
    }

    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canBuy(investment.status as InvestmentStatus)) {
      throw new Error(`CANNOT_BUY_INVESTMENT: Investment in ${investment.status} status cannot accept buy orders.`);
    }

    if (params.quantity.lte(0) || params.pricePerUnit.lte(0)) {
      throw new Error("INVALID_AMOUNT: Investment quantity and price per unit must be positive.");
    }

    const totalBuyCost = params.quantity.mul(params.pricePerUnit);
    const invAccId = params.investmentAccountId || investment.investmentAccountId;

    // 2. Post Financial Command
    const journal = await FinancialCommand.postInvestmentBuy(tx, {
      householdId: params.householdId,
      investmentName: investment.name,
      totalCost: totalBuyCost,
      payingAccountId: params.payingAccountId || null,
      investmentAccountId: invAccId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 3. Create InvestmentLot for Lot Tracking
    const lot = await tx.investmentLot.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        quantity: params.quantity,
        remainingQuantity: params.quantity,
        costPerUnit: params.pricePerUnit,
        totalCost: totalBuyCost,
        purchaseDate: params.effectiveDate || new Date(),
      },
    });

    // 4. Compute updated Weighted Average metrics via InvestmentCostBasisService
    const purchaseResult = InvestmentCostBasisService.applyPurchase({
      currentQuantity: investment.totalQuantity,
      currentCostBasis: investment.totalCostBasis,
      purchaseQuantity: params.quantity,
      purchasePricePerUnit: params.pricePerUnit,
    });
    const newQuantity = purchaseResult.newQuantity;
    const newCostBasis = purchaseResult.newCostBasis;
    const newWeightedAvgCost = purchaseResult.newWeightedAverageCost;
    const newMarketVal = newQuantity.mul(params.pricePerUnit);

    const targetStatus: InvestmentStatus = "ACTIVE";
    InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, targetStatus, "buy");

    // 5. Create InvestmentFinancialEvent
    const financialEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: "BUY",
        quantity: params.quantity,
        pricePerUnit: params.pricePerUnit,
        amount: totalBuyCost,
        costBasis: totalBuyCost,
        gainOrLoss: new Prisma.Decimal(0),
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: `Bought ${params.quantity} units @ ${params.pricePerUnit}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 6. Update Investment
    const updatedInvestment = await tx.investment.update({
      where: { id: investment.id },
      data: {
        status: targetStatus,
        totalQuantity: newQuantity,
        totalCostBasis: newCostBasis,
        weightedAverageCost: newWeightedAvgCost,
        currentPricePerUnit: params.pricePerUnit,
        currentMarketValue: newMarketVal,
        investmentAccountId: invAccId || null,
      },
    });

    // 7. Audit Logging
    await this.recordLifecycleHistory(tx, {
      investmentId: updatedInvestment.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: targetStatus,
      action: "BUY",
      reason: `Purchased ${params.quantity} units for ${totalBuyCost}`,
      performedBy: params.userId || null,
    });

    return { investment: updatedInvestment, financialEvent, journal, lot };
  }

  /**
   * Sell Units: ACTIVE/PARTIALLY_SOLD -> PARTIALLY_SOLD or CLOSED.
   * Calculates costBasisSold = Q_sell * weightedAverageCost.
   * Calculates realizedGainLoss = proceeds - costBasisSold.
   * Depletes investment lots for tracking.
   * Posts double-entry journal with realized gain/loss accounts.
   */
  static async sellInvestment(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      quantity: Prisma.Decimal;
      pricePerUnit: Prisma.Decimal;
      receivingAccountId?: string | null;
      gainLossAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingEvent = await tx.investmentFinancialEvent.findFirst({
        where: {
          investmentId: params.investmentId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const investment = await tx.investment.findUniqueOrThrow({ where: { id: params.investmentId } });
        return { investment, financialEvent: existingEvent };
      }
    }

    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canSell(investment.status as InvestmentStatus)) {
      throw new Error(`CANNOT_SELL_INVESTMENT: Investment in ${investment.status} status cannot accept sell orders.`);
    }

    if (params.quantity.lte(0) || params.pricePerUnit.lt(0)) {
      throw new Error("INVALID_AMOUNT: Sell quantity must be positive and price per unit non-negative.");
    }

    // 2. Compute Cost Basis Sold using Weighted Average Cost via InvestmentCostBasisService
    const saleResult = InvestmentCostBasisService.applySale({
      currentQuantity: investment.totalQuantity,
      currentWeightedAverageCost: investment.weightedAverageCost,
      sellQuantity: params.quantity,
      sellPricePerUnit: params.pricePerUnit,
    });

    const costBasisSold = saleResult.costBasisSold;
    const proceeds = saleResult.proceeds;
    const eventGainLoss = saleResult.realizedGainLoss;

    // 3. Post Financial Command
    const journal = await FinancialCommand.postInvestmentSell(tx, {
      householdId: params.householdId,
      investmentName: investment.name,
      proceeds,
      costBasis: costBasisSold,
      receivingAccountId: params.receivingAccountId || null,
      investmentAccountId: investment.investmentAccountId,
      gainLossAccountId: params.gainLossAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 4. Deplete Investment Lots for Lot Tracking Reconciliation
    await InvestmentCostBasisService.reconcileLots(tx, investment.id, params.quantity);

    // 5. Update Investment metrics
    const newQuantity = saleResult.newQuantity;
    const newCostBasis = saleResult.newCostBasis;
    const newRealizedGainLoss = investment.realizedGainLoss.add(eventGainLoss);
    const newMarketValue = newQuantity.mul(params.pricePerUnit);

    const newStatus: InvestmentStatus = newQuantity.isZero() ? "CLOSED" : "PARTIALLY_SOLD";
    InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, newStatus, "sell");

    // 6. Create InvestmentFinancialEvent
    const financialEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: "SELL",
        quantity: params.quantity,
        pricePerUnit: params.pricePerUnit,
        amount: proceeds,
        costBasis: costBasisSold,
        gainOrLoss: eventGainLoss,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Sold ${params.quantity} units @ ${params.pricePerUnit}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 7. Update Investment
    const updatedInvestment = await tx.investment.update({
      where: { id: investment.id },
      data: {
        status: newStatus,
        totalQuantity: newQuantity,
        totalCostBasis: newCostBasis,
        realizedGainLoss: newRealizedGainLoss,
        currentPricePerUnit: params.pricePerUnit,
        currentMarketValue: newMarketValue,
        closedAt: newStatus === "CLOSED" ? (params.effectiveDate || new Date()) : investment.closedAt,
      },
    });

    // 8. Audit Logging
    await this.recordLifecycleHistory(tx, {
      investmentId: updatedInvestment.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: newStatus,
      action: "SELL",
      reason: params.reason || `Sold ${params.quantity} units for ${proceeds}. Realized gain/loss: ${eventGainLoss}`,
      performedBy: params.userId || null,
    });

    return { investment: updatedInvestment, financialEvent, journal };
  }

  /**
   * Record Dividend or Interest Income:
   * Does NOT alter totalQuantity, totalCostBasis, or weightedAverageCost.
   */
  static async recordIncome(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      incomeType: "DIVIDEND" | "INTEREST";
      amount: Prisma.Decimal;
      receivingAccountId?: string | null;
      incomeAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    if (params.idempotencyKey) {
      const existingEvent = await tx.investmentFinancialEvent.findFirst({
        where: {
          investmentId: params.investmentId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const investment = await tx.investment.findUniqueOrThrow({ where: { id: params.investmentId } });
        return { investment, financialEvent: existingEvent };
      }
    }

    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canRecordIncome(investment.status as InvestmentStatus)) {
      throw new Error(`CANNOT_RECORD_INCOME: Investment in status ${investment.status} cannot record income.`);
    }

    if (params.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Income amount must be positive.");
    }

    // 1. Post Financial Command
    const journal = await FinancialCommand.postInvestmentIncome(tx, {
      householdId: params.householdId,
      investmentName: investment.name,
      incomeType: params.incomeType,
      amount: params.amount,
      receivingAccountId: params.receivingAccountId || null,
      incomeAccountId: params.incomeAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 2. Create InvestmentFinancialEvent
    const financialEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: params.incomeType,
        amount: params.amount,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Recorded ${params.incomeType} income of ${params.amount}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Audit Logging (status and cost basis remain unchanged)
    await this.recordLifecycleHistory(tx, {
      investmentId: investment.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: investment.status,
      action: params.incomeType,
      reason: params.reason || `Received ${params.incomeType} ${params.amount}`,
      performedBy: params.userId || null,
    });

    return { investment, financialEvent, journal };
  }

  /**
   * Record Investment Fee Expense:
   * Does NOT alter totalQuantity or totalCostBasis.
   */
  static async recordFee(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      amount: Prisma.Decimal;
      payingAccountId?: string | null;
      feeAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    if (params.idempotencyKey) {
      const existingEvent = await tx.investmentFinancialEvent.findFirst({
        where: {
          investmentId: params.investmentId,
          householdId: params.householdId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      if (existingEvent) {
        const investment = await tx.investment.findUniqueOrThrow({ where: { id: params.investmentId } });
        return { investment, financialEvent: existingEvent };
      }
    }

    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canRecordFee(investment.status as InvestmentStatus)) {
      throw new Error(`CANNOT_RECORD_FEE: Investment in status ${investment.status} cannot record fees.`);
    }

    if (params.amount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Fee amount must be positive.");
    }

    // 1. Post Financial Command
    const journal = await FinancialCommand.postInvestmentFee(tx, {
      householdId: params.householdId,
      investmentName: investment.name,
      amount: params.amount,
      payingAccountId: params.payingAccountId || null,
      feeAccountId: params.feeAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 2. Create InvestmentFinancialEvent
    const financialEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: "FEE",
        amount: params.amount,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Paid investment fee of ${params.amount}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Audit Logging
    await this.recordLifecycleHistory(tx, {
      investmentId: investment.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: investment.status,
      action: "FEE",
      reason: params.reason || `Paid fee ${params.amount}`,
      performedBy: params.userId || null,
    });

    return { investment, financialEvent, journal };
  }

  /**
   * Revalue Investment Market Price:
   * Updates currentPricePerUnit and currentMarketValue.
   * MUST NOT alter totalCostBasis or realizedGainLoss.
   */
  static async revalueInvestment(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      userId?: string | null;
      currentPricePerUnit: Prisma.Decimal;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    if (!InvestmentLifecycle.canRevalue(investment.status as InvestmentStatus)) {
      throw new Error(`CANNOT_REVALUE_INVESTMENT: Investment in status ${investment.status} cannot be revalued.`);
    }

    if (params.currentPricePerUnit.lt(0)) {
      throw new Error("INVALID_AMOUNT: Price per unit cannot be negative.");
    }

    const newMarketVal = investment.totalQuantity.mul(params.currentPricePerUnit);
    const deltaMarketVal = newMarketVal.sub(investment.currentMarketValue);

    // 1. Post Financial Command for Portfolio Valuation Journal if delta != 0
    let journal = null;
    if (!deltaMarketVal.isZero()) {
      journal = await FinancialCommand.postInvestmentRevaluation(tx, {
        householdId: params.householdId,
        investmentName: investment.name,
        deltaMarketValue: deltaMarketVal,
        investmentAccountId: investment.investmentAccountId,
        idempotencyKey: params.idempotencyKey || null,
      });
    }

    // 2. Create InvestmentFinancialEvent
    const financialEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: "REVALUATION",
        pricePerUnit: params.currentPricePerUnit,
        amount: deltaMarketVal.abs(),
        journalId: journal ? journal.id : null,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Revalued price per unit to ${params.currentPricePerUnit}`,
        idempotencyKey: params.idempotencyKey || null,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Update Investment (totalCostBasis & realizedGainLoss remain UNCHANGED!)
    const updatedInvestment = await tx.investment.update({
      where: { id: investment.id },
      data: {
        currentPricePerUnit: params.currentPricePerUnit,
        currentMarketValue: newMarketVal,
      },
    });

    // 4. Audit Logging
    await this.recordLifecycleHistory(tx, {
      investmentId: updatedInvestment.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: investment.status,
      action: "REVALUE",
      reason: params.reason || `Revalued price to ${params.currentPricePerUnit}. Market value: ${newMarketVal}`,
      performedBy: params.userId || null,
    });

    return { investment: updatedInvestment, financialEvent, journal };
  }

  /**
   * Archive Investment: ACTIVE / PARTIALLY_SOLD / CLOSED -> ARCHIVED.
   */
  static async archiveInvestment(
    tx: Prisma.TransactionClient,
    params: { investmentId: string; householdId: string; userId?: string | null }
  ) {
    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, "ARCHIVED", "archive");

    const archived = await tx.investment.update({
      where: { id: investment.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      investmentId: archived.id,
      householdId: params.householdId,
      fromStatus: investment.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId || null,
    });

    return archived;
  }

  /**
   * Restore Investment: ARCHIVED -> Previous Valid Status.
   */
  static async restoreInvestment(
    tx: Prisma.TransactionClient,
    params: { investmentId: string; householdId: string; userId?: string | null }
  ) {
    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND");

    InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, "ACTIVE", "restore");

    let restoredStatus: InvestmentStatus = "ACTIVE";
    if (investment.totalQuantity.isZero()) {
      restoredStatus = "CLOSED";
    } else if (investment.closedAt) {
      restoredStatus = "CLOSED";
    }

    const restored = await tx.investment.update({
      where: { id: investment.id },
      data: {
        status: restoredStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      investmentId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: restoredStatus,
      action: "RESTORE",
      performedBy: params.userId || null,
    });

    return restored;
  }

  /**
   * Reverse Investment Financial Event:
   * Reverses BUY, SELL, DIVIDEND, INTEREST, FEE, or REVALUATION event atomically.
   * Posts compensating reversal journal through LedgerService.
   * Atomically restores Investment position and InvestmentLot state.
   * Prevents double-reversal and reversal of reversals.
   */
  static async reverseEvent(
    tx: Prisma.TransactionClient,
    params: {
      investmentId: string;
      householdId: string;
      eventId: string;
      userId?: string | null;
      reason?: string | null;
    }
  ) {
    const investment = await tx.investment.findFirst({
      where: { id: params.investmentId, householdId: params.householdId },
    });
    if (!investment) throw new Error("INVESTMENT_NOT_FOUND: Investment record does not exist.");

    const event = await tx.investmentFinancialEvent.findFirst({
      where: { id: params.eventId, investmentId: investment.id, householdId: params.householdId },
    });
    if (!event) throw new Error("EVENT_NOT_FOUND: Financial event does not exist for this investment.");

    if (event.isReversed) {
      throw new Error("EVENT_ALREADY_REVERSED: This financial event has already been reversed.");
    }

    if (event.eventType === "REVERSAL") {
      throw new Error("CANNOT_REVERSE_REVERSAL: A compensating reversal event cannot be reversed.");
    }

    // 1. Post compensating reversal journal if event has a linked journal
    if (event.journalId) {
      await LedgerService.reverseJournal(tx, event.journalId, params.householdId);
    }

    // 2. Mark original event reversed
    await tx.investmentFinancialEvent.update({
      where: { id: event.id },
      data: { isReversed: true },
    });

    // 3. Domain restoration based on eventType
    let updatedInvestment = investment;
    const now = new Date();

    if (event.eventType === "BUY") {
      const buyQty = event.quantity || new Prisma.Decimal(0);
      const buyAmount = event.amount;

      // Ensure current totalQuantity is at least buyQty (cannot reverse buy if units were sold)
      if (investment.totalQuantity.lt(buyQty)) {
        throw new Error(
          "BUY_REVERSAL_BLOCKED: Cannot reverse BUY event because holding units have already been sold. Reverse downstream sales first."
        );
      }

      // Check if lot exists for this buy
      const lot = await tx.investmentLot.findFirst({
        where: {
          investmentId: investment.id,
          costPerUnit: event.pricePerUnit || new Prisma.Decimal(0),
          remainingQuantity: { gte: buyQty },
        },
        orderBy: { purchaseDate: "desc" },
      });

      if (lot) {
        // Delete or deplete lot
        await tx.investmentLot.delete({ where: { id: lot.id } });
      }

      const restoredQty = investment.totalQuantity.sub(buyQty);
      const restoredCostBasis = investment.totalCostBasis.sub(buyAmount);
      const restoredWeightedAvg = restoredQty.gt(0) ? restoredCostBasis.div(restoredQty) : new Prisma.Decimal(0);
      const restoredMarketVal = restoredQty.mul(investment.currentPricePerUnit);

      let nextStatus: InvestmentStatus = "ACTIVE";
      if (restoredQty.isZero()) {
        nextStatus = "DRAFT";
      }

      InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, nextStatus, "reverse_buy");

      updatedInvestment = await tx.investment.update({
        where: { id: investment.id },
        data: {
          status: nextStatus,
          totalQuantity: restoredQty,
          totalCostBasis: restoredCostBasis,
          weightedAverageCost: restoredWeightedAvg,
          currentMarketValue: restoredMarketVal,
        },
      });

      await this.recordLifecycleHistory(tx, {
        investmentId: investment.id,
        householdId: params.householdId,
        fromStatus: investment.status,
        toStatus: nextStatus,
        action: "REVERSE",
        reason: params.reason || `Reversed BUY event ${event.id}`,
        performedBy: params.userId || null,
      });
    } else if (event.eventType === "SELL") {
      const soldQty = event.quantity || new Prisma.Decimal(0);
      const costBasisSold = event.costBasis || new Prisma.Decimal(0);
      const realizedGainLoss = event.gainOrLoss || new Prisma.Decimal(0);

      // Restore remaining lot quantities in reverse order (LIFO restore)
      let qtyToRestore = soldQty;
      const lots = await tx.investmentLot.findMany({
        where: { investmentId: investment.id },
        orderBy: { purchaseDate: "desc" },
      });

      for (const lot of lots) {
        if (qtyToRestore.isZero()) break;
        const availableLotCapacity = lot.quantity.sub(lot.remainingQuantity);
        if (availableLotCapacity.gt(0)) {
          const restoreAmount = Prisma.Decimal.min(qtyToRestore, availableLotCapacity);
          await tx.investmentLot.update({
            where: { id: lot.id },
            data: { remainingQuantity: lot.remainingQuantity.add(restoreAmount) },
          });
          qtyToRestore = qtyToRestore.sub(restoreAmount);
        }
      }

      const restoredQty = investment.totalQuantity.add(soldQty);
      const restoredCostBasis = investment.totalCostBasis.add(costBasisSold);
      const restoredRealizedGainLoss = investment.realizedGainLoss.sub(realizedGainLoss);
      const restoredMarketVal = restoredQty.mul(investment.currentPricePerUnit);

      let nextStatus: InvestmentStatus = "PARTIALLY_SOLD";
      // If all sold units restored match total lots, it returns to ACTIVE
      const activeLots = await tx.investmentLot.findMany({ where: { investmentId: investment.id } });
      const allFull = activeLots.every((l) => l.remainingQuantity.equals(l.quantity));
      if (allFull) {
        nextStatus = "ACTIVE";
      }

      InvestmentLifecycle.assertCanTransition(investment.status as InvestmentStatus, nextStatus, "reverse_sell");

      updatedInvestment = await tx.investment.update({
        where: { id: investment.id },
        data: {
          status: nextStatus,
          totalQuantity: restoredQty,
          totalCostBasis: restoredCostBasis,
          realizedGainLoss: restoredRealizedGainLoss,
          currentMarketValue: restoredMarketVal,
          closedAt: null,
        },
      });

      await this.recordLifecycleHistory(tx, {
        investmentId: investment.id,
        householdId: params.householdId,
        fromStatus: investment.status,
        toStatus: nextStatus,
        action: "REVERSE",
        reason: params.reason || `Reversed SELL event ${event.id}`,
        performedBy: params.userId || null,
      });
    } else if (event.eventType === "DIVIDEND" || event.eventType === "INTEREST" || event.eventType === "FEE") {
      // Income and fee reversals only reverse the journal; investment position metrics are unchanged
      await this.recordLifecycleHistory(tx, {
        investmentId: investment.id,
        householdId: params.householdId,
        fromStatus: investment.status,
        toStatus: investment.status,
        action: "REVERSE",
        reason: params.reason || `Reversed ${event.eventType} event ${event.id}`,
        performedBy: params.userId || null,
      });
    } else if (event.eventType === "REVALUATION") {
      // Find previous valid revaluation or buy price
      const prevEvents = await tx.investmentFinancialEvent.findMany({
        where: {
          investmentId: investment.id,
          id: { not: event.id },
          isReversed: false,
          eventType: { in: ["BUY", "REVALUATION"] },
        },
        orderBy: { effectiveDate: "desc" },
      });

      const fallbackPrice = prevEvents.length > 0 && prevEvents[0].pricePerUnit
        ? prevEvents[0].pricePerUnit
        : investment.weightedAverageCost;

      const restoredMarketVal = investment.totalQuantity.mul(fallbackPrice);

      updatedInvestment = await tx.investment.update({
        where: { id: investment.id },
        data: {
          currentPricePerUnit: fallbackPrice,
          currentMarketValue: restoredMarketVal,
        },
      });

      await this.recordLifecycleHistory(tx, {
        investmentId: investment.id,
        householdId: params.householdId,
        fromStatus: investment.status,
        toStatus: investment.status,
        action: "REVERSE",
        reason: params.reason || `Reversed REVALUATION event ${event.id}`,
        performedBy: params.userId || null,
      });
    }

    // 4. Create compensating REVERSAL event
    const reversalEvent = await tx.investmentFinancialEvent.create({
      data: {
        investmentId: investment.id,
        householdId: params.householdId,
        eventType: "REVERSAL",
        quantity: event.quantity ? event.quantity.negated() : null,
        pricePerUnit: event.pricePerUnit,
        amount: event.amount.negated(),
        costBasis: event.costBasis ? event.costBasis.negated() : null,
        gainOrLoss: event.gainOrLoss ? event.gainOrLoss.negated() : null,
        effectiveDate: now,
        reversalOfEventId: event.id,
        reason: params.reason || `Reversal of event ${event.id} (${event.eventType})`,
        createdByUserId: params.userId || null,
      },
    });

    return { investment: updatedInvestment, reversalEvent };
  }
}
