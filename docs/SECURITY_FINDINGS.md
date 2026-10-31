# Security findings before the VAPT (2026-10-31)

Read-only review of `supabase/migrations`, `supabase/proposals`, `supabase/functions` and `supabase/proposals/functions`,
plus **read-only catalog queries on the live project** (`jviwwhjwtyneqrguumro`, owner approved 2026-10-31): tables,
RLS flags, policies, grants, function settings, views, buckets, cron jobs, the Supabase security advisor and the
deployed Edge Function list. No row data was read and nothing was changed.

**Why live matters:** several files named `_NOT_APPLIED` are live, and the live database has tables and policies that
exist in no repo file (`public_read_providers`, `admin_users`, `messages`, `coupons`, `customer_otp_codes`, ...).
Where the repo and live disagree, this list follows live.

Status values: **fixed in proposal** (written, NOT applied), **open** (not fixed in this task), **accepted** (by design).

| # | Sev | Finding | Status |
|---|---|---|---|
| C1 | Critical | Every pro's row is readable by anyone | fixed in proposal A |
| C2 | Critical | `confirm_user_email` can be called by anyone | fixed in proposal A |
| C3 | Critical | Provider email OTP can be bypassed | fixed in proposal A + functions |
| H1 | High | Anyone can create notifications (and phone pushes) for any user | fixed in proposal A |
| H2 | High | `send-welcome-email` is an open mail relay with HTML injection | fixed in proposal (function) |
| H3 | High | PAN stored in plain text; Aadhaar hash salt is public; Aadhaar photos kept | fixed in proposal B/C + app |
| H4 | High | Anyone signed in can post into any booking chat | open: proposal `20261110` exists, not applied |
| H5 | High | Anyone signed in can post a review for any pro | open: proposal `20261108` exists, not applied |
| M1 | Medium | A pro can replace or delete KYC photos after submitting or after approval | fixed in proposal A |
| M2 | Medium | Bank account numbers / UPI stored in plain text | open |
| M3 | Medium | Booking UPDATE policies allow any column; safety rests on triggers | open (VAPT should test) |
| M4 | Medium | Admin/KYC functions executable by `anon`; anon has table grants everywhere | fixed in proposal A (sensitive ones) |
| M5 | Medium | Leftover OTP columns/tables readable by their owner (`customer_otp_codes`, `service_providers.phone_otp*`) | open |
| M6 | Medium | Leaked-password protection is off | open (dashboard toggle) |
| M7 | Medium | Stray deployed copies of OTP functions (`quick-function`, `bright-handler`) | open (owner deletes after deploy) |
| L1 | Low | 5 functions without a fixed `search_path` | fixed in proposal A |
| L2 | Low | `booking-attachments` / `booking-extras` buckets have no size or type limit | open |
| L3 | Low | `pro_applications`, `contact_messages` accept anonymous inserts with no rate limit | open |
| L4 | Low | Customer email OTP hash is an unsalted SHA-256 | open |
| L5 | Low | GraphQL schema lists every table to `anon` | open |
| L6 | Low | `has_role(uuid, text)` callable by anyone (tells whether a given user id is an admin) | open |
| A1 | Info | SECURITY DEFINER views `public_providers`, `booking_provider_info` (advisor ERROR) | accepted |
| A2 | Info | `auto_confirm_user` confirms every signup | accepted |
| A3 | Info | `Access-Control-Allow-Origin: *` on Edge Functions | accepted |

## Critical

### C1. Every pro's row is readable by anyone (live only)
- Live policy `public_read_providers` on `service_providers`: `FOR SELECT TO public USING (true)`, and `anon` has SELECT on
  every column. A second policy `Anyone can view active online providers` also opens rows to `public`.
- Exposed with only the public anon key (shipped in every app): `phone`, `email`, `date_of_birth`, `bank_account_name`,
  `bank_account_number`, `bank_ifsc`, `upi_id`, `phone_otp`, `phone_otp_expires_at`, earnings, KYC status and reasons.
- The policy is in no repo file; CLAUDE.md assumes `service_providers` is hidden from customers. The app no longer needs
  it: customers read `public_providers` (a view that runs as its owner) and pros read their own row.
- **Fix (proposal A):** drop both policies; own row and admin policies stay. Legacy web customer app pages that read
  `service_providers` directly would stop showing pros (legacy is being retired).
- **Owner, after applying:** treat this data as already exposed. No key rotation helps (the anon key is public by
  design); ask a lawyer whether pros must be told that their contact and bank details were readable.

### C2. `confirm_user_email(text)` can be called by anyone
- SECURITY DEFINER, `search_path = auth, public`, EXECUTE granted to `anon` and `authenticated` (confirmed live).
  Marks any email as confirmed in `auth.users`.
- Only `legacy/provider-app/src/pages/provider/ProviderLogin.tsx:70` calls it (legacy, not edited; it will get a
  permission error and continue).
- **Fix (proposal A):** `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.

### C3. Provider email OTP can be bypassed
- `provider_otp_codes` live policies let a pro **INSERT** their own code rows and **SELECT** them. A pro can insert a row
  with a code they chose for any email, or read the code back, then call `verify-provider-otp` and get
  `is_email_verified = true` for an email they do not own.
- Codes are stored in plain text, no attempt limit, no lockout, no rate limit, not single-use (an older unverified
  code stays valid), and `Uint32 % ...slice(-6)` is slightly biased.
- A second deployed function `quick-function` (named "verify-provider-otp") is an identical copy and stays callable.
- **Fix (proposal A + `supabase/proposals/functions/send-provider-otp`, `verify-provider-otp`):** drop both client
  policies, clear the plain codes, store HMAC-SHA256 (`OTP_HMAC_KEY`) with a per-code salt, 10-minute expiry, 5 wrong
  tries then lock, constant-time compare, single use, limits per account, per email and per IP.
  **Owner:** delete `quick-function` after the new function is deployed.

## High

### H1. Anyone can create notifications (and phone pushes) for any user
- Live `provider_notifications` INSERT policies `System can insert notifications` (`TO public`, `WITH CHECK true`),
  `System inserts provider notifications` and `allow_authenticated_insert_provider_notifications` (`TO authenticated`,
  `true`); `customer_notifications` policy `cust_notif_insert` (`TO authenticated`, `true`). With `anon` table grants,
  even a signed-out caller can write a notification to any pro. Once push is on, each row becomes a phone alert:
  a ready-made phishing channel ("Your wallet is blocked, call ...").
- **Trap found:** the live trigger `notify_provider_on_new_booking` on `bookings` calls `notify_provider_on_booking()`,
  which is **not** SECURITY DEFINER, so it inserts as the customer and depends on these open policies.
  Every other notification writer is SECURITY DEFINER (checked live).
- **Fix (proposal A):** make `notify_provider_on_booking()` SECURITY DEFINER with a fixed `search_path` first, then drop
  the four open policies. No app code inserts notifications (checked).

### H2. `send-welcome-email` is an open mail relay
- Takes `email` and `display_name` from the request body and sends HandyFix-branded mail through Brevo. Any valid JWT is
  enough, and the public anon key is a valid JWT. `display_name` goes into the HTML unescaped.
- **Fix (`supabase/proposals/functions/send-welcome-email`):** require a signed-in user, send only to that user's own
  email, escape the name, one email per user per event.

### H3. KYC data
- `provider_kyc.pan_number` is plain text with a unique index on the plain value; the Pro app reads it back and the admin
  app reads it. `aadhaar_hash` is SHA-256 with a salt shipped in the app (`AADHAAR_HASH_SALT`), so the 12-digit number
  can be recovered by brute force. Aadhaar front/back photos are kept in `provider-kyc`.
- **Fix (proposal B + C, Edge Functions, one-time script, app changes):** see `docs/SECURITY_CHANGES.md`.

### H4. Anyone signed in can post into any booking chat
- Live `messages_insert` checks only `sender_id = auth.uid()`; permissive policies are OR-ed, so the stricter
  `messages_participants_insert` does not help. Proposal `20261110` drops it. **Open: apply `20261110`.**

### H5. Anyone signed in can post a review for any pro
- Live `Customers can create reviews` (`auth.uid() = customer_id`) and `auth_insert_review` (`auth.uid() = user_id`) do
  not check the booking. Proposal `20261108` drops them. **Open: apply `20261108`.**

## Medium

- **M1. KYC photos editable after submission.** Storage policies `Providers can update own KYC docs` and
  `Providers can delete own KYC docs` have no status check (upload does). A pro can swap the selfie after approval or
  delete evidence. **Fixed in proposal A:** update and delete only while `kyc_status` is `not_submitted` or `rejected`.
- **M2. Bank details in plain text** (`service_providers.bank_account_*`, `upi_id`, copied into `payout_requests`).
  Same encryption pattern as PAN later. Open.
- **M3. Booking UPDATE policies** (`bookings_customer_update`, `bookings_participants_update`, ...) let a party update
  any column; live guard triggers (`guard_booking_update`, `guard_booking_money_columns`) are the real defence. Open:
  the VAPT should try changing price, status and provider_id as a customer.
- **M4. `anon` can execute** `admin_approve_kyc`, `admin_reject_kyc`, `admin_get_dashboard_counts`, `submit_kyc`,
  `confirm_user_email`, `provider_launch_active`, `provider_response_times`. The admin ones check `has_role` inside, so
  they fail today, but nothing signed-out should reach them. **Fixed in proposal A** (revoked from `anon`; sensitive
  tables also lose their `anon` grants: `provider_kyc`, OTP tables, admin tables, `user_roles`, `payout_requests`).
- **M5. Leftover OTP data:** `customer_otp_codes` (phone OTP, plain text, owner can read and write its own rows) and
  `service_providers.phone_otp*` are used by no current code. Open: drop after confirming legacy is gone.
- **M6. Leaked-password protection off** (advisor). Open: Supabase dashboard > Auth > Passwords.
- **M7. Stray functions:** `quick-function` (old provider OTP verifier, see C3) and `bright-handler` (a copy of
  `verify-customer-otp`). Open: owner deletes both after the hardened functions are deployed.

## Low

- **L1.** No fixed `search_path`: `dispatch_events_append_only`, `dispatch_km`, `fee_for_service_bill`,
  `reset_booking_extras_on_insert`, `wallet_tx_immutable` (none is SECURITY DEFINER). **Fixed in proposal A.**
- **L2.** `booking-attachments`, `booking-extras` buckets: no size or mime limit (voice notes and photos). Open.
- **L3.** `pro_applications` and `contact_messages` take anonymous inserts with no rate limit (spam). Open.
- **L4.** Customer OTP stores `sha256(user_id:code)`, unsalted with a secret, so a leaked table reveals codes quickly;
  codes live 10 minutes and are deleted after use. Open (same HMAC change as the provider OTP).
- **L5.** `pg_graphql` lists all table names to `anon`. Open: revoke `graphql` schema usage from `anon` if unused.
- **L6.** `has_role` callable by `anon`; policies use it, so revoking needs a careful test. Open.

## Accepted

- **A1.** `public_providers` (public pro card fields only, approved and active pros) and `booking_provider_info`
  (filtered by `auth.uid()`, phone only during an active booking) are views that run as their owner on purpose.
- **A2.** Email confirmation is off and `auto_confirm_user` confirms signups; customers verify through the OTP flow
  (`is_customer_email_verified()`, a RESTRICTIVE booking policy, confirmed live).
- **A3.** CORS `*` on Edge Functions: they use bearer tokens, not cookies.

## Edge Function auth (repo + live)

| Function | Gateway JWT (live) | Auth inside | Notes |
|---|---|---|---|
| send/verify-customer-otp | on | `auth.getUser()` | OK (L4) |
| send/verify-provider-otp | on | `auth.getUser()` + owns provider row | C3 |
| send-welcome-email | on | none | H2 |
| create-qr-payment | **off** | `auth.getUser()` + provider row | OK: checks itself |
| close-booking-qr | on | `auth.getUser()` | OK |
| create-wallet-topup-order, verify-wallet-payment | on | `auth.getUser()` | OK |
| create-booking-payment-order, verify-booking-payment | (not deployed) | `auth.getUser()` | OK |
| razorpay-webhook | off | HMAC `x-razorpay-signature` | OK |
| notify-push | off | shared secret header, constant-time | OK |
| delete-account (proposal) | – | `auth.getUser()` | OK |
| quick-function, bright-handler | on | copies | M7 |

## Live cron jobs (for reference)
`dispatch-tick` every 3 s; `expire-stale-bookings` every minute (cancels pending bookings after 30 minutes; the owner
decided requests stay open, proposal `20261118` replaces it; not a security item).
