# Security and data integrity report

## Verified in this run

- Anonymous account API read returned 401.
- Viewer transaction mutation returned 403.
- Viewer could not list another household member's private account; direct account read returned 404.
- Household member API omitted `passwordHash`.
- Matching-email invitation acceptance created a VIEWER membership and active session.
- Same-key transaction retry did not double-post; changed payload conflicted.
- Invalid negative transaction was rejected; transfer source and destination balanced.

## Implemented controls

Current request authorization rechecks active household membership and role. Account/transaction visibility respects `isShared` and ownership. Financial mutations check role and use server-side household/account scoping. Invitations use cryptographic codes and expiry/email checks. Posting routes added request idempotency and conditional outstanding guards. Related account/member responses select only necessary fields. Transaction voiding protects linked financial occurrences.

## Not verified / remaining controls

- Household revocation/role downgrade against an already-issued session, cross-household object-ID attacks across every API, CSRF, XSS, brute-force/rate limiting, secret rotation, session expiry, password recovery, and security headers.
- Concurrent use of one idempotency key and race behavior for occurrence balances.
- SQLite foreign-key runtime enforcement, backup encryption, retention, and disaster recovery.
- External dependency and container image vulnerability review.

## Migration warning

The initial migration was generated as an empty-database baseline and both migrations were applied only to an isolated QA file. The existing `dev.db` has no migration history. Do not run `migrate deploy` against it or production until schema equivalence is verified, a recoverable backup is proven, and the baseline is safely adopted/resolved. No destructive schema migration was executed against the developer database.
