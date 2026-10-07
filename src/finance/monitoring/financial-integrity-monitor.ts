import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LedgerService } from '@/finance/ledger.service';
import { AuditIntegrityService } from '@/finance/audit/audit-integrity.service';
import { AlertEngine } from './alert-engine';

export interface IntegrityScanResult {
  scanTimestamp: string;
  checksCompleted: number;
  openAlertsCount: number;
  status: 'HEALTHY' | 'ALERT';
  details: {
    balanceDriftCount: number;
    unbalancedJournalsCount: number;
    auditChainFailuresCount: number;
    tenantLeaksCount: number;
    idempotencyAbuseCount: number;
  };
}

export class FinancialIntegrityMonitor {
  /**
   * Primary single-path production financial integrity scanner.
   * Scans all 6 financial invariants and updates AlertEngine & MonitorHeartbeat.
   */
  static async runFullIntegrityScan(
    db: PrismaClient | Prisma.TransactionClient = prisma
  ): Promise<IntegrityScanResult> {
    let balanceDriftCount = 0;
    let unbalancedJournalsCount = 0;
    let auditChainFailuresCount = 0;
    let tenantLeaksCount = 0;
    let idempotencyAbuseCount = 0;
    let checksCompleted = 0;

    // 1. Balance Drift Check (Account.balance === Ledger-derived balance)
    const accounts = await db.account.findMany({ where: { isArchived: false } });
    for (const acc of accounts) {
      const entries = await db.journalEntry.findMany({
        where: { accountId: acc.id, journal: { status: { in: ['POSTED', 'VOIDED'] } } },
        select: { debit: true, credit: true },
      });

      let calculatedBal = new Prisma.Decimal(0);
      for (const entry of entries) {
        const delta = LedgerService.getBalanceDelta(acc.type, entry.debit, entry.credit);
        calculatedBal = calculatedBal.add(delta);
      }

      if (entries.length > 0) {
        const diff = acc.balance.sub(calculatedBal).abs().toNumber();
        const fingerprint = `BALANCE_DRIFT:${acc.id}`;

        if (diff > 0.001) {
          balanceDriftCount++;
          await AlertEngine.raiseAlert(db, {
            fingerprint,
            alertType: 'BALANCE_DRIFT',
            severity: 'P0_CRITICAL',
            householdId: acc.householdId,
            entityType: 'Account',
            entityId: acc.id,
            message: `CRITICAL BALANCE DRIFT: Account ${acc.id} (${acc.name}) stored balance ₹${acc.balance} != calculated ledger balance ₹${calculatedBal} (diff ₹${diff})`,
            evidence: { storedBalance: acc.balance.toNumber(), calculatedBalance: calculatedBal.toNumber(), diff },
          });
        } else {
          await AlertEngine.resolveAlert(db, fingerprint, 'Account balance equals ledger calculation');
        }
      }
    }
    checksCompleted++;

    // 2. Unbalanced Journal Detection (Zero Tolerance: SUM(debits) === SUM(credits))
    const postedJournals = await db.journal.findMany({
      where: { status: 'POSTED' },
      include: { entries: true },
    });

    for (const j of postedJournals) {
      const debits = j.entries.reduce((sum, e) => sum.add(e.debit), new Prisma.Decimal(0));
      const credits = j.entries.reduce((sum, e) => sum.add(e.credit), new Prisma.Decimal(0));
      const fingerprint = `UNBALANCED_JOURNAL:${j.id}`;

      if (!debits.equals(credits)) {
        unbalancedJournalsCount++;
        await AlertEngine.raiseAlert(db, {
          fingerprint,
          alertType: 'UNBALANCED_JOURNAL',
          severity: 'P0_CRITICAL',
          householdId: j.householdId,
          entityType: 'Journal',
          entityId: j.id,
          message: `CRITICAL UNBALANCED JOURNAL: Journal ${j.id} has total debits ₹${debits} != credits ₹${credits}`,
          evidence: { totalDebits: debits.toNumber(), totalCredits: credits.toNumber() },
        });
      } else {
        await AlertEngine.resolveAlert(db, fingerprint, 'Journal debits equal credits');
      }
    }
    checksCompleted++;

    // 3. Continuous Audit Chain Integrity Monitor
    const households = await db.household.findMany({ select: { id: true } });
    for (const hh of households) {
      const auditRes = await AuditIntegrityService.verifyAuditChain(db, hh.id);
      const fingerprint = `AUDIT_TAMPER:${hh.id}`;

      if (!auditRes.valid) {
        auditChainFailuresCount++;
        await AlertEngine.raiseAlert(db, {
          fingerprint,
          alertType: 'AUDIT_TAMPER',
          severity: 'P0_CRITICAL',
          householdId: hh.id,
          entityType: 'AuditEvent',
          entityId: auditRes.firstInvalidEventId || undefined,
          message: `CRITICAL AUDIT TAMPER: Audit chain integrity invalid for household ${hh.id}. Failure=${auditRes.failureType}`,
          evidence: auditRes as any,
        });
      } else {
        await AlertEngine.resolveAlert(db, fingerprint, 'Audit chain hash integrity valid');
      }
    }
    checksCompleted++;

    // 4. Tenant Segregation & Cross-Household Anomaly Check
    const orphanEntries = await db.journalEntry.findMany({
      where: {
        account: { isNot: null },
      },
      include: { journal: { select: { householdId: true } }, account: { select: { householdId: true } } },
    });

    for (const entry of orphanEntries) {
      if (entry.journal && entry.account && entry.journal.householdId !== entry.account.householdId) {
        tenantLeaksCount++;
        const fingerprint = `TENANT_LEAK:${entry.id}`;
        await AlertEngine.raiseAlert(db, {
          fingerprint,
          alertType: 'TENANT_LEAK',
          severity: 'P0_CRITICAL',
          householdId: entry.journal.householdId,
          entityType: 'JournalEntry',
          entityId: entry.id,
          message: `CRITICAL TENANT LEAK: JournalEntry ${entry.id} belongs to household ${entry.journal.householdId} but links to account in household ${entry.account.householdId}`,
          evidence: { journalHousehold: entry.journal.householdId, accountHousehold: entry.account.householdId },
        });
      }
    }
    checksCompleted++;

    // 5. Idempotency Failure & Abuse Rate Check
    const duplicateIdempotencyJournals = await db.journal.groupBy({
      by: ['householdId', 'idempotencyKey'],
      where: { idempotencyKey: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    });

    for (const dup of duplicateIdempotencyJournals) {
      if (dup.idempotencyKey) {
        idempotencyAbuseCount++;
        const fingerprint = `IDEMPOTENCY_ABUSE:${dup.householdId}:${dup.idempotencyKey}`;
        await AlertEngine.raiseAlert(db, {
          fingerprint,
          alertType: 'IDEMPOTENCY_ABUSE',
          severity: 'P1_HIGH',
          householdId: dup.householdId,
          entityType: 'Journal',
          message: `HIGH IDEMPOTENCY ABUSE: IdempotencyKey '${dup.idempotencyKey}' yielded multiple journals in household ${dup.householdId}`,
          evidence: { idempotencyKey: dup.idempotencyKey, count: dup._count.id },
        });
      }
    }
    checksCompleted++;

    // 6. Monitor Heartbeat Update
    const heartbeat = await db.monitorHeartbeat.upsert({
      where: { id: 'PRIMARY_MONITOR' },
      create: {
        id: 'PRIMARY_MONITOR',
        lastScanTimestamp: new Date(),
        scansCount: 1,
        status: 'HEALTHY',
      },
      update: {
        lastScanTimestamp: new Date(),
        scansCount: { increment: 1 },
        status: 'HEALTHY',
      },
    });
    checksCompleted++;

    const activeAlerts = await AlertEngine.getActiveAlerts(db);

    return {
      scanTimestamp: heartbeat.lastScanTimestamp.toISOString(),
      checksCompleted,
      openAlertsCount: activeAlerts.length,
      status: activeAlerts.length === 0 ? 'HEALTHY' : 'ALERT',
      details: {
        balanceDriftCount,
        unbalancedJournalsCount,
        auditChainFailuresCount,
        tenantLeaksCount,
        idempotencyAbuseCount,
      },
    };
  }

  /**
   * Check if MonitorHeartbeat is stale (> 15 minutes old).
   */
  static async checkHeartbeatStaleness(
    db: PrismaClient | Prisma.TransactionClient = prisma,
    maxStaleMinutes: number = 15
  ) {
    const heartbeat = await db.monitorHeartbeat.findUnique({
      where: { id: 'PRIMARY_MONITOR' },
    });

    if (!heartbeat) {
      await AlertEngine.raiseAlert(db, {
        fingerprint: 'MONITOR_STALE:PRIMARY_MONITOR',
        alertType: 'MONITOR_STALE',
        severity: 'P1_HIGH',
        message: 'MONITOR STALE: Primary FinancialIntegrityMonitor heartbeat record not found',
      });
      return { isStale: true, lastScan: null };
    }

    const ageMs = Date.now() - new Date(heartbeat.lastScanTimestamp).getTime();
    const isStale = ageMs > maxStaleMinutes * 60 * 1000;

    if (isStale) {
      await AlertEngine.raiseAlert(db, {
        fingerprint: 'MONITOR_STALE:PRIMARY_MONITOR',
        alertType: 'MONITOR_STALE',
        severity: 'P1_HIGH',
        message: `MONITOR STALE: Primary FinancialIntegrityMonitor last scanned ${Math.round(ageMs / 60000)} minutes ago (exceeds ${maxStaleMinutes}m SLA)`,
        evidence: { ageMinutes: Math.round(ageMs / 60000), lastScan: heartbeat.lastScanTimestamp },
      });
    } else {
      await AlertEngine.resolveAlert(db, 'MONITOR_STALE:PRIMARY_MONITOR', 'Monitor heartbeat active and healthy');
    }

    return { isStale, lastScan: heartbeat.lastScanTimestamp };
  }
}
