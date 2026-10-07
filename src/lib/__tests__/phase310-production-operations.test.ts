import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../prisma';
import { FinancialIntegrityMonitor } from '@/finance/monitoring/financial-integrity-monitor';
import { AlertEngine } from '@/finance/monitoring/alert-engine';
import { BackupWorker } from '@/finance/monitoring/backup-worker';
import { FinancialCommand } from '@/finance/financial-command';
import { AuditService } from '@/finance/audit/audit.service';
import { NextRequest } from 'next/server';
import { GET as getIntegrityCheck } from '@/app/api/ops/integrity-check/route';
import { POST as postBackupVerify, GET as getBackupVerify } from '@/app/api/ops/backup-verify/route';

describe('Phase 3.10 — Production Operations & Monitoring Suite', () => {
  let householdId: string;
  let userId: string;
  let bankAccountId: string;

  beforeEach(async () => {
    // Clear test database state
    await prisma.alertEvent.deleteMany();
    await prisma.monitorHeartbeat.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.journal.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.user.deleteMany();

    // Provision Test Household
    const user = await prisma.user.create({
      data: {
        email: `ops-${Date.now()}@test.com`,
        passwordHash: 'hashed',
        name: 'Ops Test User',
      },
    });
    userId = user.id;

    const household = await prisma.household.create({
      data: {
        name: 'Ops Household',
        currency: 'INR',
        members: { create: { userId, role: 'OWNER' } },
      },
    });
    householdId = household.id;

    const bank = await prisma.account.create({
      data: {
        householdId,
        userId,
        name: 'Primary HDFC Bank',
        type: 'BANK',
        balance: 0,
      },
    });
    bankAccountId = bank.id;

    // Post clean initial income journal
    await prisma.$transaction(async (tx) => {
      await FinancialCommand.postIncome(tx, {
        householdId,
        accountId: bankAccountId,
        amount: new (require('@prisma/client').Prisma.Decimal)(50000),
        description: 'Clean Initial Salary',
      });
    });
  });

  describe('1. Financial Integrity Monitor & Invariants', () => {
    it('clean database scan produces zero open alerts and HEALTHY status', async () => {
      const scan = await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      expect(scan.status).toBe('HEALTHY');
      expect(scan.openAlertsCount).toBe(0);

      const activeAlerts = await AlertEngine.getActiveAlerts(prisma);
      expect(activeAlerts.length).toBe(0);
    });

    it('detects simulated Account.balance drift, raises P0 alert, deduplicates, and resolves on correction', async () => {
      // 1. Mutate Account.balance directly to simulate balance drift
      await prisma.account.update({
        where: { id: bankAccountId },
        data: { balance: 999999 }, // Stored 999999 vs calculated 50000
      });

      // 2. First scan detects drift and creates OPEN P0 alert
      const scan1 = await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      expect(scan1.status).toBe('ALERT');
      expect(scan1.details.balanceDriftCount).toBe(1);

      const alerts1 = await AlertEngine.getActiveAlerts(prisma);
      expect(alerts1.length).toBe(1);
      expect(alerts1[0].fingerprint).toBe(`BALANCE_DRIFT:${bankAccountId}`);
      expect(alerts1[0].severity).toBe('P0_CRITICAL');
      expect(alerts1[0].status).toBe('OPEN');

      // 3. Second scan with drift intact deduplicates (no extra alert rows created)
      await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      const alertsCount = await prisma.alertEvent.count();
      expect(alertsCount).toBe(1);

      // 4. Correct balance back to ledger derived value (50000)
      await prisma.account.update({
        where: { id: bankAccountId },
        data: { balance: 50000 },
      });

      // 5. Next scan automatically resolves the alert
      const scan3 = await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      expect(scan3.status).toBe('HEALTHY');
      expect(scan3.openAlertsCount).toBe(0);

      const resolvedAlert = await prisma.alertEvent.findUnique({
        where: { fingerprint: `BALANCE_DRIFT:${bankAccountId}` },
      });
      expect(resolvedAlert?.status).toBe('RESOLVED');
      expect(resolvedAlert?.resolvedAt).not.toBeNull();
    });

    it('detects unbalanced double-entry journal (debits != credits) and raises P0 alert', async () => {
      // Manually insert an unbalanced journal
      const unbalancedJournal = await prisma.journal.create({
        data: {
          householdId,
          description: 'Unbalanced Corruption Test',
          status: 'POSTED',
          entries: {
            create: [
              { accountId: bankAccountId, debit: 10000, credit: 0 },
              { accountId: bankAccountId, debit: 0, credit: 5000 }, // Debits=10000, Credits=5000
            ],
          },
        },
      });

      const scan = await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      expect(scan.status).toBe('ALERT');
      expect(scan.details.unbalancedJournalsCount).toBe(1);

      const alert = await prisma.alertEvent.findUnique({
        where: { fingerprint: `UNBALANCED_JOURNAL:${unbalancedJournal.id}` },
      });
      expect(alert?.severity).toBe('P0_CRITICAL');
      expect(alert?.status).toBe('OPEN');
    });

    it('detects tampered audit log entries and raises P0 AUDIT_TAMPER alert', async () => {
      // Create valid audit event
      const audit = await prisma.$transaction(async (tx) => {
        return AuditService.record(tx, {
          householdId,
          entityType: 'ACCOUNT',
          entityId: bankAccountId,
          action: 'CREATE',
          actorUserId: userId,
        });
      });

      // Tamper with audit log event hash directly in DB
      await prisma.auditEvent.update({
        where: { id: audit.id },
        data: { eventHash: 'corrupted_hash_value' },
      });

      const scan = await FinancialIntegrityMonitor.runFullIntegrityScan(prisma);
      expect(scan.status).toBe('ALERT');
      expect(scan.details.auditChainFailuresCount).toBe(1);

      const alert = await prisma.alertEvent.findUnique({
        where: { fingerprint: `AUDIT_TAMPER:${householdId}` },
      });
      expect(alert?.severity).toBe('P0_CRITICAL');
    });
  });

  describe('2. Monitor Heartbeat & Staleness', () => {
    it('detects stale monitor heartbeat (>15m) and raises P1 MONITOR_STALE alert', async () => {
      // Create heartbeat record with lastScan 30 minutes ago
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      await prisma.monitorHeartbeat.create({
        data: {
          id: 'PRIMARY_MONITOR',
          lastScanTimestamp: thirtyMinsAgo,
          status: 'HEALTHY',
        },
      });

      const checkRes = await FinancialIntegrityMonitor.checkHeartbeatStaleness(prisma, 15);
      expect(checkRes.isStale).toBe(true);

      const alert = await prisma.alertEvent.findUnique({
        where: { fingerprint: 'MONITOR_STALE:PRIMARY_MONITOR' },
      });
      expect(alert?.severity).toBe('P1_HIGH');
      expect(alert?.status).toBe('OPEN');
    });
  });

  describe('3. Protected Operations API Security', () => {
    it('unauthenticated request to /api/ops/integrity-check returns 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/ops/integrity-check', {
        method: 'GET',
      });
      const res = await getIntegrityCheck(req);
      expect(res.status).toBe(401);
    });

    it('authenticated request with x-ops-api-key returns 200 HEALTHY', async () => {
      const req = new NextRequest('http://localhost:3000/api/ops/integrity-check', {
        method: 'GET',
        headers: { 'x-ops-api-key': 'dev_ops_secret_key_12345' },
      });
      const res = await getIntegrityCheck(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('HEALTHY');
    });
  });

  describe('4. Asynchronous Backup Worker Drill', () => {
    it('POST /api/ops/backup-verify enqueues job with HTTP 202 Accepted', async () => {
      const req = new NextRequest('http://localhost:3000/api/ops/backup-verify', {
        method: 'POST',
        headers: { 'x-ops-api-key': 'dev_ops_secret_key_12345' },
      });
      const res = await postBackupVerify(req);
      expect(res.status).toBe(202);

      const body = await res.json();
      expect(body.status).toBe('QUEUED');
      expect(body.jobId).toBeDefined();

      // Poll status via GET /api/ops/backup-verify?jobId=...
      const getReq = new NextRequest(`http://localhost:3000/api/ops/backup-verify?jobId=${body.jobId}`, {
        method: 'GET',
        headers: { 'x-ops-api-key': 'dev_ops_secret_key_12345' },
      });
      const getRes = await getBackupVerify(getReq);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.jobId).toBe(body.jobId);
    });
  });
});
