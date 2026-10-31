# Changes: one job at a time, and the name apnabanda (2026-11-01)

Branch `hetansh2`. Two slices, one commit each, then this document. **Nothing is pushed and nothing was applied to the live
Supabase project.** The new SQL is a proposal; the new wording is in the repo and reaches phones only with the next app build.

---

## Slice 1: a pro cannot have two jobs at the same time

### The rule
A pro who is **busy** cannot accept, or be offered, another job until the current one ends. Busy means:

- the pro has a booking that is `on_the_way`, `arrived` or `in_progress` (at any time of day), or
- the pro has a **confirmed** booking whose window overlaps the new request. The window is the booked start, plus the service duration
  (`services.duration_minutes`, **60 when empty**), plus a **30 minute travel buffer** on both sides (`TRAVEL_BUFFER_MINUTES`).
  A job that ends exactly one buffer before the new start does not conflict. A confirmed job on another day, or at a clearly
  different time, does not block.
- cancelled, completed and pending jobs are ignored. A confirmed job or a request without a readable time is ignored (the rule needs a
  time to compare); an active job still blocks.

The start time is `booking_date + booking_time`, falling back to `scheduled_date + scheduled_time` (the app writes both).

### Where it lives
| What | File |
|---|---|
| The rule (one place) | `packages/shared/src/booking/provider-busy.ts` (`providerBusy`, `BUSY_STATUSES`, `TRAVEL_BUFFER_MINUTES`, `DEFAULT_JOB_MINUTES`) |
| Joined into the accept decision | `packages/shared/src/provider/request-access.ts`: `requestAccess({ ..., busy })` returns `state: "busy"` (checked before the wallet) |
| The server twin | `supabase/proposals/20261126000000_one_job_at_a_time_PROPOSAL_NOT_APPLIED.sql` |
| Dry run / apply | `supabase/dryrun/30_one_job_at_a_time_DRYRUN.sql`, `supabase/dryrun/apply_30_one_job_at_a_time_COMMIT.sql` |

### The SQL proposal (NOT applied)
1. `provider_busy_core` / `provider_busy_conflict`: the rule in SQL. Not callable by the apps (`service_role` only).
2. `providers_busy_at(provider_ids, date, time, service_id)`: lets the **customer** app mark busy pros. Returns ids only, no job details.
   Signed-in users only, not `anon`.
3. `enforce_one_job_at_a_time`: a BEFORE UPDATE trigger on `bookings`. On pending to confirmed by a busy pro it raises, with code `P0001`,
   **"You already have a job at this time. Finish it first."** It takes `pg_advisory_xact_lock` on the provider first, so two accepts at the
   same moment cannot both win: the second waits, then sees the first job. It runs **before** the wallet check (trigger names sort that way),
   so a busy pro is never charged a fee hold.
4. `dispatch_candidates` is recreated from `20261124000001` with **one added line** (`AND public.provider_busy_conflict(sp.id, b.id) IS NULL`),
   so busy pros get no offer.

`accept_dispatch_offer` (instant dispatch first-accept) is **not changed**: it already catches the trigger's error and answers
`{ result: "refused", message }`, which the app shows. A busy pro therefore cannot win an offer.

**Order to apply (you run these, in the Supabase SQL editor):** it needs `20261114000000` (wallet accept check) and
`20261124000000` + `20261124000001` (instant dispatch) already applied. Then `supabase/dryrun/30_one_job_at_a_time_DRYRUN.sql` (every
column of the last SELECT must be `true`, nothing is saved), then `supabase/dryrun/apply_30_one_job_at_a_time_COMMIT.sql`. Row 16 of
`supabase/APPLY_PLAN.md`. Rollback is at the end of the proposal.

### The app
- **Pro request popup, request page and Jobs list**: a busy pro sees "Finish your current job first" with a button that opens the current job,
  instead of an Accept button. The request stays in Jobs > New; Decline still works. (`RequestPopup.tsx`, `job/[id].tsx`, `jobs.tsx`.)
- The Pro runtime now keeps the pro's own jobs (same cache as the Jobs tab, refreshed every 30 s and on every booking change) and exposes
  `busyOf(booking)`.
- **Customer list**: a pro who is on a job right now shows "On a job right now. Pick a later time when you book." The booking screen checks the
  chosen day and time with `providers_busy_at` and says "<pro> already has a job at this time. Pick another time, or another pro." (`catalog-api.ts`
  `fetchBusyProviderIds`). Before the proposal is applied the call fails quietly and nobody is marked busy.
- `isProviderAvailable` (presence) is unchanged. Server messages go through `friendlyDbError`.

### Tests for slice 1
- Vitest `provider-busy.test.ts` (rule: no jobs, each active status, overlapping and non-overlapping confirmed, other day, ignored statuses,
  boundary minutes both sides, missing or invalid duration, missing times, `HH:MM:SS`) and `provider-busy-sql.test.ts` (the SQL says the same
  statuses, buffer, default duration, message, lock order).
- **Throwaway real Postgres 17** `supabase/tests/instant-dispatch/test-one-job.mjs`: **38 checks**, including a busy pro refused with the plain
  message on the direct accept and on `accept_dispatch_offer`, no offer for busy pros, the busy check running before the wallet check, and
  **two sessions accepting at the same moment** (6 of 6 rounds on direct accepts, 4 of 4 on instant-dispatch offers: exactly one wins). With
  the lock line deleted the same tests fail 0 of 6 and 0 of 4, so the race tests are real. `test-one-job-dryrun.mjs` runs the dry-run file
  (every check true, nothing saved) and the COMMIT file (saves). Run: `cd supabase/tests/instant-dispatch && npm test`.
- Browser (`apps/mobile/e2e-web/provider-flow.cjs`, 41 checks): the busy popup, the request page with Accept disabled, the link to the current
  job, accepting after the first job completes, and the mock server refusing an overlapping accept with the plain message.

### Not done / limits of slice 1
- The instant-dispatch full-screen offer does not pre-check busy; a pro who became busy after the offer was made taps Accept and is refused
  with the message (the server is the authority).
- The server rule runs when a request is **accepted**. A customer can still send a request to a pro who is busy at that time (the app warns the
  customer, but a stale list or another app version can send it); the pro then cannot accept it.
- A pro with a confirmed job can still tap "Start trip" on it while another confirmed job exists at a different time (only accepting is guarded).
- The app's own busy check uses the pro's newest 100 bookings; the database check uses all of them.

---

## Slice 2: HandyFix becomes apnabanda in everything a person can read

Customer app **apnabanda**, pro app **apnabanda Pro** (the PRO badge on the logo is unchanged). Logo files and the themes were not touched.

### The one place for the name
`packages/shared/src/brand.ts`: `APP_NAME` ("apnabanda"), `APP_NAME_PRO` ("apnabanda Pro"), `SUPPORT_NAME`, `PLATFORM_FEE_LABEL` ("apnabanda fee"),
and `brandServerText()`. The fee label, legal operator and page title, push wording, the Partner Agreement title, the About screen and the
fee lines now use these constants. Long prose (help answers, legal paragraphs, emails) is plain text that was reworded in place; the test below
keeps all of it honest. A later rename is one edit in `brand.ts` plus the identifiers listed under "intentionally unchanged".

### What changed
- **248 occurrences of the old name in 87 files** (about 190 visible lines; the rest are tests and generated pages). Examples:
  `About HandyFix` to `About apnabanda` (About screens, profile menus) · `HandyFix fee` to `apnabanda fee` (request popup, job page, wallet, offer alert, ledger) ·
  `Open HandyFix Pro` / `Open HandyFix` to `Open apnabanda Pro` / `Open apnabanda` (account-of-the-other-app screen, push notifications) ·
  `Call HandyFix` / `Email HandyFix` to `Call apnabanda` / `Email apnabanda` (closing-problem help) ·
  `Welcome to HandyFix` and `Your HandyFix verification code` to the apnabanda versions (welcome and OTP emails) ·
  the permission texts in `app.config.ts` (microphone, location, camera, photos) · the Terms, Privacy, deletion pages and the Partner Agreement ·
  `HandyFix Operations` to `apnabanda Operations` (admin) · the Razorpay order name `HandyFix #...` to `apnabanda #...` · the README and the `env:check` output.
  The remaining visible mentions are only the support mailbox and domain.
- **Not rewritten here but shown renamed:** messages and notes written by the **database** (applied SQL cannot be edited). `friendlyDbError` and
  the wallet history pass them through `brandServerText`, so "HandyFix has not set a price range for this job yet." reads "apnabanda has not set a
  price range for this job yet." and the ledger note "HandyFix fee (3%) for completed job" reads "apnabanda fee (3%) ...". The database text itself
  still says HandyFix (see "Not done").
- **Fee lines** now say "apnabanda fee". **The fee itself is untouched:** customers pay ₹0 platform fee; the pro pays 3% (min ₹5, max ₹50).
- **Versions bumped:** `TERMS_VERSION` v1.3 to **v1.4** (Partner Agreement text, stored with each pro's consent; nobody is forced to re-accept),
  `PARTNER_TERMS_EFFECTIVE` "November 2026", `LEGAL_VERSION` 1.1 to **1.2** (privacy, terms and deletion pages).
- **Generated files re-built:** `site/*.html` (`npm run legal:build`) and `supabase/proposals/functions/notify-push/shared-push.js` (`npm run push:build`).

### The guard test
`packages/shared/src/brand.test.ts` scans the source of the apps, admin, shared, edge functions, scripts, the browser tests and the README and
**fails if "HandyFix", "Handy Fix" or "handy-fix" appears** outside comment lines and the allow-list of technical identifiers below. It also
proves its own regex would catch a regression.

### Intentionally unchanged (technical identifiers)
| Identifier | Where | Why it stays |
|---|---|---|
| `in.handyfix.app`, `in.handyfix.pro` | `app.config.ts` (Android package) | **Cannot be changed after the first Play Store upload.** See the decision below |
| `handyfix`, `handyfixpro` (URL schemes), `handyfix://reset-password` | `app.config.ts`, auth code, Supabase redirect allow-list | Deep links and password reset; changing needs the dashboard allow-list and Google sign-in redirect updated together |
| Expo slugs `handyfix`, `handyfix-pro` and the EAS project ids | `app.config.ts` | Tied to the Expo project; a new slug is a new project |
| `@handyfix/shared`, `@handyfix/mobile`, `@handyfix/admin`, `createHandyFixClient` | npm scope, exports | Internal names; renaming touches every import and both lock files |
| `handyfix_role` | auth user flag | Stored data on every account |
| storage, task and project keys `handyfix-pro`, `handyfix-provider-presence`, `handyfix-job-location`, `handyfix-background-location`, `handyfix-staging` | code, scripts | Changing them signs users out or orphans a background task; no visible text |
| `handyfix.completing` (database setting), tables, columns, functions, bucket names | the database | Applied migrations are never edited |
| `support@handyfix.in`, `admin@handyfix.in`, `https://handyfix.in/...` | env defaults, legal pages, help, email | The real mailbox and domain. Replace when an apnabanda domain exists (`EXPO_PUBLIC_SUPPORT_EMAIL`, `LEGAL_SUPPORT_EMAIL`) |
| the folder name `handyfix/` in the README tree, git history, `docs/` | repo | not user-facing |
| `AsyncStorage` key `apnabanda.appearance` | already apnabanda | n/a |

### Decide BEFORE the first Play Store upload (I did not change these)
1. **The Android package ids `in.handyfix.app` and `in.handyfix.pro`.** After the first upload they can never change. If the brand is final, `in.apnabanda.app` /
   `in.apnabanda.pro` (or whatever domain you will own) must be chosen **now**. These ids also tie to `google-services.json` (Firebase push), the Google Maps
   key restriction (package + SHA-1), Google sign-in, Razorpay, and the EAS credentials: each is created for the final id, so changing late means redoing them.
2. **The Expo slugs / EAS projects** (`handyfix`, `handyfix-pro`): only if you want the dashboards to read apnabanda; not permanent for users.
3. **The URL schemes** (`handyfix`, `handyfixpro`): can change before launch (update the Supabase redirect allow-list `handyfix://**` and Google sign-in).
4. **The support mailbox and domain** (`support@handyfix.in`): swap when you have an apnabanda one.

### Tests for slice 2
`brand.test.ts` (constants, server-text rename, the scan), the existing legal, push and terms tests (updated for the new wording and versions),
and every browser suite (the expectations were updated from "HandyFix fee" to "apnabanda fee" and so on).

### Not done / limits of slice 2
- **Database wording still says HandyFix.** Applied SQL was not edited. Affected: the `RAISE EXCEPTION` messages in `20261113000002`,
  `20261125000001`; the wallet ledger note text in `20261114000000` and `20261123000000`. They are shown renamed in the apps (above), but the
  stored notes and the SQL Editor still read HandyFix. Fixing the stored text needs a new SQL proposal (ask first).
- **Edge functions on live still send the old wording** until redeployed: `send-customer-otp`, `send-provider-otp`, `send-welcome-email`,
  `create-qr-payment` (the Razorpay order name "apnabanda #...") and the proposal functions. The repo has the new text.
- Phones need a **new app build** to show the new wording; the legal pages need `site/` published again.
- The image and logo files, the screenshots in `docs/*.png` and old docs were not changed.

---

## Results (real output)

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 7 warnings (the old `any` warnings in the admin; none new) |
| `npm run test` (Vitest, shared) | **956 passed, 74 files** (was 926 before this work: provider-busy 21 + SQL twin 5 + brand 4 and the updated ones) |
| `npm run build` (admin) | passes |
| `npm run mobile:typecheck` | 0 errors |
| Throwaway Postgres, one job at a time (`test-one-job.mjs`) | **38 of 38** (two sessions at once: 6 of 6 and 4 of 4 rounds; **0 of 6 and 0 of 4 with the lock removed**) |
| Dry run of proposal 30 and its COMMIT file (`test-one-job-dryrun.mjs`) | every check true, nothing saved after ROLLBACK, COMMIT saves |
| Throwaway Postgres, instant dispatch (`test-dispatch.mjs` + `test-dryrun.mjs`, unchanged) | 59 of 59 and its dry run OK |
| Browser, main suites (`npm run test:e2e-web`) | auth 30, booking 32, **provider 41** (9 new busy checks), status 28, wallet 24, features 39, services 17, booking-payment 14 = **225 of 225**, exit 0 |
| Browser, instant dispatch (`npm run test:e2e-dispatch`) | customer 23 of 23, Pro 15 of 15 |
| Browser, store variants (`variant-flow.cjs`) | customer 4 of 4, provider 4 of 4 |

Failures along the way, all fixed: the first e2e server ran out of memory while bundling (restarted with more memory); `auth-flow` asserted "Version 1.1" (the legal pages are now 1.2);
`variant-flow` asserted a heading ("Your Home, Fixed Fast") that no longer exists in the app and **was already stale before this work**, so it now checks the real home heading;
the push function's generated file had to be rebuilt. The SQL tests were never run against the live project.

### Every file touched
**Slice 1, commit `9b6c3b1` (23 files):**
- `apps/mobile/e2e-web/mock-supabase.cjs`
- `apps/mobile/e2e-web/provider-flow.cjs`
- `apps/mobile/src/app/customer/book/[providerId].tsx`
- `apps/mobile/src/app/customer/service/[slug].tsx`
- `apps/mobile/src/app/provider/(tabs)/jobs.tsx`
- `apps/mobile/src/app/provider/job/[id].tsx`
- `apps/mobile/src/features/customer/catalog-api.ts`
- `apps/mobile/src/features/customer/types.ts`
- `apps/mobile/src/features/provider/RequestPopup.tsx`
- `apps/mobile/src/features/provider/api.ts`
- `apps/mobile/src/features/provider/provider-runtime.tsx`
- `packages/shared/src/booking/provider-busy-sql.test.ts`
- `packages/shared/src/booking/provider-busy.test.ts`
- `packages/shared/src/booking/provider-busy.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/provider/request-access.ts`
- `supabase/APPLY_PLAN.md`
- `supabase/dryrun/30_one_job_at_a_time_DRYRUN.sql`
- `supabase/dryrun/apply_30_one_job_at_a_time_COMMIT.sql`
- `supabase/proposals/20261126000000_one_job_at_a_time_PROPOSAL_NOT_APPLIED.sql`
- `supabase/tests/instant-dispatch/package.json`
- `supabase/tests/instant-dispatch/test-one-job-dryrun.mjs`
- `supabase/tests/instant-dispatch/test-one-job.mjs`

**Slice 2, commit `4d384ce` (87 files):**
- `README.md`
- `apps/admin/src/components/admin/AdminLayout.tsx`
- `apps/mobile/.env.example`
- `apps/mobile/app.config.ts`
- `apps/mobile/e2e-web/auth-flow.cjs`
- `apps/mobile/e2e-web/booking-flow.cjs`
- `apps/mobile/e2e-web/booking-payment-flow.cjs`
- `apps/mobile/e2e-web/dispatch-flow.cjs`
- `apps/mobile/e2e-web/dispatch-pro-flow.cjs`
- `apps/mobile/e2e-web/features-flow.cjs`
- `apps/mobile/e2e-web/provider-flow.cjs`
- `apps/mobile/e2e-web/services-flow.cjs`
- `apps/mobile/e2e-web/status-flow.cjs`
- `apps/mobile/e2e-web/variant-flow.cjs`
- `apps/mobile/e2e-web/wallet-flow.cjs`
- `apps/mobile/src/app/(auth)/sign-up.tsx`
- `apps/mobile/src/app/(dev)/spike/location.tsx`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/customer/(tabs)/index.tsx`
- `apps/mobile/src/app/customer/(tabs)/profile.tsx`
- `apps/mobile/src/app/customer/help.tsx`
- `apps/mobile/src/app/customer/service/[slug].tsx`
- `apps/mobile/src/app/provider/(tabs)/profile.tsx`
- `apps/mobile/src/app/provider/(tabs)/wallet.tsx`
- `apps/mobile/src/app/provider/_layout.tsx`
- `apps/mobile/src/app/provider/edit-profile.tsx`
- `apps/mobile/src/app/provider/help.tsx`
- `apps/mobile/src/app/provider/job/[id].tsx`
- `apps/mobile/src/app/provider/reviews.tsx`
- `apps/mobile/src/app/provider/services.tsx`
- `apps/mobile/src/app/role-pick.tsx`
- `apps/mobile/src/components/spike/RequestAlertModal.tsx`
- `apps/mobile/src/features/account/delete-account.tsx`
- `apps/mobile/src/features/closing/components.tsx`
- `apps/mobile/src/features/customer/catalog-api.ts`
- `apps/mobile/src/features/dispatch/OfferAlert.tsx`
- `apps/mobile/src/features/disputes/components.tsx`
- `apps/mobile/src/features/extras/components.tsx`
- `apps/mobile/src/features/info/about.tsx`
- `apps/mobile/src/features/kyc/api.ts`
- `apps/mobile/src/features/kyc/steps.tsx`
- `apps/mobile/src/features/provider/RequestPopup.tsx`
- `apps/mobile/src/features/provider/profile-api.ts`
- `apps/mobile/src/features/provider/provider-runtime.tsx`
- `apps/mobile/src/features/provider/tracking.ts`
- `apps/mobile/src/lib/razorpay.ts`
- `packages/shared/src/account/deletion.ts`
- `packages/shared/src/auth/session-role.ts`
- `packages/shared/src/booking/closing-problem.test.ts`
- `packages/shared/src/booking/closing-problem.ts`
- `packages/shared/src/brand.test.ts`
- `packages/shared/src/brand.ts`
- `packages/shared/src/catalog/pro-offers.test.ts`
- `packages/shared/src/catalog/pro-offers.ts`
- `packages/shared/src/dispatch/dispatch.test.ts`
- `packages/shared/src/dispatch/offer.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/kyc/kyc.ts`
- `packages/shared/src/kyc/terms.test.ts`
- `packages/shared/src/kyc/terms.ts`
- `packages/shared/src/kyc/wizard.ts`
- `packages/shared/src/legal/deletion.ts`
- `packages/shared/src/legal/legal.test.ts`
- `packages/shared/src/legal/privacy.ts`
- `packages/shared/src/legal/render.ts`
- `packages/shared/src/legal/terms.ts`
- `packages/shared/src/legal/types.ts`
- `packages/shared/src/provider/wallet-ledger.test.ts`
- `packages/shared/src/provider/wallet-ledger.ts`
- `packages/shared/src/push/messages.test.ts`
- `packages/shared/src/push/messages.ts`
- `packages/shared/src/supabase/errors.ts`
- `scripts/build-legal-site.mjs`
- `scripts/env-doctor.mjs`
- `site/account-deletion.html`
- `site/index.html`
- `site/privacy.html`
- `site/terms.html`
- `supabase/functions/create-qr-payment/index.ts`
- `supabase/functions/send-customer-otp/index.ts`
- `supabase/functions/send-provider-otp/index.ts`
- `supabase/functions/send-welcome-email/index.ts`
- `supabase/proposals/functions/delete-account/index.ts`
- `supabase/proposals/functions/kyc-pan/handler.ts`
- `supabase/proposals/functions/notify-push/shared-push.js`
- `supabase/proposals/functions/send-provider-otp/index.ts`
- `supabase/proposals/functions/send-welcome-email/index.ts`

**This document's commit:** `docs/CHANGES_ONE_JOB_AND_RENAME.md` (new), `docs/PROGRESS.md`, `CLAUDE.md`.

---

## What you must do by hand
1. **Review and apply the SQL** (slice 1) in the order above: dry run, then apply. Then try to accept a second job with a pro who is on a job.
2. **Decide the Android package ids before the first Play Store upload** (list above). Tell me and I will change them in one commit with the matching checklist.
3. **Redeploy the edge functions** that send wording (`send-customer-otp`, `send-provider-otp`, `send-welcome-email`, `create-qr-payment`, and the
   proposal functions you deploy) so emails and the Razorpay order name say apnabanda. Same `supabase functions deploy ... --use-api` as before.
4. **Publish `site/`** again (privacy, terms, deletion pages now say apnabanda, version 1.2) and check the URLs in the store listing.
5. **Build new apps** (customer and Pro) so phones show the new wording.
6. **Lawyer:** the Partner Agreement (v1.4) and the legal pages (1.2) only changed the name, but they are legal documents.
7. Say "push" when you want the three commits on GitHub; I will check it is a plain fast-forward first.
