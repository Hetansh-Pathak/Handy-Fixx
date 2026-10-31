# Rolling the security work out to the LIVE project (Handy-fix)

Everything here was first run, in this order, on the staging project: 19 steps applied without a failure and 29 end-to-end checks passed.
Nothing here deletes data. The two steps that cannot be undone (the PAN script and proposal C) are deliberately NOT in this folder.

## 0. Before you start
- The live project's connection server is `aws-1-ap-south-1` (staging's is `aws-0`). If you ever see "tenant/user ... not found", you used the wrong one: copy the address from Connect > Session pooler in the dashboard.
- Docker Desktop must be running (the backup uses it). Your live database password: Supabase > Handy-fix > Project Settings > Database
  (resetting it does not affect the apps). Keep it in your shell only; do not paste it into a chat.

## 1. Backup (about 5 minutes)
```powershell
cd D:\Handy-Fixx-Ritesh\supabase\live
npm install
New-Item -ItemType Directory -Force out | Out-Null
$env:LIVE_DB_URL = "postgresql://postgres.jviwwhjwtyneqrguumro:<live password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
supabase db dump --db-url $env:LIVE_DB_URL -f out/live-before-structure.sql
supabase db dump --db-url $env:LIVE_DB_URL --data-only -f out/live-before-data.sql
```
No Docker? Use the script instead (read-only, one JSON file with every table's rows; the structure is the copy taken from the live catalog on 2026-11-01):
```powershell
node backup-data.mjs
Copy-Item ..stagingoutschema.sql outlive-before-structure.sql
```
Then pass `--backup out/live-before-data.json` in step 3.

Both files must exist and be more than a few KB. They stay on your PC (`out/` is not committed). Uploaded photos are not in a database dump.

## 2. See what is pending (changes nothing)
```powershell
node rollout-live.mjs --slice 1 --check
```

## 3. Slice 1: the 14 older proposals + security A, D, E
```powershell
node rollout-live.mjs --slice 1 --apply --backup out/live-before-data.sql
```
It stops at the first failure and prints the message: send it to Claude. Then Claude deploys the hardened functions, and you test the
customer app, the Pro app and the admin site.

## 4. Slice 2: KYC (only when the new Pro app is ready to go out with it)
```powershell
node rollout-live.mjs --slice 2 --check
node rollout-live.mjs --slice 2 --apply --backup out/live-before-data.sql
```

## Going back
Each proposal file in `supabase/dryrun/apply_*` ends with rollback lines. The backup restores everything.
