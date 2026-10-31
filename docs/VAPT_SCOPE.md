# VAPT scope and request pack (draft for the owner to send to auditors)

Phase 6 is yours (you pick and pay the auditor). This file is what you hand over so the quote is accurate and the test is
useful. Edit the bracketed parts. Nothing here contains a secret.

## 1. About the product
HandyFix: a home-services marketplace for tier-2 Indian cities (first city: Jamnagar). Two Android apps from one codebase
(customer "HandyFix", pro "HandyFix Pro"), a web admin site, and a Supabase backend (Postgres with row-level security,
Auth, Storage, Edge Functions, Realtime). Payments: Razorpay (wallet top-ups for pros; customers may pay in the app).

## 2. In scope
| Area | What | Notes |
|---|---|---|
| Customer app (Android) | sign-up / sign-in, booking, instant dispatch, chat, payment, ratings, disputes | a release APK of the frozen build |
| Pro app (Android) | KYC (PAN + selfie + payout name), wallet, requests, job steps, completion code, extras | same build, other variant |
| Admin site | KYC review (logged PAN reveal), payouts, disputes, price bands, fees | the deployed staging site |
| Supabase APIs | PostgREST tables and RPC functions, GraphQL, Auth, Realtime | staging project |
| Storage | buckets `provider-kyc`, `booking-attachments`, `booking-extras`, `avatars` | access control, path handling |
| Edge Functions | OTP and welcome email, KYC PAN save / reveal / retention, wallet top-up, booking payment, Razorpay webhook, push | |
| Payment flow | order creation, signature verification, replay, amount checks, refunds, payouts | Razorpay **test** mode |

## 3. Out of scope
Production data and the live project; Razorpay / Supabase / Google / Expo platforms themselves; social engineering of staff;
physical attacks; denial-of-service load tests (agree a separate, throttled test if wanted).

## 4. Environment you must provide (never the live project)
- A **staging Supabase project** with the final proposals applied in order (`docs/SECURITY_CHANGES.md`) and the secrets set.
- A staging admin site and two release APKs pointing at it. Razorpay in test mode with the webhook pointing at staging.
- Test accounts: 2 customers (one with a completed booking), 2 pros (one approved, one pending KYC), 1 admin, 1 admin-lookalike
  without the role. Share passwords through your password manager, not email; rotate them after the test.
- Seed data: a few services, a Jamnagar price band, a funded pro wallet, one booking in each status.

## 5. Rules of engagement
Written authorisation naming the tester's IP addresses and dates; testing only on staging; no real customer or pro data; stop
and tell us at once if a real user's data is found; no data copied out of staging except in the report; a named contact on our
side who can reset the environment within a few hours.

## 6. What we ask the auditor to cover (beyond the usual OWASP Top 10 / OWASP MASVS)
1. Row-level security: reading, writing and impersonating across customer / pro / admin; every RPC with a booking, extra,
   dispute or payout id you do not own.
2. Booking integrity: creating a booking in a forbidden state, changing money columns, skipping the completion code.
3. Payments: forged, replayed and out-of-order Razorpay events; amount and currency tampering; refund and payout abuse.
4. KYC data: PAN encryption (can a signed-in user read `provider_kyc` secrets?), the admin reveal log, storage access to
   identity photos, the retention job's authorisation.
5. Auth: sign-up, sign-in, reset password deep link, email OTP (customer and pro), Google sign-in, session storage on the device.
6. Mobile: secrets in the APK, logs, backups, deep links, certificate pinning options, rooted-device behaviour.
7. Edge Functions: JWT handling, CORS, input validation, rate limits, error messages.
8. Storage: bucket policies, content types, path tricks, signed URL lifetime.

## 7. Contract points
- Ask for **CERT-In empanelled** auditors only (check the current empanelled list on cert-in.org.in); get a written quote with
  days, tester seniority and tools.
- Include **one free retest** of the high and critical findings after we fix them, within [30] days of the first report.
- Deliverables: a technical report with proof for each finding, CVSS severity, fix advice; an **executive summary you can share**
  (Razorpay, Play Console, partners, investors); a closing letter / certificate after the retest.
- Confidentiality (NDA), data deletion after the test, and a rule that findings are reported to us first.
- Price check: fixed price for the scope above; extra days only if we change the scope in writing.

## 8. Before you send this
1. Apply and test the proposals (A, D, E, then B and C) on staging first, then live.
2. Freeze the build (tag `v1.0-vapt`); test that build only.
3. Hand over the findings and walkthrough docs: `docs/SECURITY_FINDINGS.md`, `docs/SECURITY_ATTACK_WALKTHROUGH.md`. Auditors
   usually give a better quote, and spend their days on new problems, when we have already fixed the known ones.
