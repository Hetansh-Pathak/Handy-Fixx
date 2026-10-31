# Staging project (handyfix-staging)

A second Supabase project to test the whole branch (KYC, payments, push, dispatch, security proposals) without touching the live data.
Project ref `keukwovrtsenndtjejcp`, region Mumbai. Both scripts REFUSE to run against the live project.

1. Dashboard of the STAGING project > Project Settings > Database > reset the database password (use letters and digits only).
   Then press **Connect** > **Session pooler** and copy the connection string.
2. In PowerShell:
   ```powershell
   cd D:\Handy-Fixx-Ritesh\supabase\staging
   npm install
   $env:STAGING_DB_URL = "postgresql://postgres.keukwovrtsenndtjejcp:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
   node apply-sql.mjs out/schema.json     # the live structure + the public service catalogue (no customer / pro data)
   node apply-proposals.mjs               # the 14 proposals live does not have yet, then the security proposals A, D, E, B, C
   ```
3. `out/` is rebuilt from the live catalog when needed and is not committed.
