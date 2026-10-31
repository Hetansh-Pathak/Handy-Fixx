# Staging project (handyfix-staging)

A second Supabase project to test the whole branch (KYC, payments, push, dispatch, the security proposals) without touching the
live data. Project ref `keukwovrtsenndtjejcp`, region Mumbai. Every script here REFUSES to run against the live project.
It holds the live STRUCTURE and the public service catalogue only: no customer, pro or payment data.

## What is on it (set up 2026-11-01)
- A copy of the live structure (806 statements, extracted from the live catalog; 19 of 19 fingerprints match, one CHECK rule is
  printed with different brackets only).
- The 14 proposals the live project does not have yet, then the security proposals A, D, E, B, C (all applied, no failure).
- Its OWN fresh secrets (`OTP_HMAC_KEY`, `KYC_PAN_KEY`, `KYC_PAN_KEY_VERSION`, `KYC_PAN_HMAC_KEY`, `KYC_RETENTION_SECRET`; values in
  `out/staging-secrets.env`, not committed) and the vault entry `kyc_retention_secret`.
- Edge Functions: `kyc-pan`, `kyc-admin-reveal-pan`, `kyc-retention`, `send-provider-otp`, `verify-provider-otp`, `send-welcome-email`.
  Not deployed: payments, push, customer OTP (they need Razorpay / Brevo / Expo keys).
- Test accounts (password `Test1234!`, see `out/staging-accounts.txt`): `customer1@example.com` (email verified),
  `pro1@example.com` (approved, wallet Rs 500, GPS in Jamnagar), `pro2@example.com` (approved, wallet Rs 500, no GPS: reproduces the
  "second pro did not get the request" case), `admin1@example.com`.

## Scripts (PowerShell; the password never goes in a file)
```powershell
cd D:\Handy-Fixx-Ritesh\supabase\staging
npm install
$env:STAGING_DB_URL   = "postgresql://postgres.keukwovrtsenndtjejcp:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
$env:STAGING_ANON_KEY = "<staging anon key: Project Settings > API>"
node apply-sql.mjs out/schema.json     # the copy of the live structure (rebuild out/ from the live catalog when needed)
node apply-proposals.mjs               # the pending proposals + the security proposals
node seed-test-users.mjs               # the test accounts above
node e2e-security.mjs                  # 29 end-to-end security checks on real Supabase (KYC, PAN, admin reveal, booking guard)
```

## Run the app against staging (your live .env.local is set aside and put back)
```powershell
cd D:\Handy-Fixx-Ritesh\apps\mobile
npm run start:staging:provider     # http://localhost:8084   (the Pro app)
npm run start:staging:customer     # http://localhost:8083   (the customer app)
```
Settings: `apps/mobile/.env.staging.local` (git-ignored).

## Functions: deploy / redeploy
```powershell
cd D:\Handy-Fixx-Ritesh\supabase\staging\out\deploy      # a copy of supabase/proposals/functions with a config.toml
supabase functions deploy kyc-pan --project-ref keukwovrtsenndtjejcp --use-api
supabase functions deploy kyc-retention --project-ref keukwovrtsenndtjejcp --use-api --no-verify-jwt
```
