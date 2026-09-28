import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "prisma" / "phase3-recovery.db"
BACKUP = ROOT / "prisma" / "phase3-recovery-backup.db"
RESTORE = ROOT / "prisma" / "phase3-restored.db"
UPGRADE = ROOT / "prisma" / "phase3-upgrade.db"
EXPECTED_DATABASE = "prisma/phase3-recovery.db"


def connect(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys = ON")
    return db


def row_counts(db: sqlite3.Connection) -> dict[str, int]:
    tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
    return {name: db.execute(f' SELECT COUNT(*) FROM "{name}"').fetchone()[0] for (name,) in tables}


def verify_integrity(db: sqlite3.Connection) -> None:
    result = db.execute("PRAGMA integrity_check").fetchone()[0]
    if result != "ok":
        raise RuntimeError(f"SQLite integrity_check failed: {result}")
    foreign_keys = db.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_keys:
        raise RuntimeError(f"SQLite foreign_key_check returned rows: {foreign_keys[:5]}")


def prepare() -> None:
    if os.environ.get("KAMASI_QA_DATABASE") != EXPECTED_DATABASE:
        raise RuntimeError(f"Refusing database writes: KAMASI_QA_DATABASE must equal {EXPECTED_DATABASE}")
    if not SOURCE.exists():
        raise RuntimeError(f"Missing synthetic source database: {SOURCE}")
    for target in (BACKUP, RESTORE, UPGRADE):
        if target.exists():
            raise RuntimeError(f"Refusing to overwrite existing drill artifact: {target}")

    with connect(SOURCE) as source:
        verify_integrity(source)
        source_counts = row_counts(source)
        account_balance = source.execute('SELECT "balance" FROM "Account"').fetchone()[0]
        ledger_net = source.execute(
            'SELECT SUM(CASE WHEN "type" = \'INCOME\' THEN "amount" '
            'WHEN "type" = \'EXPENSE\' THEN -"amount" ELSE 0 END) FROM "Transaction"'
        ).fetchone()[0]
        if account_balance != 1090 or ledger_net != 90 or account_balance - ledger_net != 1000:
            raise RuntimeError(f"Synthetic ledger oracle mismatch: balance={account_balance}, net={ledger_net}")
        for target in (BACKUP, RESTORE, UPGRADE):
            with connect(target) as output:
                source.backup(output)

    for target in (BACKUP, RESTORE):
        with connect(target) as restored:
            verify_integrity(restored)
            if row_counts(restored) != source_counts:
                raise RuntimeError(f"Backup/restore row counts differ for {target.name}")

    with connect(UPGRADE) as upgrade:
        verify_integrity(upgrade)
        upgrade.execute('DROP INDEX IF EXISTS "Transaction_idempotencyKey_key"')
        columns = {row[1] for row in upgrade.execute('PRAGMA table_info("Transaction")')}
        if "idempotencyKey" in columns:
            upgrade.execute('ALTER TABLE "Transaction" DROP COLUMN "idempotencyKey"')
        upgrade.execute('DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?', ("20260925180000_add_transaction_idempotency_key",))
        upgrade.commit()
        verify_integrity(upgrade)
        before_migration_counts = row_counts(upgrade)
        expected_baseline_counts = dict(source_counts)
        expected_baseline_counts["_prisma_migrations"] -= 1
        if before_migration_counts != expected_baseline_counts:
            raise RuntimeError("Populated baseline copy changed row counts while preparing migration test")
        if "idempotencyKey" in {row[1] for row in upgrade.execute('PRAGMA table_info("Transaction")')}:
            raise RuntimeError("Populated upgrade copy still contains the additive idempotency column")

    print(json.dumps({
        "status": "PREPARED",
        "synthetic_source": SOURCE.name,
        "backup": BACKUP.name,
        "restored_copy": RESTORE.name,
        "populated_baseline_copy": UPGRADE.name,
        "tables_and_row_counts": source_counts,
        "account_balance": account_balance,
        "ledger_net": ledger_net,
        "implied_opening_balance": account_balance - ledger_net,
        "integrity_check": "ok",
        "foreign_key_violations": 0,
        "next": "Run prisma migrate deploy against phase3-upgrade.db, then invoke this script with verify.",
    }, indent=2))


def verify_upgrade() -> None:
    if os.environ.get("KAMASI_QA_DATABASE") != EXPECTED_DATABASE:
        raise RuntimeError(f"Refusing database reads: KAMASI_QA_DATABASE must equal {EXPECTED_DATABASE}")
    with connect(SOURCE) as source, connect(UPGRADE) as upgrade:
        verify_integrity(source)
        verify_integrity(upgrade)
        source_counts = row_counts(source)
        upgrade_counts = row_counts(upgrade)
        migration_count = upgrade.execute(
            'SELECT COUNT(*) FROM "_prisma_migrations" WHERE "migration_name" = ?',
            ("20260925180000_add_transaction_idempotency_key",),
        ).fetchone()[0]
        transaction_columns = {row[1] for row in upgrade.execute('PRAGMA table_info("Transaction")')}
        if source_counts != upgrade_counts or migration_count != 1 or "idempotencyKey" not in transaction_columns:
            raise RuntimeError("Populated baseline migration upgrade did not preserve rows or apply idempotency schema")
        source_balances = source.execute('SELECT "balance" FROM "Account" ORDER BY "id"').fetchall()
        upgrade_balances = upgrade.execute('SELECT "balance" FROM "Account" ORDER BY "id"').fetchall()
        if source_balances != upgrade_balances:
            raise RuntimeError("Account balances differ after populated migration upgrade")
    print(json.dumps({
        "status": "PASS",
        "migration": "20260925180000_add_transaction_idempotency_key",
        "table_counts_equal": True,
        "account_balances_equal": True,
        "integrity_check": "ok",
        "foreign_key_violations": 0,
    }, indent=2))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "prepare"
    if mode == "prepare":
        prepare()
    elif mode == "verify":
        verify_upgrade()
    else:
        raise SystemExit("Usage: phase3-sqlite-recovery-drill.py [prepare|verify]")
