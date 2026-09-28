# Regression and build report

**Date:** 2026-09-25

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript no-emit check |
| `npm run lint` | PASS | Noninteractive ESLint configuration now in place |
| `npm test` | PASS | 8 test files, 39 tests; SQLite tests used isolated QA database |
| `npm run build` | PASS | Production Next.js build |
| `npx prisma validate` | PASS | Schema validation |
| `prisma migrate deploy` | PASS | Baseline + idempotency migration on empty isolated QA DB only |
| `scripts/qa-api-smoke.ps1` | PASS | 11 synthetic API assertions; output recorded in scenario report |
| Browser spot checks | PASS / PARTIAL | Public login/register, invalid credentials, protected redirect; no authenticated screens |

The application database at `prisma/dev.db` was not used for test setup or cleanup. `prisma/qa-test.db` contains only synthetic QA records and is retained for reproducibility; `prisma/schema.qa.prisma` points to it. Prisma Client was regenerated from `prisma/schema.prisma` before delivery, so the normal app configuration points to the default database. The smoke script refuses to run unless `KAMASI_QA_DATABASE=prisma/qa-test.db` is set. For another isolated run, generate with the QA schema first, start the app with that client, run the script, then regenerate from the normal schema.

## Regression limitations

No test was added or run against production services. Existing automated coverage is small relative to 28 API handlers and 16 pages. No full authenticated UI suite, concurrency test, fault injection, load test, or restore drill exists. Migration deployment evidence is limited to an empty isolated SQLite database and is not evidence that the existing populated file can safely adopt the migration baseline.
