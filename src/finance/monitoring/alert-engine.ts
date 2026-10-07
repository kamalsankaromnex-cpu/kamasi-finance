import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logFinancialOperation, createCorrelationContext } from '@/lib/middleware/observability';

export type AlertSeverity = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';
export type AlertType =
  | 'BALANCE_DRIFT'
  | 'UNBALANCED_JOURNAL'
  | 'AUDIT_TAMPER'
  | 'TENANT_LEAK'
  | 'IDEMPOTENCY_ABUSE'
  | 'BACKUP_FAILURE'
  | 'MONITOR_STALE'
  | 'PERFORMANCE_DEGRADATION';

export interface RaiseAlertInput {
  fingerprint: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  householdId?: string;
  entityType?: string;
  entityId?: string;
  evidence?: Record<string, any>;
}

export class AlertEngine {
  /**
   * Raise or update a fingerprinted alert.
   * Deduplicates open/acknowledged alerts; updates message & timestamp if active, or reopens if resolved.
   */
  static async raiseAlert(
    db: PrismaClient | Prisma.TransactionClient,
    input: RaiseAlertInput
  ) {
    const existing = await db.alertEvent.findUnique({
      where: { fingerprint: input.fingerprint },
    });

    const evidenceJson = input.evidence ? JSON.stringify(input.evidence) : null;

    if (existing) {
      if (existing.status === 'OPEN' || existing.status === 'ACKNOWLEDGED') {
        // Deduplicated: Update existing active alert
        const updated = await db.alertEvent.update({
          where: { id: existing.id },
          data: {
            message: input.message,
            evidenceJson: evidenceJson || existing.evidenceJson,
            detectedAt: new Date(),
          },
        });
        return { alert: updated, deduplicated: true };
      } else {
        // Reopen previously resolved/suppressed alert
        const reopened = await db.alertEvent.update({
          where: { id: existing.id },
          data: {
            status: 'OPEN',
            severity: input.severity,
            message: input.message,
            evidenceJson,
            detectedAt: new Date(),
            resolvedAt: null,
          },
        });
        this.logAlertEvent(reopened, 'REOPENED');
        return { alert: reopened, deduplicated: false };
      }
    }

    // Create new AlertEvent
    const created = await db.alertEvent.create({
      data: {
        fingerprint: input.fingerprint,
        alertType: input.alertType,
        severity: input.severity,
        status: 'OPEN',
        householdId: input.householdId || null,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        message: input.message,
        evidenceJson,
        detectedAt: new Date(),
      },
    });

    this.logAlertEvent(created, 'CREATED');
    return { alert: created, deduplicated: false };
  }

  /**
   * Resolve an alert by fingerprint when invariant condition is restored to clean state.
   */
  static async resolveAlert(
    db: PrismaClient | Prisma.TransactionClient,
    fingerprint: string,
    resolutionReason?: string
  ) {
    const existing = await db.alertEvent.findUnique({
      where: { fingerprint },
    });

    if (existing && (existing.status === 'OPEN' || existing.status === 'ACKNOWLEDGED')) {
      const resolved = await db.alertEvent.update({
        where: { id: existing.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          message: resolutionReason
            ? `${existing.message} [RESOLVED: ${resolutionReason}]`
            : `${existing.message} [RESOLVED]`,
        },
      });
      this.logAlertEvent(resolved, 'RESOLVED');
      return resolved;
    }

    return null;
  }

  /**
   * Fetch all open or acknowledged alerts.
   */
  static async getActiveAlerts(
    db: PrismaClient | Prisma.TransactionClient = prisma,
    householdId?: string
  ) {
    return db.alertEvent.findMany({
      where: {
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        ...(householdId ? { householdId } : {}),
      },
      orderBy: { detectedAt: 'desc' },
    });
  }

  /**
   * Helper to emit structured JSON logs for alert events.
   */
  private static logAlertEvent(alert: any, eventAction: string) {
    const context = createCorrelationContext(`ALERT_${alert.alertType}_${eventAction}`, {
      householdId: alert.householdId || undefined,
      entityId: alert.entityId || alert.id,
      result: alert.severity === 'P0_CRITICAL' ? 'FAILURE' : 'SUCCESS',
    });

    logFinancialOperation(context, {
      alertId: alert.id,
      fingerprint: alert.fingerprint,
      alertType: alert.alertType,
      severity: alert.severity,
      status: alert.status,
      message: alert.message,
    });
  }
}
