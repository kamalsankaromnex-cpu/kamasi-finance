# Missing features and recommendations

## Not evidenced in repository discovery

- Password reset/recovery, sign-in rate limiting, MFA, and account/session management.
- CSV/bank statement import with duplicate detection and reconciliation; external bank connectivity.
- Transaction editing, refund workflow, card statement settlement, receipt/document attachments, and notifications/reminders.
- Complete lifecycle endpoints for category maintenance, investment valuation history, asset/liability updates, and goal withdrawals.
- User-facing settings persistence and audited household member removal/role administration.
- Documented database backup/restore, migration adoption, operational monitoring, and incident response.

Absence from inspected routes/schema is evidence of “not found,” not proof the feature is unwanted.

## Recommended order

1. **Before production:** Safely adopt the baseline for existing databases; validate backups/restores; build integration tests for every financial posting route, void, permission change, and concurrency/idempotency behavior.
2. **Before wider household use:** Add authenticated browser automation using a dedicated synthetic fixture; cover all 16 pages, role variants, responsive behavior, and keyboard/accessibility checks.
3. **Financial controls:** Define adjustment, refund, over-receipt, card settlement, and loan accounting semantics; reconcile dashboards, budgets, reports, and export against the same ledger oracle.
4. **Security operations:** Add sign-in rate limiting and recovery controls, review CSRF/security headers, define session revocation and audit retention, and scan dependencies/images.
5. **Product completeness:** Confirm priorities for statement import, attachments, notifications, member administration, valuation history, and user preferences; implement only against approved requirements.
6. **Operations:** Publish setup, migration, backup/restore, deployment, monitoring, retention, and disaster recovery runbooks; measure query performance at realistic synthetic scale.

## Release recommendation

Do not describe this build as fully QA-approved for production financial use yet. Core fixes and selected API paths are verified, but high-severity migration adoption, broad posting-route integration tests, and authenticated browser coverage are still open. See [03-defect-register.md](03-defect-register.md).
