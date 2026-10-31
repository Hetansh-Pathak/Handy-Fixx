# Security changes before the VAPT (branch `hetansh2`, 2026-10-31 / 2026-11-01)

**Nothing in this document is applied or deployed.** Every database change is a proposal file in `supabase/proposals/`
with a dry run (ends in `ROLLBACK`) and an apply file in `supabase/dryrun/`. Every function change is in
`supabase/proposals/functions/` and is not deployed. The live project was only read (catalog queries, no row data).
Findings and their status: [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md).

Owner decisions applied (locked, 2026-10-31): fee model and instant dispatch untouched; masked calling not in v1;
KYC = PAN + selfie + bank / UPI name match; Aadhaar no longer collected; PAN stored only encrypted; PAN card photo and
selfie kept; Aadhaar photos deleted after approval unless legal hold.

## 1. What changed and why

### A. `20261125000000_security_hardening` (findings C1, C2, C3, H1, M1, M4, L1)
| Change | Why |
|---|---|
| Dropped live policies `public_read_providers` and `Anyone can view active online providers` on `service_providers` | Anyone with the public anon key could read every pro's phone, email, date of birth, bank account, UPI id, earnings (C1). Own-row, admin and the `public_providers` view keep working. |
| `REVOKE EXECUTE ON confirm_user_email(text)` from PUBLIC, anon, authenticated | SECURITY DEFINER function that confirmed any email (C2). |
| `provider_otp_codes`: client policies and grants removed, plain codes cleared, new columns `code_hash, salt, attempts, locked_at, consumed_at, ip_hash`; new `otp_rate_events` table; service-role functions `otp_rate_take`, `provider_otp_take_attempt`, `provider_otp_consume` | A pro could insert their own code row for any email, or read the code back, and "verify" an email they do not own (C3). |
| `notify_provider_on_booking()` made SECURITY DEFINER, then the four "anyone may insert" notification policies dropped | Anyone could write notifications (and, once push is on, phone alerts) to any user (H1). The trigger needed the open policy, so it is fixed first (the test books a job and checks the notice still arrives). |
| Storage: pros may replace / delete KYC photos only while `not_submitted` or `rejected` | A pro could swap the selfie after approval or delete evidence (M1). |
| Admin / KYC functions and sensitive tables no longer reachable by `anon` | M4. |
| `SET search_path` on 5 helper functions | L1, no logic change. |

Functions (not deployed): `send-provider-otp`, `verify-provider-otp` (HMAC-SHA256 with `OTP_HMAC_KEY` and a per-code
salt, 10 minute expiry, 5 attempts then lock, constant-time compare, single use, limits per account / email / IP, uniform
6-digit codes), `send-welcome-email` (signed-in only, mails only the caller's own login email, escaped name, once a day).
Shared code: `functions/_shared/{crypto,http,otp}.ts`.

### B. `20261125000001_kyc_pan_encryption` (finding H3)
- `provider_kyc`: `pan_encrypted, pan_nonce, pan_key_version, pan_last4, pan_blind_index` (unique), `phone_blind_index`,
  `bank_name_blind_index`, `legal_hold`, `legal_hold_reason`, `photos_deleted_at`; a CHECK that the PAN columns are all
  set or all empty (the first version of this check let a half-filled row through; the test caught it).
- Apps can read only harmless columns (`pan_last4`, photo paths, consent, hold flag) and write only photo paths and
  consent. A trigger refuses server-only columns even if someone grants them by mistake later.
- `kyc_access_log` (append-only, admins read), `kyc_blocklist` (HMAC hashes only), `kyc_settings`
  (`photo_retention_days = 30` **placeholder**, photo kinds deleted = Aadhaar front and back only).
- Admin helpers: `log_kyc_document_view`, `admin_blocklist_provider`, `admin_set_kyc_legal_hold`.
- `submit_kyc` no longer requires Aadhaar; it requires encrypted PAN, PAN photo, selfie, consent, and refuses blocklisted
  PAN / phone / bank-account-name hashes.
- Retention: `kyc_retention_due`, `kyc_retention_mark_done` (re-checks the legal hold under a row lock), daily pg_cron job
  `kyc-retention` at 03:15 IST that calls the Edge Function (which deletes the files through the Storage API, because SQL
  cannot delete storage objects).
- Saved wizard progress of unfinished applications moves down one step, once (the wizard lost a step).

Functions (not deployed): `kyc-pan` (the only place a PAN is accepted; AES-256-GCM, fresh 96-bit nonce per value,
provider id as additional authenticated data, key version for rotation; answers with the last 4 characters only),
`kyc-admin-reveal-pan` (admins only, reason required, view logged **before** the PAN is returned, 30 views an hour per
admin, `Cache-Control: no-store`), `kyc-retention` (shared-secret header, skips legal hold). Shared code
`_shared/pan-crypto.ts`.

### C. `20261125000002_kyc_drop_plain_columns`
Drops `pan_number`, `aadhaar_last4`, `aadhaar_hash`, `aadhaar_front_path`, `aadhaar_back_path`, the old plain-PAN unique
index, and (if proposal A is applied) `provider_otp_codes.otp_code`. **It refuses to run (error, nothing changed) while any
plain PAN or Aadhaar value is left**, so it cannot lose data by running early.

### D. `20261125000003_permissions_hardening` (findings M4, M5, M8, M9, L2, L5, L6)
Written after reading every live policy, grant and function on 2026-11-01. The apps send every signed-out visitor to the sign-in
screen, so the `anon` role (what the public key alone gives) needs almost nothing.
| Change | Why |
|---|---|
| `anon` keeps SELECT on 8 public catalogue objects (services, sub-items, pro services / pricing / availability, reviews, pincode map, `public_providers`) and INSERT on the 2 public forms (`contact_messages`, `pro_applications`); nothing else | Before, `anon` had ALL on every table and row-level security was the only barrier. Coupons are no longer public. |
| `anon` can execute no function; the 45 trigger functions can be executed by nobody; new tables / functions are no longer granted to `anon` or PUBLIC by default | Before, 43 trigger functions and 8 server functions were callable by anyone. Signed-in users keep exactly the functions they had. |
| `provider_launch_active` closed to signed-in users | Internal helper (only server functions call it) that told anyone whether a pro is in the fee-free launch period. |
| RESTRICTIVE insert rule on `bookings`: `customer_id` and `user_id` must be you | The open rule `users_own_bookings_insert` let a user create a booking for someone else's `customer_id` (it appeared in their list and notified the pro). |
| RESTRICTIVE insert rule on `booking_attachments`: only on your own booking | Any signed-in user could attach a file to any booking id; the booking's pro could open it. |
| `booking-attachments`: 10 MB and the 13 photo / audio types the app stores; `booking-extras`: 10 MB | No limits before. |
| `customer_otp_codes` (old, unused) closed | Signed-in users could write their own rows. |

Not in D (apply the existing, already-reviewed proposals separately): chat `20261110` and reviews `20261108`; both drop loose live
policies whose names match the live database.

### E. `20261125000004_booking_integrity` (findings W1, W2, W3; found by the attack walkthrough)
| Change | Why |
|---|---|
| `BEFORE INSERT` trigger `zz_guard_booking_insert`: a booking from the app must start `pending`; payment status, completion / start / cancel / arrival times and positions, coupon and final amount, tracking, unread counters, dispatch state and `created_at` are reset | The money and status guards only fire on UPDATE. A customer could create a booking already `completed`, `confirmed` or `paid`: fake reviews and disputes against any pro, no 3% fee, a job forced on a pro. The app sends none of these columns. The server (definer functions, SQL editor) is not affected; admins signed in to the app are not exempt. |
| `generate_booking_completion_code` uses `gen_random_uuid()` instead of `random()` | Secure source for the 4-digit code (still 5 guesses then a 15-minute lock). |
| `add_booking_extra`: the bill photo must be `<your auth id>/<this booking id>/...` and may not contain `..` | A pro could name any file path; the storage rule lets a booking's parties read a file that one of its extras names. |

### One-time script (not run): `supabase/proposals/scripts/kyc-migrate-pan.ts`
Dry run by default; `--apply` encrypts every plain PAN and clears the plain value in the same update, clears Aadhaar
numbers / hashes / paths and deletes every `aadhaar_*` file in the bucket (also older retakes). Idempotent. Invalid,
duplicate and mismatching PANs are reported and left for a person. Logic in `kyc-migrate-pan-core.ts` (tested).

### App changes (all KYC / Aadhaar code removed)
- `packages/shared/src/kyc/`: 8 steps; Aadhaar validation, masking, salt and `hashAadhaar` (`sha256.ts`) deleted; new
  `identity.ts` (PAN normalise / last 4 / mask, blind-index input strings, `bankNameMatch`); wizard rules and PAN step use
  "PAN already saved" instead of the PAN; `TERMS_VERSION` v1.2 -> **v1.3**; Partner Agreement clauses 1, 2 and 8 rewritten.
- Legal documents: `LEGAL_VERSION` 1.0 -> **1.1** (updated 1 November 2026), privacy policy and deletion text say PAN is
  stored encrypted, Aadhaar is not collected, identity photos are cleaned up after approval. `site/*.html` regenerated.
- Pro app: Aadhaar step and checklist line removed; the PAN is sent once to `kyc-pan`, never stored in the app, shown as
  `XXXXXX234F`; submit calls `kyc-pan` `prepare_submit` (phone / bank-name hashes, blocklist) then `submit_kyc`.
- Admin app: last 4 of the PAN, a **logged** "Show full PAN" button (asks why, shows for 30 s), payout-name match hint
  (match / partly / no match), Aadhaar fields and photos removed, rejection reason "Bank or UPI name does not match".

## 2. SQL files and the order to apply them

| Order | Proposal | Dry run | Apply |
|---|---|---|---|
| 1 | `20261125000000_security_hardening_PROPOSAL_NOT_APPLIED.sql` | `dryrun/25_security_hardening_DRYRUN.sql` | `dryrun/apply_25_security_hardening_COMMIT.sql` |
| 2 | `20261125000001_kyc_pan_encryption_PROPOSAL_NOT_APPLIED.sql` | `dryrun/26_kyc_pan_encryption_DRYRUN.sql` | `dryrun/apply_26_kyc_pan_encryption_COMMIT.sql` |
| 3 | `20261125000002_kyc_drop_plain_columns_PROPOSAL_NOT_APPLIED.sql` | `dryrun/27_kyc_drop_plain_columns_DRYRUN.sql` | `dryrun/apply_27_kyc_drop_plain_columns_COMMIT.sql` |
| any time after 1 | `20261125000003_permissions_hardening_PROPOSAL_NOT_APPLIED.sql` | `dryrun/28_permissions_hardening_DRYRUN.sql` | `dryrun/apply_28_permissions_hardening_COMMIT.sql` |
| any time | `20261125000004_booking_integrity_PROPOSAL_NOT_APPLIED.sql` | `dryrun/29_booking_integrity_DRYRUN.sql` | `dryrun/apply_29_booking_integrity_COMMIT.sql` |

Also listed in `supabase/APPLY_PLAN.md` (rows 11-13). A is independent of the others; B and the `kyc-pan` function need A's
`otp_rate_take`; C needs B and the script.

## 3. New secret names (names only; create the values yourself)

| Secret | Used by | Notes |
|---|---|---|
| `OTP_HMAC_KEY` | send / verify-provider-otp, send-welcome-email | 32 random bytes |
| `KYC_PAN_KEY` | kyc-pan, kyc-admin-reveal-pan, the migration script | 32 random bytes (AES-256). **Losing it makes every saved PAN unreadable.** |
| `KYC_PAN_KEY_VERSION` | same | optional, default 1; raise on rotation |
| `KYC_PAN_KEY_V1`, `_V2`... | same | old keys kept so old rows stay readable after a rotation |
| `KYC_PAN_HMAC_KEY` | same | 32 random bytes; blind indexes. Changing it means re-indexing every row (no script written). |
| `KYC_RETENTION_SECRET` | kyc-retention | 32+ characters; the same value goes into the vault as `kyc_retention_secret` |

## 4. Commands

Create keys (any machine; keep them in your password manager, never in the repo):
```bash
openssl rand -base64 32     # run four times: OTP_HMAC_KEY, KYC_PAN_KEY, KYC_PAN_HMAC_KEY, KYC_RETENTION_SECRET
supabase secrets set OTP_HMAC_KEY=... KYC_PAN_KEY=... KYC_PAN_KEY_VERSION=1 KYC_PAN_HMAC_KEY=... KYC_RETENTION_SECRET=... --project-ref jviwwhjwtyneqrguumro
```
Vault secret for the retention job, in the SQL editor: `select vault.create_secret('<KYC_RETENTION_SECRET value>', 'kyc_retention_secret');`
and turn on the `pg_net` extension (Database > Extensions), otherwise the daily job quietly does nothing.

Deploy (after the matching SQL):
```bash
supabase functions deploy send-provider-otp verify-provider-otp send-welcome-email --project-ref jviwwhjwtyneqrguumro
supabase functions deploy kyc-pan kyc-admin-reveal-pan --project-ref jviwwhjwtyneqrguumro
supabase functions deploy kyc-retention --no-verify-jwt --project-ref jviwwhjwtyneqrguumro
```
(The function folders import `../_shared/`; deploy from `supabase/proposals/functions` as the functions directory, or copy
the folders into `supabase/functions/` first, as `docs/PAYMENTS_SETUP.md` does for the payment functions.)

Rollback: each SQL file ends with a ROLLBACK section (policies / grants to restore). Proposal C cannot be undone
(dropped values are gone). Redeploy the previous function versions from the dashboard if a new one misbehaves.

## 5. Test results (real output, 2026-11-01)

| Check | Result |
|---|---|
| SQL on a throwaway Postgres 17 (`supabase/tests/security`, `npm run test:sql`) | **124 / 124 passed** + **112 / 112 attack walkthrough** (`test-attacks.mjs`: the live bookings / payment rules, each hole reproduced then closed by A + D + E) (proposals A, B, C, D applied twice and in order, dry-run and apply files, attacks, retention, blocklist, unique blind index, columns gone, anon locked out, booking / attachment ownership). The tests reproduce each hole first, then show it closed; they caught two mistakes in D (new functions still granted to everyone) before it was ever applied |
| Function code against fakes (`npm run test:edge`): OTP, welcome mail, AES-GCM round trip, tampering, wrong key, 20,000 nonces, rotation, kyc-pan / reveal / retention handlers, migration script | **43 / 43 passed** (31 + 12 on the real Razorpay webhook file: forged, tampered, unsigned, replayed, wrong amount, database error, missing secret); `npm run typecheck` (strict tsc) clean |
| `npm run test` (packages/shared Vitest) | **925 / 925 passed** (71 files) |
| `npm run typecheck`, `npm run mobile:typecheck` | clean |
| `npm run lint` | 0 errors, 7 warnings (same 7 as before this work, all in the admin app) |
| `npm run build` | passes (the existing admin chunk-size notice only) |
| Browser suites (`apps/mobile/e2e-web`, mocked backend) | **8 suites, 220 checks, 0 failures** (auth 30, booking 32, provider 36, status 28, wallet 24, features 39 incl. the new no-Aadhaar KYC flow, services 17, booking-payment 14). The two instant-dispatch suites need a different dev-server setting and do not touch KYC; not run |
| `npm audit` | root: 23 findings (2 critical + 1 high in dev tools: vitest / tinypool / vite; **runtime: `zod` high, `react-router-dom` moderate**); mobile: 14 (`@expo/cli` high is build tooling, `zod` high); the two new test packages: 0. Fixes are major version bumps, **not done** |
| Secret scan (grep; gitleaks is not installed here) | clean: no private keys, payment keys, service-role JWTs, or committed `.env` / keystores in the tree or the git history. The only keys in the tree are the public anon keys in `.env.example` files |

Honest limits: the function tests run on Node's Web Crypto (the same API Deno exposes) and were not run on Deno itself; the
SQL tests use a stub of the live schema copied from read-only catalog queries, not the live database; pg_cron / pg_net
were stand-ins.

## 6. NOT done (listed in SECURITY_FINDINGS.md)
- Apply existing proposals `20261110` (chat: anyone can post into any chat) and `20261108` (reviews) (H4, H5).
- Bank account numbers / UPI ids in plain text (M2); booking UPDATE policies rely on guard triggers (M3: let the VAPT
  try); leftover `customer_otp_codes` and `service_providers.phone_otp*` (M5); leaked-password protection (M6, dashboard).
- Customer email OTP uses unsalted SHA-256 (L4); no size / type limit on two storage buckets (L2); no rate limit on
  anonymous inserts (L3); GraphQL schema visible to `anon` (L5); `has_role` callable by `anon` (L6).
- `zod` high and `react-router-dom` moderate (runtime) dependency updates; dev-tool vulnerabilities.
- A script to re-encrypt PANs after a key rotation, and to re-index after changing `KYC_PAN_HMAC_KEY`.
- The pro / admin app could still be tampered with on a rooted phone; the PAN protection is on the server.

## 7. What you must do by hand
1. **Back up** (Supabase > Database > Backups) before each SQL step. Apply in a branch if you can.
2. Create the four keys above, store them in your password manager and as Edge Function secrets. Back up `KYC_PAN_KEY`
   and `KYC_PAN_HMAC_KEY` somewhere safe and separate: without them saved PANs cannot be read.
3. Order: **A dry run -> A apply -> deploy the 3 functions -> delete the stray functions `quick-function` and
   `bright-handler` in the dashboard -> B dry run -> B apply -> deploy the 3 KYC functions -> release the new Pro build and
   deploy the new admin site (both must go out with B: the old builds read the dropped PAN columns) -> run the script
   (dry run first, read the report, then `--apply`) -> C dry run -> C apply.**
4. After A, run the SQL tests' attacks once by hand on live as a signed-out visitor (read `service_providers`, call
   `confirm_user_email`) to see them refused.
5. Treat the contact and bank details of every pro as having been readable by anyone until A is applied (C1). Ask your lawyer
   whether pros must be told. Rotate any service-role key, Razorpay secret or Brevo key that was ever pasted in a chat,
   ticket or screenshot (none was found in the repo).
6. Dashboard: turn on leaked-password protection (Auth > Passwords).
7. **Confirm with a lawyer:** the photo retention period (30 days is a placeholder, `kyc_settings.photo_retention_days`),
   that not collecting Aadhaar is enough for your case, how long PAN and the PAN photo / selfie may and must be kept, and the
   new privacy text (version 1.1) and Partner Agreement (v1.3). The new privacy text promises the cleanup job: publish it
   together with B.
8. Pros who were mid-application keep their answers: the script encrypts any PAN they already saved, so nobody types it
   again, except that someone who had only reached the old Aadhaar step simply continues one step earlier. Pros already
   approved are not asked anything.
