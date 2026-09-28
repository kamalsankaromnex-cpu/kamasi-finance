# Phase 3F — SQLite Backup, Restore, and Migration Drill

## Scope and safety

All work used explicit disposable SQLite paths beginning `prisma/phase3-`. The recovery script refuses to run without `KAMASI_QA_DATABASE=prisma/phase3-recovery.db`; the fixture likewise checks its target. No `.env` file or developer database was opened.

The Prisma schema, `.env.example`, Compose service, and migration SQL all use SQLite. Docker Compose mounts `/app/prisma/data` and points to `/app/prisma/data/finance.db`. Provider choice is consistent; no provider switch was made.

## Drill records

| ID | Scenario | Preconditions / data | Steps | Expected | Actual | Status / severity | Evidence |
|---|---|---|---|---|---|---|---|
| REC-001 | Fresh migration | New `prisma/phase3-recovery.db` | Set `DATABASE_URL=file:./phase3-recovery.db`; run `npx prisma migrate deploy` | Apply complete migrations, schema matches | Both current migrations applied successfully | PASS, P0 | Terminal output recorded in Phase 3 execution session |
| REC-002 | Synthetic seed across finance modules | Fresh migrated QA DB | `npx tsx scripts/phase3-recovery-fixture.ts` | One household and records across major models; expected ledger balance reconciles | Household1, Account1, Transaction4, IncomeSource1, IncomeOccurrence1, RecurringBillOccurrence1, Budget1, EmploymentProfile1, PayslipRecord1, Goal1, Investment1, Asset1, Liability1, ForecastScenario1, ForecastMilestone1; balance 1090 = opening1000 + ledger net90 | PASS, P0 | Fixture console output |
| REC-003 | Backup and restore to separate DB | Populated synthetic recovery DB | `python scripts/phase3-sqlite-recovery-drill.py prepare` | Backup and restored copy retain row counts, account balances, integrity, foreign keys | All counts/balances equal; `integrity_check=ok`; FK violations 0 | PASS, P0 | Recovery script output |
| REC-004 | Upgrade populated baseline | Separate copied DB representing pre-idempotency migration | Set `DATABASE_URL=file:./phase3-upgrade.db`; run `npx prisma migrate deploy` | Upgrade existing data without loss | Migration `20260925180000_add_transaction_idempotency_key` applied | PASS, P0 | Prisma deploy output |
| REC-005 | Compare after restore/upgrade | Restored and upgraded disposable files | `python scripts/phase3-sqlite-recovery-drill.py verify` | Counts/balances unchanged, integrity good, no FK violations | Equality checks passed, integrity ok, FK violations 0 | PASS, P0 | Recovery verify output |
| REC-006 | Restore operational procedure in target environment | No production host credentials or external deployment access in repo | Verify real scheduled backup, off-host retention, restore time, key custody | Demonstrated recovery in deployment environment | No production target, backup schedule, retention, or restore credentials/config were available | BLOCKED, P0 | Repository configuration inspection |

## Exact local commands

Run from repository root in PowerShell, only with disposable paths:

```powershell
$env:DATABASE_URL = 'file:./phase3-recovery.db'
npx prisma migrate deploy
npx tsx scripts/phase3-recovery-fixture.ts
$env:KAMASI_QA_DATABASE = 'prisma/phase3-recovery.db'
python scripts/phase3-sqlite-recovery-drill.py prepare
$env:DATABASE_URL = 'file:./phase3-upgrade.db'
npx prisma migrate deploy
python scripts/phase3-sqlite-recovery-drill.py verify
```

The recovery script uses Python's SQLite backup API and copies to separate disposable file names. Check script guards before reuse. The QA DBs and copies are temporary and must not be pointed at user files.

## Production recovery requirements still unverified

The successful local drill proves the included scripts and current SQLite migration can copy synthetic data. It does not prove backups are scheduled, encrypted, off-host, retained, monitored, or restorable within an agreed RPO/RTO. Production needs an owned backup schedule, secure retention, restore credentials, periodic restore drills, and an approved recovery objective.
