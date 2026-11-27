# JUMPINGGOOSE database backup and recovery

## Current protection
The Supabase project `cpdkrsllsewhptcwfxqc` belongs to a **Free-plan** organization. Free plans do not include Supabase's managed daily database backups. Production data must have its own offsite backup.

The archived 3 leave requests in `private.hr_leave_requests_prelaunch_backup_20261125` are NOT an offsite backup and cannot survive loss of the Supabase project.

## Proposed interim workflow (requires configuration before it can run)
The workflow at `.github/workflows/encrypted-database-backup.yml` takes daily logical dumps at approximately **05:30 IST**, encrypts the archive with AES-256-CBC/PBKDF2, verifies that the encrypted artifact can be decrypted and listed, then uploads it as a **private GitHub Actions artifact retained for 30 days**. Runs can be delayed or skipped by GitHub Actions; monitor them.

The workflow remains unusable until both repository Actions secrets are provided:
- `JG_BACKUP_DATABASE_URL`: direct or session-pooler PostgreSQL connection URL from Supabase **Connect**. Use a dedicated least-privilege backup database account if supported, with sufficient read access for the required schemas; otherwise protect the database admin credential carefully. Do not put passwords in code or pull requests.
- `JG_BACKUP_PASSPHRASE`: unique randomly generated 32+ character passphrase. Store a recovery copy in an approved company password manager separate from GitHub.

In the private GitHub repository, configure both secrets under **Settings → Secrets and variables → Actions**. Then run **Actions → Encrypted database backup → Run workflow** manually. Confirm the job completes, artifact is downloadable, and alerts/owners exist for failed scheduled runs.

## Important coverage limits
Supabase CLI database dumps exclude Supabase-managed schemas including `auth` and `storage` by default. This interim backup preserves the application schema and application data, but **does not provide a complete auth-user or stored-file recovery**. Inventory Auth users, Storage objects, Edge Functions, Cron jobs, and secrets separately and document their recovery procedures before declaring full disaster recovery.

The GitHub artifact is a temporary **secondary** backup, not an independently verified durable backup platform. For production resilience, use a paid Supabase plan with managed backups or a secure offsite object-storage solution with monitoring and immutability. GitHub artifact retention is not a guaranteed RPO/RTO.

## Safe restore test (do not point at production)
1. Download an encrypted archive from GitHub Actions.
2. On a trusted workstation, retrieve the passphrase from the password manager.
3. Decrypt: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in jg-db-<RUN>.tar.gz.enc -out jg-backup.tar.gz -pass env:BACKUP_PASSPHRASE`
4. Extract in a private directory using `tar -xzf jg-backup.tar.gz`, then `sha256sum -c checksums.sha256`.
5. Provision a **separate** test Supabase project or isolated PostgreSQL instance. Obtain approval for any charge.
6. Follow Supabase's [Backup and Restore using CLI guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) to restore the roles, schema and data files to the test project. Never restore to live production while testing.
7. Verify table counts, test the application's key queries and RLS with test identities, and document errors and elapsed recovery time. Delete the test environment and securely erase plaintext after sign-off.

## Daily/weekly checks
- Daily: workflow success, artifact size nonzero, and archive decryption/list verification.
- Weekly: check retention, secrets access and failed runs; verify newest archive offsite access.
- Monthly: full restore into isolated environment and document RPO/RTO.
- After substantial changes: update separate Edge Functions / Cron / Auth / Storage recovery inventory.

## Source documentation
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/supabase-db-dump

**Status:** Backup workflow staged in a PR. No offsite backup or restore is verified until secrets are configured, an artifact is successfully produced, and a separate restore test passes.
