# HandyFix roadmap and queue

Living status file. Claude: read this at the start of a session and **remind the owner about every item
marked QUEUED or BLOCKED** at the end of each report until it is done.

Decisions locked: React Native + Expo, one app with two roles (one role per account), PDF business model
(customer pays the pro's own rate, ₹0 customer fee; provider pays a flat ₹15/30/50 from a prepaid wallet only on
completed jobs; fee-free first 3 months or 10 jobs; customer pays the pro directly by UPI or cash), Android first.
Package name: `in.handyfix.app`.

## Done (committed locally, not pushed)

| Phase | What |
|---|---|
| 0 | Repo cleanup |
| 1 | Monorepo layout |
| 2 | `packages/shared` business logic with tests |
| 3 | Expo app shell and native check screens (phone checks still to run) |
| 4 / slice 1 | Auth, role pick, profiles |
| 4 / slice 2 | Customer: services, pros with prices, 3-step booking |
| 4 / slice 3 | Customer booking status: list, live status over Realtime, ETA/distance/live position with a map (key needed), code card, call (needs SQL function), next-best-pros rebook after a timeout or decline, cancel. 24 end-to-end checks against a mock backend. |
| UI | Old HandyFix look ported (cream/terracotta, Plus Jakarta Sans, legacy-style home and auth, dashboard stats) and **two store apps from one codebase** (customer / provider variants, own package, scheme and permissions) |
| 5a | Provider wallet screen: balance/dues, history, earnings, Razorpay top-up (uses the existing `create-wallet-topup-order` + webhook), withdrawal via `request_payout`. 17 checks on a mock; **Razorpay checkout itself untested (needs a dev build + keys)** |
| 4 / slice 4 | Provider: online switch with heartbeat, full-screen request alert (Realtime + polling), accept/decline with wallet check, job steps, live trip location, completion code, flat-fee preview. Tested end to end (26 checks) against a mock backend only. |

## QUEUE (in order)

| # | Item | State |
|---|---|---|
| 1 | ~~Slice 3: customer booking status~~ | **DONE** (map and call need owner setup, see BLOCKED) |
| 2 | **Slice 4b: server side of the request flow**: push to the pro when a booking arrives (FCM edge function and token table), the 30 s timeout and next-pro offers as real server logic. Needs a Firebase project from the owner. **Until then a pro whose app is closed gets no request.** | QUEUED |
| 3 | **Slice 5b-rest: KYC and rate**: 9-step KYC wizard (camera and pickers, storage upload), payout details (UPI/bank) form, pro sets own rate inside the band (needs pricing proposal applied). Wallet/top-up/withdraw/earnings are DONE (5a). | QUEUED |
| 4 | **Slice 5b: extra work with customer approval** (+ bill photos for parts) and **disputes** (24 h / 48 h window, evidence, admin decision, appeal) | QUEUED |
| 5 | **Slice 6**: chat with number blocking, reviews, notifications, account deletion | QUEUED |
| 6 | **Admin panel** updates: price bands, disputes, wallet/fee records | QUEUED |
| 7 | **Phase 5**: Sentry, EAS builds, Play Console internal then closed testing, location declaration | QUEUED |
| 8 | Delete `legacy/` web apps at mobile parity; rebuild the grant document sections for the new model | QUEUED |

## Legacy modules not yet in the new apps (QUEUED)

Customer: notifications page, about/contact pages, booking chat, reviews, saved profile photo. Provider: schedule/availability, reviews, notifications, settings (notification preferences), terms page, earnings chart, 9-step KYC onboarding, profile editing. Each is a slice; the legacy file is the visual spec.

## BLOCKED on the owner

| Item | Needed |
|---|---|
| Real-phone checks (background location, request alert, push, Google sign-in) | Owner runs `apps/mobile/SPIKE.md` **at the end** (their decision). Nothing in the app has been run on a device. |
| Applying the SQL proposals | Owner reviews, then says "apply". Nothing is applied. Order: pricing, then arrived status, then provider wallet fee. |
| Google Maps API key | For the live map: enable "Maps SDK for Android", restrict by package `in.handyfix.app` + SHA-1, add as EAS secret `GOOGLE_MAPS_API_KEY`, set `EXPO_PUBLIC_MAPS_ENABLED=1` |
| Supabase dashboard | Confirm "Confirm email" is OFF; allow redirect `handyfix://**` |
| Two Google OAuth Android clients | One per app: `in.handyfix.app` and `in.handyfix.pro` (each with its SHA-1). Also allow redirects `handyfix://**` and `handyfixpro://**` in Supabase |
| Google sign-in setup | Owner follows `docs/GOOGLE_SIGNIN_SETUP.md` (Cloud OAuth clients, Supabase provider, env var, dev build) |
| Razorpay | Edge function secrets `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`, webhook configured, functions deployed (check `supabase functions list`); test mode first |
| Firebase + EAS accounts | Needed for push (4b) and builds |
| GitHub push | Owner pushes (or fixes access); bundle in the scratchpad until then |

## SQL proposals (all NOT applied)

1. `supabase/proposals/20261101000000_pdf_pricing_model_PROPOSAL_NOT_APPLIED.sql`: price bands, locked booking price, replaces the live 12% trigger.
2. `supabase/proposals/20261102000000_booking_status_arrived_PROPOSAL_NOT_APPLIED.sql`: adds the `arrived` status.
3. `supabase/proposals/20261102000001_provider_wallet_fee_PROPOSAL_NOT_APPLIED.sql`: flat-fee slabs, launch period, accept check, fee posted at completion; removes the old `unsettled_job` block. **Required for the provider flow to work in production** (otherwise pros are locked out 24 h after their first job).

4. `supabase/proposals/20261103000000_customer_booking_contact_PROPOSAL_NOT_APPLIED.sql`: lets a customer read their own pro's phone only after acceptance (needed for the Call button).

Verify 05 result (owner ran it): `booking_status` is an enum without `arrived`, so proposal 2 IS needed for "I've arrived". No CHECK constraints mention status. Live guard triggers `guard_booking_money_columns`, `zz_guard_booking_update`, `trg_block_direct_completion` have unseen bodies: owner runs `supabase/verify/06_guard_triggers_READONLY.sql` before applying 1 or 3. Safe order and smoke tests: `supabase/APPLY_PLAN.md`. Google sign-in steps: `docs/GOOGLE_SIGNIN_SETUP.md`.

Live state (owner ran `verify/04_pricing_state_READONLY.sql`): 12% trigger LIVE, no price bands, `service_sub_items` present,
12 pro rates set, last 20 bookings all carried a fee.

## Security findings still open (need migrations)

- `confirm_user_email(text)` is callable by anyone and can confirm any email.
- `send-provider-otp` / `verify-provider-otp` store codes in plaintext with no attempt limit.
- The booking completion code is stored in plaintext (the customer has to be able to read it; consider a server-side reveal).

## Known limits of slice 4

- No server push: requests reach a pro only while the app is open or its presence foreground service runs.
- Presence keep-alive uses the background-location foreground service. Play may ask why a "go online" feature needs background location: the honest answer is live trip sharing plus staying reachable; decide before the Play declaration (Phase 5).
- The fee shown after completion is a preview computed in the app. The real fee is settled by the database once the wallet proposal is applied.
- Extra work, disputes, wallet top-up, payouts and the pro setting their own rate are not built yet (see QUEUE).
- Nothing here has run on a phone: background tasks, the foreground services, the ring sound and the full-screen modal on a locked device are all unverified.
