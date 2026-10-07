import fs from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AlertEngine } from './alert-engine';
import { AuditIntegrityService } from '@/finance/audit/audit-integrity.service';
import { LedgerService } from '@/finance/ledger.service';

export interface BackupJobStatus {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

const jobRegistry = new Map<string, BackupJobStatus>();

export class BackupWorker {
  /**
   * Enqueue asynchronous backup verification drill.
   * Returns immediately with HTTP 202 Accepted semantics.
   */
  static enqueueBackupVerification(): BackupJobStatus {
    const jobId = `job_backup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobStatus: BackupJobStatus = {
      jobId,
      status: 'QUEUED',
      startedAt: new Date().toISOString(),
    };

    jobRegistry.set(jobId, jobStatus);

    // Execute asynchronously in background worker process
    setImmediate(() => {
      this.executeBackupVerificationJob(jobId).catch((err) => {
        console.error(`Backup Verification Job ${jobId} failed unexpectedly:`, err);
      });
    });

    return jobStatus;
  }

  /**
   * Retrieve job status by ID.
   */
  static getJobStatus(jobId: string): BackupJobStatus | undefined {
    return jobRegistry.get(jobId);
  }

  /**
   * Internal asynchronous worker routine.
   * Performs backup copy to scratch DB, verifies 100% record count, double-entry equality,
   * account balance projections, and audit hash chain integrity.
   */
  private static async executeBackupVerificationJob(jobId: string) {
    const job = jobRegistry.get(jobId);
    if (!job) return;

    job.status = 'RUNNING';

    const sourceDbPath = path.resolve(process.cwd(), 'prisma/dev.db');
    const scratchDir = path.resolve(process.cwd(), 'scratch');
    const backupDbPath = path.resolve(scratchDir, `backup_${jobId}.db`);
    const restoredDbPath = path.resolve(scratchDir, `restored_${jobId}.db`);

    try {
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      if (!fs.existsSync(sourceDbPath)) {
        throw new Error(`Source database file not found at ${sourceDbPath}`);
      }

      // 1. Source Database Verification
      const sourcePrisma = new PrismaClient({
        datasources: { db: { url: `file:${sourceDbPath}` } },
      });

      const sourceCounts = {
        accounts: await sourcePrisma.account.count(),
        transactions: await sourcePrisma.transaction.count(),
        journals: await sourcePrisma.journal.count(),
        journalEntries: await sourcePrisma.journalEntry.count(),
        auditEvents: await sourcePrisma.auditEvent.count(),
      };
      await sourcePrisma.$disconnect();

      // 2. Perform Database Backup & Restore to Scratch DB
      fs.copyFileSync(sourceDbPath, backupDbPath);
      fs.copyFileSync(backupDbPath, restoredDbPath);

      // 3. Connect to Restored Database
      const restoredPrisma = new PrismaClient({
        datasources: { db: { url: `file:${restoredDbPath}` } },
      });

      // 4. Verify Restored Entity Counts
      const restoredCounts = {
        accounts: await restoredPrisma.account.count(),
        transactions: await restoredPrisma.transaction.count(),
        journals: await restoredPrisma.journal.count(),
        journalEntries: await restoredPrisma.journalEntry.count(),
        auditEvents: await restoredPrisma.auditEvent.count(),
      };

      for (const [key, val] of Object.entries(sourceCounts)) {
        const restoredVal = (restoredCounts as any)[key];
        if (val !== restoredVal) {
          throw new Error(`Data loss detected on entity '${key}': Source=${val}, Restored=${restoredVal}`);
        }
      }

      // 5. Verify Double-Entry Balance
      const entrySum = await restoredPrisma.journalEntry.aggregate({
        _sum: { debit: true, credit: true },
      });
      const totalDebits = Number(entrySum._sum.debit?.toString() || 0);
      const totalCredits = Number(entrySum._sum.credit?.toString() || 0);
      if (Math.abs(totalDebits - totalCredits) > 0.001) {
        throw new Error(`Double-entry balance check failed on restored DB: Debits=${totalDebits}, Credits=${totalCredits}`);
      }

      // 6. Verify Account Balance Projections
      const accounts = await restoredPrisma.account.findMany();
      for (const acc of accounts) {
        const entries = await restoredPrisma.journalEntry.findMany({
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
          if (diff > 0.001) {
            throw new Error(`Account projection mismatch on restored DB for account ${acc.id}: Stored=${acc.balance}, Calc=${calculatedBal}`);
          }
        }
      }

      // 7. Verify Audit Hash Chain Integrity
      const households = await restoredPrisma.household.findMany({ select: { id: true } });
      for (const hh of households) {
        const auditRes = await AuditIntegrityService.verifyAuditChain(restoredPrisma, hh.id);
        if (!auditRes.valid) {
          throw new Error(`Audit hash chain verification failed on restored DB for household ${hh.id}: ${auditRes.failureType}`);
        }
      }

      await restoredPrisma.$disconnect();

      // Cleanup scratch files
      if (fs.existsSync(backupDbPath)) fs.unlinkSync(backupDbPath);
      if (fs.existsSync(restoredDbPath)) fs.unlinkSync(restoredDbPath);

      job.status = 'COMPLETED';
      job.completedAt = new Date().toISOString();

      await AlertEngine.resolveAlert(prisma, 'BACKUP_FAILURE:PRIMARY_JOB', 'Backup & restoration drill completed successfully');
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
      job.completedAt = new Date().toISOString();

      // Raise P0 Alert on backup failure
      await AlertEngine.raiseAlert(prisma, {
        fingerprint: 'BACKUP_FAILURE:PRIMARY_JOB',
        alertType: 'BACKUP_FAILURE',
        severity: 'P0_CRITICAL',
        message: `CRITICAL BACKUP RESTORATION DRILL FAILURE: ${err.message}`,
        evidence: { jobId, error: err.message },
      });

      // Cleanup scratch files on error
      if (fs.existsSync(backupDbPath)) fs.unlinkSync(backupDbPath);
      if (fs.existsSync(restoredDbPath)) fs.unlinkSync(restoredDbPath);
    }
  }
}
