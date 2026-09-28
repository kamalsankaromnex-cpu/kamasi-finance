# Deployment and Operations

This guide describes the repository's supported deployment shape: one Next.js application instance with a persistent SQLite file. It does not assume a particular cloud vendor.

## Configuration and launch

Required runtime values:

- `JWT_SECRET`: random secret with at least 32 bytes; provide through the host's secret manager. Do not commit it or use the historical sample secret.
- `DATABASE_URL`: local development uses `file:./dev.db`. Compose sets `file:/app/prisma/data/finance.db` and mounts `finance_data` at that path.
- `NEXT_PUBLIC_APP_URL`: externally reachable HTTPS origin in production.

For local development, copy `.env.example` to `.env`, replace `JWT_SECRET` with a newly generated random value, then run `npm ci`, `npx prisma generate`, and `npm run dev`. For the container, set `JWT_SECRET` and `NEXT_PUBLIC_APP_URL` in the deployment environment and run `docker compose up --build -d`. The container listens on port 3000. Place a TLS-enabled reverse proxy or managed ingress in front of it; expose only HTTPS publicly.

The container runs as the non-root `nextjs` user. The database volume directory is created with matching ownership. Back up the named volume before application/schema upgrades. Do not scale this Compose service horizontally: SQLite requires a single writer instance and shared network filesystems are not a supported substitute.

## Database changes and existing data

The checked-in migration history contains a baseline and an idempotency-key migration. A fresh database can use `npx prisma migrate deploy` from a controlled one-off release step before the app starts. The workspace's populated `prisma/dev.db` had no migration history; before this documentation update, a dated copy was made at `prisma/dev.db.pre-open-items-20260928-094354.bak`, the baseline was resolved, and the additive migration was applied. `npx prisma migrate status` reports the workspace database up to date. Keep that pre-migration copy until the application has been used and reconciled successfully. This local operation does not migrate any external production database.

## Backups and restore

For container deployments, stop the app or use SQLite's online backup API/tool to make a consistent copy of `/app/prisma/data/finance.db` to protected backup storage. Encrypt backups at rest and restrict access to the deployment operators. Retain multiple dated copies according to the organization's retention policy. Verify a restore periodically by restoring to an isolated volume and starting a temporary app against that copy. Do not test restores over the live database.

The repository does not configure a backup provider or retention schedule. Those are deployment-specific responsibilities. A named Docker volume provides persistence across container replacement, but it is not a backup.

## Monitoring and recovery

Route handlers return status-coded JSON errors and write server errors to application logs. Collect container stdout/stderr in the host logging service, restrict log access, alert on repeated 5xx responses, process restarts, disk exhaustion, and failed backup jobs. Avoid logging request bodies, passwords, session tokens, invitation codes, or financial records. Provide a health check at the hosting layer and test it against an actual lightweight endpoint before enabling automated restarts.

To recover, stop writes, preserve the current database file for diagnosis, restore the latest verified backup into the mounted data volume, then restart one app instance. Record the restore point and reconcile any writes after that point.

## CI and release checks

Use a CI runner with a fresh isolated database file and no production secrets. Suggested release gates are `npm ci`, `npx prisma validate`, `npm run typecheck`, `npm run lint`, the DB-free unit suite, `npm run build`, container image build, and a smoke run with a disposable SQLite database. Keep database integration tests isolated from `prisma/dev.db`; the existing persistence tests have destructive fixture setup. Run schema migrations as a single controlled release step, take a backup first, then deploy the app image. No hosted CI provider, TLS service, secret manager, alerting service, or backup target is configured by this repository.

## Database-provider changes

The current application deliberately uses SQLite because its checked-in migrations and local finance database are SQLite. Moving to PostgreSQL requires a separate data migration, conversion of migration history, validation of Prisma behavior, and a tested rollback/restore plan. Changing only `DATABASE_URL` is insufficient.
