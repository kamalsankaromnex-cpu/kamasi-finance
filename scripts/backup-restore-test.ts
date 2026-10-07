import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { AuditIntegrityService } from '../src/finance/audit/audit-integrity.service';
import { LedgerService } from '../src/finance/ledger.service';

async function runBackupRestoreTest() {
  console.log('=== Starting Backup & Restore Integrity Test ===');

  const sourceDbPath = path.resolve(process.cwd(), 'prisma/dev.db');
  const scratchDir = path.resolve(process.cwd(), 'scratch');
  const backupDbPath = path.resolve(scratchDir, 'backup_test.db');
  const restoredDbPath = path.resolve(scratchDir, 'restored_test.db');

  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  if (!fs.existsSync(sourceDbPath)) {
    console.log(`Source DB at ${sourceDbPath} not found. Creating DB or using default Prisma client.`);
  }

  // 1. Source Database Verification
  const sourcePrisma = new PrismaClient({
    datasources: { db: { url: `file:${sourceDbPath}` } },
  });

  console.log('1. Reading source database record counts...');
  const sourceCounts = {
    accounts: await sourcePrisma.account.count(),
    transactions: await sourcePrisma.transaction.count(),
    journals: await sourcePrisma.journal.count(),
    journalEntries: await sourcePrisma.journalEntry.count(),
    auditEvents: await sourcePrisma.auditEvent.count(),
    assets: await sourcePrisma.asset.count(),
    liabilities: await sourcePrisma.liability.count(),
    investments: await sourcePrisma.investment.count(),
    goals: await sourcePrisma.goal.count(),
  };
  console.log('Source record counts:', sourceCounts);
  await sourcePrisma.$disconnect();

  // 2. Perform Database Backup
  console.log('2. Creating backup file at scratch/backup_test.db...');
  fs.copyFileSync(sourceDbPath, backupDbPath);

  // 3. Restore to Scratch DB (Isolated Scratch DB - NEVER production)
  console.log('3. Restoring backup file to scratch/restored_test.db...');
  fs.copyFileSync(backupDbPath, restoredDbPath);

  // 4. Connect to Restored Database
  const restoredPrisma = new PrismaClient({
    datasources: { db: { url: `file:${restoredDbPath}` } },
  });

  // 5. Compare Record Counts
  console.log('4. Verifying restored database record counts...');
  const restoredCounts = {
    accounts: await restoredPrisma.account.count(),
    transactions: await restoredPrisma.transaction.count(),
    journals: await restoredPrisma.journal.count(),
    journalEntries: await restoredPrisma.journalEntry.count(),
    auditEvents: await restoredPrisma.auditEvent.count(),
    assets: await restoredPrisma.asset.count(),
    liabilities: await restoredPrisma.liability.count(),
    investments: await restoredPrisma.investment.count(),
    goals: await restoredPrisma.goal.count(),
  };
  console.log('Restored record counts:', restoredCounts);

  for (const [key, val] of Object.entries(sourceCounts)) {
    const restoredVal = (restoredCounts as any)[key];
    if (val !== restoredVal) {
      throw new Error(`Backup restore data loss detected on entity '${key}': Source=${val}, Restored=${restoredVal}`);
    }
  }

  // 6. Double-Entry Verification on Restored DB
  console.log('5. Verifying double-entry journal balance on restored DB...');
  const entrySum = await restoredPrisma.journalEntry.aggregate({
    _sum: { debit: true, credit: true },
  });
  const totalDebits = Number(entrySum._sum.debit?.toString() || 0);
  const totalCredits = Number(entrySum._sum.credit?.toString() || 0);
  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new Error(`Double-entry balance check failed on restored DB: Debits=${totalDebits}, Credits=${totalCredits}`);
  }

  // 7. Account.balance Projection Match Verification
  console.log('6. Verifying Account.balance projection match against Ledger balance on restored DB...');
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

    // Only accounts that have posted journals need to match 100%
    if (entries.length > 0) {
      const diff = acc.balance.sub(calculatedBal).abs().toNumber();
      if (diff > 0.001) {
        throw new Error(
          `Account balance projection mismatch on restored DB for account ${acc.id} (${acc.name}): Ledger=${calculatedBal}, Account.balance=${acc.balance}`
        );
      }
    }
  }

  // 8. Audit Chain Verification on Restored DB
  console.log('7. Verifying audit hash chain integrity on restored DB...');
  const households = await restoredPrisma.household.findMany({ select: { id: true } });
  for (const hh of households) {
    const auditRes = await AuditIntegrityService.verifyAuditChain(restoredPrisma, hh.id);
    if (!auditRes.valid) {
      throw new Error(
        `Audit hash chain verification failed on restored DB for household ${hh.id}: type=${auditRes.failureType}, eventId=${auditRes.firstInvalidEventId}`
      );
    }
  }

  await restoredPrisma.$disconnect();

  // Cleanup temporary scratch files
  if (fs.existsSync(backupDbPath)) fs.unlinkSync(backupDbPath);
  if (fs.existsSync(restoredDbPath)) fs.unlinkSync(restoredDbPath);

  console.log('=== Backup & Restore Integrity Test PASSED CLEANLY ===');
}

runBackupRestoreTest().catch((err) => {
  console.error('Backup & Restore Test Failed:', err);
  process.exit(1);
});
