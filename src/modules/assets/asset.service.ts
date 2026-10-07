import { Prisma } from "@prisma/client";
import { FinancialCommand } from "@/finance/financial-command";
import { AssetLifecycle, AssetStatus } from "@/finance/lifecycle/asset-lifecycle";
import { AuditService, AuditActionType } from "@/finance/audit/audit.service";

export interface CreateDraftAssetInput {
  householdId: string;
  userId?: string | null;
  name: string;
  category?: string;
  description?: string | null;
  initialValue?: Prisma.Decimal;
  assetAccountId?: string | null;
  notes?: string | null;
}

export class AssetDomainService {
  /**
   * Helper to record audit history and central AuditEvent for Asset lifecycle transitions.
   */
  static async recordLifecycleHistory(
    tx: Prisma.TransactionClient,
    params: {
      assetId: string;
      householdId: string;
      fromStatus: string;
      toStatus: string;
      action: string;
      reason?: string | null;
      performedBy?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    const history = await tx.assetLifecycleHistory.create({
      data: {
        assetId: params.assetId,
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
      ACQUIRE: "ACQUIRE",
      REVALUE: "REVALUE",
      DISPOSE: "DISPOSE",
      ARCHIVE: "ARCHIVE",
      RESTORE: "RESTORE",
    };
    const mappedAction = auditActionMap[params.action] || "UPDATE";

    await AuditService.record(tx, {
      householdId: params.householdId,
      entityType: "ASSET",
      entityId: params.assetId,
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
   * Create an unposted DRAFT Asset.
   * Account.balance remains UNCHANGED (0 ledger activity).
   */
  static async createDraft(tx: Prisma.TransactionClient, input: CreateDraftAssetInput) {
    const initialVal = input.initialValue || new Prisma.Decimal(0);

    const asset = await tx.asset.create({
      data: {
        householdId: input.householdId,
        name: input.name,
        category: input.category || "OTHER",
        status: "DRAFT",
        description: input.description || null,
        initialValue: initialVal,
        currentValue: initialVal,
        value: initialVal,
        assetAccountId: input.assetAccountId || null,
        notes: input.notes || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      assetId: asset.id,
      householdId: input.householdId,
      fromStatus: "NONE",
      toStatus: "DRAFT",
      action: "CREATE",
      performedBy: input.userId || null,
    });

    return asset;
  }

  /**
   * Update DRAFT or ACTIVE asset metadata.
   */
  static async updateDraft(
    tx: Prisma.TransactionClient,
    params: {
      assetId: string;
      householdId: string;
      userId?: string | null;
      data: Partial<CreateDraftAssetInput>;
    }
  ) {
    const existing = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!existing) throw new Error("ASSET_NOT_FOUND");

    if (!AssetLifecycle.canEdit(existing.status as AssetStatus)) {
      throw new Error(`CANNOT_EDIT_ASSET: Asset in ${existing.status} status cannot be edited.`);
    }

    const updateData: Prisma.AssetUpdateInput = {};
    if (params.data.name !== undefined) updateData.name = params.data.name;
    if (params.data.category !== undefined) updateData.category = params.data.category;
    if (params.data.description !== undefined) updateData.description = params.data.description;
    if (params.data.notes !== undefined) updateData.notes = params.data.notes;

    const updated = await tx.asset.update({
      where: { id: existing.id },
      data: updateData,
    });

    await this.recordLifecycleHistory(tx, {
      assetId: updated.id,
      householdId: params.householdId,
      fromStatus: existing.status,
      toStatus: updated.status,
      action: "UPDATE",
      performedBy: params.userId || null,
    });

    return updated;
  }

  /**
   * Acquire Asset: Transition DRAFT -> ACTIVE.
   * Posts double-entry journal via FinancialCommand.postAssetAcquisition.
   * Debits Asset Account / Credits Payment Account.
   */
  static async acquireAsset(
    tx: Prisma.TransactionClient,
    params: {
      assetId: string;
      householdId: string;
      userId?: string | null;
      amount?: Prisma.Decimal;
      payingAccountId?: string | null;
      assetAccountId?: string | null;
      acquisitionDate?: Date;
      idempotencyKey?: string | null;
    }
  ) {
    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const existingEvent = await tx.assetFinancialEvent.findFirst({
        where: {
          assetId: params.assetId,
          householdId: params.householdId,
          eventType: "ACQUISITION",
        },
      });
      if (existingEvent) {
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: params.assetId } });
        return { asset, financialEvent: existingEvent };
      }
    }

    const asset = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    AssetLifecycle.assertCanTransition(asset.status as AssetStatus, "ACTIVE", "acquire");

    const acqAmount = params.amount || asset.initialValue;
    if (acqAmount.lte(0)) {
      throw new Error("INVALID_AMOUNT: Asset acquisition amount must be positive");
    }

    const assetAccId = params.assetAccountId || asset.assetAccountId;

    // 2. Post Financial Command
    const journal = await FinancialCommand.postAssetAcquisition(tx, {
      householdId: params.householdId,
      assetName: asset.name,
      amount: acqAmount,
      payingAccountId: params.payingAccountId || null,
      assetAccountId: assetAccId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 3. Create AssetFinancialEvent Record
    const financialEvent = await tx.assetFinancialEvent.create({
      data: {
        assetId: asset.id,
        householdId: params.householdId,
        eventType: "ACQUISITION",
        amount: acqAmount,
        journalId: journal.id,
        effectiveDate: params.acquisitionDate || new Date(),
        reason: `Acquired asset ${asset.name}`,
        createdByUserId: params.userId || null,
      },
    });

    // 4. Update Asset to ACTIVE
    const updatedAsset = await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: "ACTIVE",
        initialValue: acqAmount,
        currentValue: acqAmount,
        value: acqAmount,
        acquisitionDate: params.acquisitionDate || new Date(),
        assetAccountId: assetAccId || null,
        acquisitionJournalId: journal.id,
      },
    });

    // 5. Audit Logging
    await this.recordLifecycleHistory(tx, {
      assetId: updatedAsset.id,
      householdId: params.householdId,
      fromStatus: asset.status,
      toStatus: "ACTIVE",
      action: "ACQUIRE",
      reason: `Acquired for ${acqAmount}`,
      performedBy: params.userId || null,
    });

    return { asset: updatedAsset, financialEvent, journal };
  }

  /**
   * Revalue Asset: Updates currentValue on ACTIVE asset.
   * Posts double-entry journal via FinancialCommand.postAssetRevaluation.
   * Computes delta = newValue - currentValue.
   */
  static async revalueAsset(
    tx: Prisma.TransactionClient,
    params: {
      assetId: string;
      householdId: string;
      userId?: string | null;
      newValue: Prisma.Decimal;
      adjustmentAccountId?: string | null;
      reason?: string | null;
      effectiveDate?: Date;
      idempotencyKey?: string | null;
    }
  ) {
    const asset = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    AssetLifecycle.assertCanTransition(asset.status as AssetStatus, "ACTIVE", "revalue");

    if (params.newValue.lt(0)) {
      throw new Error("INVALID_AMOUNT: Asset revalued amount cannot be negative");
    }

    const deltaAmount = params.newValue.sub(asset.currentValue);
    if (deltaAmount.equals(0)) {
      return { asset, financialEvent: null, journal: null };
    }

    // 1. Post Financial Command
    const journal = await FinancialCommand.postAssetRevaluation(tx, {
      householdId: params.householdId,
      assetName: asset.name,
      deltaAmount,
      assetAccountId: asset.assetAccountId,
      adjustmentAccountId: params.adjustmentAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    const isAppreciation = deltaAmount.gt(0);
    const eventType = isAppreciation ? "REVALUATION" : "DEPRECIATION";

    // 2. Create AssetFinancialEvent
    const financialEvent = await tx.assetFinancialEvent.create({
      data: {
        assetId: asset.id,
        householdId: params.householdId,
        eventType,
        amount: deltaAmount.abs(),
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Asset ${isAppreciation ? 'appreciation' : 'depreciation'} of ${deltaAmount.abs()}`,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Update Asset currentValue
    const updatedAsset = await tx.asset.update({
      where: { id: asset.id },
      data: {
        currentValue: params.newValue,
        value: params.newValue,
      },
    });

    // 4. Audit Logging
    await this.recordLifecycleHistory(tx, {
      assetId: updatedAsset.id,
      householdId: params.householdId,
      fromStatus: asset.status,
      toStatus: "ACTIVE",
      action: "REVALUE",
      reason: params.reason || `Revalued from ${asset.currentValue} to ${params.newValue}`,
      performedBy: params.userId || null,
    });

    return { asset: updatedAsset, financialEvent, journal };
  }

  /**
   * Dispose Asset: Transition ACTIVE -> DISPOSED.
   * Posts double-entry journal via FinancialCommand.postAssetDisposal.
   * Calculates GainOrLoss = Disposal Proceeds - Carrying Value.
   */
  static async disposeAsset(
    tx: Prisma.TransactionClient,
    params: {
      assetId: string;
      householdId: string;
      userId?: string | null;
      proceeds: Prisma.Decimal;
      receivingAccountId?: string | null;
      adjustmentAccountId?: string | null;
      effectiveDate?: Date;
      reason?: string | null;
      idempotencyKey?: string | null;
    }
  ) {
    const asset = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    AssetLifecycle.assertCanTransition(asset.status as AssetStatus, "DISPOSED", "dispose");

    if (params.proceeds.lt(0)) {
      throw new Error("INVALID_AMOUNT: Asset disposal proceeds cannot be negative");
    }

    const carryingValue = asset.currentValue;
    const gainOrLoss = params.proceeds.sub(carryingValue);

    // 1. Post Financial Command
    const journal = await FinancialCommand.postAssetDisposal(tx, {
      householdId: params.householdId,
      assetName: asset.name,
      carryingValue,
      proceeds: params.proceeds,
      receivingAccountId: params.receivingAccountId || null,
      assetAccountId: asset.assetAccountId || null,
      adjustmentAccountId: params.adjustmentAccountId || null,
      idempotencyKey: params.idempotencyKey || null,
    });

    // 2. Create AssetFinancialEvent Record
    const financialEvent = await tx.assetFinancialEvent.create({
      data: {
        assetId: asset.id,
        householdId: params.householdId,
        eventType: "DISPOSAL",
        amount: params.proceeds,
        gainOrLoss,
        journalId: journal.id,
        effectiveDate: params.effectiveDate || new Date(),
        reason: params.reason || `Disposed for ${params.proceeds}`,
        createdByUserId: params.userId || null,
      },
    });

    // 3. Update Asset Status to DISPOSED
    const updatedAsset = await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: "DISPOSED",
        disposedAt: params.effectiveDate || new Date(),
        disposalProceeds: params.proceeds,
        currentValue: new Prisma.Decimal(0),
        value: new Prisma.Decimal(0),
      },
    });

    // 4. Audit Logging
    await this.recordLifecycleHistory(tx, {
      assetId: updatedAsset.id,
      householdId: params.householdId,
      fromStatus: asset.status,
      toStatus: "DISPOSED",
      action: "DISPOSE",
      reason: params.reason || `Disposed. Proceeds: ${params.proceeds}, Gain/Loss: ${gainOrLoss}`,
      performedBy: params.userId || null,
    });

    return { asset: updatedAsset, financialEvent, journal };
  }

  /**
   * Archive Asset: ACTIVE / DISPOSED -> ARCHIVED.
   */
  static async archiveAsset(
    tx: Prisma.TransactionClient,
    params: { assetId: string; householdId: string; userId?: string | null }
  ) {
    const asset = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    AssetLifecycle.assertCanTransition(asset.status as AssetStatus, "ARCHIVED", "archive");

    const archived = await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedByUserId: params.userId || null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      assetId: archived.id,
      householdId: params.householdId,
      fromStatus: asset.status,
      toStatus: "ARCHIVED",
      action: "ARCHIVE",
      performedBy: params.userId || null,
    });

    return archived;
  }

  /**
   * Restore Asset: ARCHIVED -> Previous Valid Status.
   */
  static async restoreAsset(
    tx: Prisma.TransactionClient,
    params: { assetId: string; householdId: string; userId?: string | null }
  ) {
    const asset = await tx.asset.findFirst({
      where: { id: params.assetId, householdId: params.householdId },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");

    AssetLifecycle.assertCanTransition(asset.status as AssetStatus, "ACTIVE", "restore");

    const restoredStatus: AssetStatus = asset.disposedAt ? "DISPOSED" : "ACTIVE";

    const restored = await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: restoredStatus,
        archivedAt: null,
        archivedByUserId: null,
      },
    });

    await this.recordLifecycleHistory(tx, {
      assetId: restored.id,
      householdId: params.householdId,
      fromStatus: "ARCHIVED",
      toStatus: restoredStatus,
      action: "RESTORE",
      performedBy: params.userId || null,
    });

    return restored;
  }
}
