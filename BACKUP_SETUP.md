# JG Supabase automated database backups

Workflow: `.github/workflows/supabase-backup.yml`

## Purpose
- Export Supabase-managed PostgreSQL application schema and data using the Supabase CLI.
- Encrypt each export before uploading it as a GitHub Actions artifact.
- Schedule: 21:00 UTC daily (02:30 IST next day).
- Retention: 30-day daily artifacts; additional 90-day archive on the 1st of each month.
- GitHub Actions schedules are not guaranteed to run at the precise minute.

## Finish setup (required)
1. Open the Supabase dashboard for project `cpdkrsllsewhptcwfxqc` -> **Connect** and copy the **Session pooler** PostgreSQL URI.
2. In GitHub repo Settings -> Secrets and variables -> Actions -> **New repository secret**, create:
   - `SUPABASE_DB_URL`: the full URI including your database password, URL-encoded correctly; **never commit or paste this secret in chat**.
   - `BACKUP_ENCRYPTION_PASSWORD`: an independent, strong random passphrase of at least 24 characters. Save this in the agency password manager, outside GitHub.
3. Ensure the repo is **private**, with access limited to trusted administrators, and turn on repository Actions if disabled.
4. Run GitHub **Actions -> JG Encrypted Database Backup -> Run workflow**. Check the run and artifact download and inspect the decrypted archive. The workflow fails explicitly if either secret is missing.
5. Monitor failure notifications and Actions storage/quota.

## Files and limitations
The encrypted archive contains `roles.sql`, `schema.sql`, and `data.sql`.

**Important**: Supabase CLI database dumps default to application database objects. Supabase-managed schemas such as `auth` and `storage` are excluded by default; these exports should **not** be treated as a full disaster-recovery backup of Supabase Auth users, credentials, or Storage objects. If those must also be backed up, plan and test a separate privileged PostgreSQL export and Storage object copy.

Because the project stores HR and salary information, keep artifact access restricted and never upload plaintext SQL exports to the repository or share them publicly. GitHub artifacts are independent of Supabase, but still within the same GitHub account as application source. For resilience against a GitHub account compromise, download a monthly encrypted artifact to a second restricted storage account.

## Decryption
Download the encrypted `.enc` artifact from the run. On a trusted machine, run:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in jg-supabase-YYYY-MM-DD.enc -out backup.tar.gz

tar -tzf backup.tar.gz
tar -xzf backup.tar.gz
```

Supply the encryption passphrase interactively. Do not set it in shell history.

## Restore practice
The SQL files are recovery material, not a push-button restoration. Before relying on backups, restore into a disposable test PostgreSQL/Supabase environment, verify important table counts and relations, and document any additional Auth or Storage recovery procedures. Never rehearse against the live database.

## Schedule/retention changes
Daily archive retention: `retention-days: 30`. Monthly archive retention: `retention-days: 90`. Adjust according to the private repository or organisation's maximum retention policies. For longer-term retention, separately upload encrypted monthly archives to independent private storage.
