import { Prisma } from "@prisma/client";
import crypto from "crypto";

export type AuditEntityType =
  | "TRANSACTION"
  | "INCOME"
  | "INCOME_SOURCE"
  | "EXPENSE"
  | "REFUND"
  | "TRANSFER"
  | "GOAL"
  | "JOURNAL"
  | "ACCOUNT"
  | "HOUSEHOLD"
  | "USER"
  | "ASSET"
  | "LIABILITY"
  | "BORROWING"
  | "REPAYMENT_SCHEDULE"
  | "LENDER"
  | "INVESTMENT"
  | "BUDGET"
  | "PROJECT"
  | "PROJECT_PLAN"
  | "PROJECT_COST"
  | "PROJECT_PAYMENT"
  | "PROJECT_FUNDING"
  | "PROJECT_ALLOCATION"
  | "PROJECT_TASK"
  | "PROJECT_MILESTONE";

export type AuditActionType =
  | "CREATE"
  | "UPDATE"
  | "POST"
  | "CONFIRM"
  | "CREDIT"
  | "RECONCILE"
  | "CANCEL"
  | "REVERSE"
  | "REFUND"
  | "ARCHIVE"
  | "RESTORE"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "JOURNAL_POSTED"
  | "JOURNAL_REVERSED"
  | "TRANSFER_POSTED"
  | "CONTRIBUTION"
  | "WITHDRAWAL"
  | "ACQUIRE"
  | "REVALUE"
  | "DISPOSE"
  | "ASSET_ACQUISITION"
  | "ASSET_REVALUATION"
  | "ASSET_DISPOSAL"
  | "BORROW"
  | "DISBURSE"
  | "REPAYMENT"
  | "INTEREST_ACCRUED"
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "ACCESS_DENIED"
  | "AUTHORIZATION_FAILED"
  | "VALIDATION_FAILED"
  | "IDEMPOTENCY_REPLAY"
  | "CROSS_HOUSEHOLD_ACCESS_DENIED";

export interface RecordAuditInput {
  householdId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditActionType;
  fromState?: string | null;
  toState?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
}

export class AuditService {
  /**
   * Compute SHA-256 event hash for tamper-evident hash chain.
   */
  static computeEventHash(params: {
    previousHash: string | null;
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorUserId: string;
    createdAtIso: string;
    metadataJson: string | null;
  }): string {
    const raw = `${params.previousHash || "GENESIS"}|${params.id}|${params.action}|${params.entityType}|${params.entityId}|${params.actorUserId}|${params.createdAtIso}|${params.metadataJson || ""}`;
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Append a new AuditEvent record inside a Prisma transaction.
   * Atomically computes SHA-256 hash chained from the latest event in the household.
   */
  static async record(tx: Prisma.TransactionClient, input: RecordAuditInput) {
    const actorUserId = input.actorUserId || "SYSTEM";
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    // Get previous hash for this household
    const lastEvent = await tx.auditEvent.findFirst({
      where: { householdId: input.householdId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const previousHash = lastEvent ? lastEvent.eventHash : "GENESIS";

    const eventHash = this.computeEventHash({
      previousHash,
      id,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId,
      createdAtIso,
      metadataJson,
    });

    const event = await tx.auditEvent.create({
      data: {
        id,
        householdId: input.householdId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        fromState: input.fromState || null,
        toState: input.toState || null,
        actorUserId,
        reason: input.reason || null,
        metadataJson,
        previousHash,
        eventHash,
        createdAt,
      },
    });

    return event;
  }

  static async recordLifecycle(
    tx: Prisma.TransactionClient,
    input: {
      householdId: string;
      entityType: AuditEntityType;
      entityId: string;
      action: AuditActionType;
      fromState?: string | null;
      toState?: string | null;
      actorUserId?: string | null;
      reason?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    return this.record(tx, input);
  }

  static async recordFinancialEvent(
    tx: Prisma.TransactionClient,
    input: {
      householdId: string;
      entityType: AuditEntityType;
      entityId: string;
      action: AuditActionType;
      actorUserId?: string | null;
      reason?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    return this.record(tx, input);
  }

  static async recordSecurityEvent(
    tx: Prisma.TransactionClient,
    input: {
      householdId: string;
      entityType: AuditEntityType;
      entityId: string;
      action: "ACCESS_DENIED" | "AUTHORIZATION_FAILED" | "VALIDATION_FAILED" | "IDEMPOTENCY_REPLAY" | "CROSS_HOUSEHOLD_ACCESS_DENIED";
      actorUserId?: string | null;
      reason?: string | null;
      metadata?: Record<string, any> | null;
    }
  ) {
    return this.record(tx, input);
  }
}
