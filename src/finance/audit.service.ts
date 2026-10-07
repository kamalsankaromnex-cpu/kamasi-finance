import { Prisma } from "@prisma/client";

export interface AuditLogInput {
  householdId: string;
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "REVERSE" | "REFUND" | "ADJUST" | "RECONCILE" | "ARCHIVE" | "RESTORE";
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  reference?: string | null;
}

export class FinancialAuditService {
  /**
   * Record structured audit log for financial entity lifecycle mutations.
   */
  static async recordLog(tx: Prisma.TransactionClient, input: AuditLogInput) {
    const details = JSON.stringify({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      reference: input.reference || null,
      before: input.before || null,
      after: input.after || null,
    });

    return tx.automationExecutionLog.create({
      data: {
        householdId: input.householdId,
        triggerType: `AUDIT_${input.action}`,
        status: "SUCCESS",
        details,
        idempotencyKey: input.reference ? `audit-${input.action}-${input.entityId}-${Date.now()}` : null,
      },
    });
  }
}
