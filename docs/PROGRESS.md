# HandyFix progress (keep this file current: update it at the end of every slice)

Last updated: 2026-10-29 (merged: Ritesh incl. the arrived-step fix + the 2026-10-29 session: My services, Labour & Shifting, 3% fee + packs, Black + Blur restyle; nothing pushed yet). Working branch: `Ritesh` (created from `handyfix-merge-changes`, which stays untouched). Plan: `docs/NEXT_CHAT_PORT_LEGACY.md` (done) and **`docs/NEXT_CHAT_FINISH_PDF.md` (what is left, start here)**. How to test: `docs/LOCAL_TEST_GUIDE.md`.
Source of truth for the product: `HandyFix-complete.pdf`; rules and decisions: `CLAUDE.md`; slice history: `docs/ROADMAP.md`.

## How the owner starts a session

Just say what you want, for example **"continue with NEXT 1"**. Claude syncs with GitHub, reads this file and `CLAUDE.md`,
and proposes a short plan. No need to explain the project again.

## DONE (on GitHub)

- Monorepo: `apps/mobile` (Expo, customer + pro), `apps/admin` (web), `packages/shared` (logic + 440 tests), `supabase/`, `legacy/` (read-only spec).
- Customer: services, pros with their own price, 3-step booking (clock time picker), live status/tracking, next best pros, cancel.
- Provider: online switch + heartbeat, request alert, accept/decline with wallet check, job steps, completion code, wallet (Razorpay top-up, withdraw, earnings).
- Business model DB migrations **APPLIED to the live project (Handy-fix) on 2026-10-28**, in this order, each dry-run first (files in `supabase/dryrun/`):
  `20261101` pricing (bands, locked price, platform_fee 0) → `20261102000000` arrived status (only if needed) →
  `20261102000001` wallet fee (flat 15/30/50, launch waiver, accept check, `booking_fees`) →
  `20261107` extra work (customer approval, bill photos, parts excluded from fee), disputes (24 h/48 h, reply, appeal, safety rule, fee returned on refund), `get_booking_provider`, admin RPCs.
- Admin app: Price bands page, Fees & disputes page (show errors until the proposals are applied).
- Catalogue: sections + 266 sub-services seeded on the live project (308 sub-services, 11 services verified read-only on 2026-10-28).
- Local setup tooling: `npm run env:check` / `env:fix`, `docs/LOCAL_SETUP.md`.
- **Slice 5b (2026-10-28): extra work + disputes in the mobile apps.** Customer: extra-work card with one-tap Approve/Decline and bill photo, bill card (service, extras, parts, ₹0 fee), "Report a problem" (24 h / 48 h repair quality, safety any time) and one appeal. Pro: add extra work (labour or parts with bill photo), withdraw, real fee record from `booking_fees` after completion (parts excluded), dispute reply and appeal. Call button now uses the applied `get_booking_provider`. Shared: `booking/extras.ts`, dispute rules aligned with the DB (`safety` category).
- **Port checkpoint 2 (2026-10-28): Pro identity check (KYC) wizard in `apps/mobile`.** 9 screens `app/provider/kyc/[step]` + status page `app/provider/kyc/index`; answers save after every step and resume where the pro stopped; selfie from the front camera, ID photos from camera or gallery (shrunk to 1600 px JPEG before upload to the private `provider-kyc` bucket); duplicate Aadhaar/PAN, under-18, bad checksum and wrong-format cases explained in plain words; rejected applications reopen at step 1 with the reviewer's reason and a "Change" link per answer; Pro home card shows start / continue / under review (re-checks every 30 s) / fix; Partner Agreement rewritten for the flat-fee model (`TERMS_VERSION` v1.1). Shared (+43 tests): `kyc/wizard.ts`, `kyc/sha256.ts` (same salted hash as the web app, no native module), `kyc/terms.ts`. **No database change:** the KYC tables, `submit_kyc`, bucket and policies were checked live (read-only) and already exist. The Pro build now allows the CAMERA permission (needed for selfie and ID photos) and adds `expo-image-manipulator`: **the Pro development build must be rebuilt.** Service-area picker extracted to `features/provider/ServiceAreasField` and reused by Edit profile.
- **Port checkpoints 3-6 (2026-10-28, branch `Ritesh`, all committed locally, 635 shared tests, 6 browser suites = 159 checks).** Owner decision: stop at checkpoint 6; checkpoints 7 and 8 are queued (see NEXT). A first polish pass and the full check run had already been done before that message; they sit in their own commit (`Polish: accessible colours, loading skeletons...`) and can be dropped without touching checkpoints 2-6:
  - *Pro wallet:* payout details card (UPI or bank) on the Wallet tab; withdraw is blocked until saved and the identity check is approved. Shared `provider/payout.ts`.
  - *Customer:* **Nearest** sort (chip appears once pros share their area, needs proposal `20261109`), **rating** after a completed job (one per booking), **Book again** (same pro, normal price; cancelled bookings go back to the service), **late-cancel rule** (a pro had accepted and start is under 2 h away; 3 in 30 days pauses booking a week; checked in the app, made tamper-proof by proposal `20261112`).
  - *Chat* for both apps once a pro accepts, read-only after the job, **phone numbers blocked** (digits, spaced digits, spelled-out digits, Devanagari/Gujarati digits; price lists and times pass). Shared `chat/`. Server rule in proposal `20261110`.
  - *Notifications* screens and a bell with unread count for both apps (`customer_notifications` / `provider_notifications`, live + 30 s poll).
  - *Working hours* (pro): `app/provider/schedule`; the customer's time picker only offers times inside the pro's hours (no hours set = 8 AM-8 PM). Checked in the app only.
  - *Pro reviews* page (average, bars, names as "Priya S.").
  - *About*, support phone/privacy/terms links (only shown when `EXPO_PUBLIC_SUPPORT_PHONE`, `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` are set), Pro Partner Agreement in Help, **Delete account** screens (store requirement) that call the `delete-account` function (proposal; until it is live the screen offers an email).
  - *Polish:* loading skeletons, no raw database text anywhere (`friendlyDbError`), working back buttons, contrast fixes for green text and placeholders. The terracotta `#C16430` is **unchanged** (see decisions).
  - *Bug found by the new tests and fixed:* two screens opening the same live channel crashed the app (blank screen).
  - *Existing mock-backend tests brought up to date* (contact function name, payout column) and a new `features-flow.cjs` suite added.
- Web reference screens for the new flows: `docs/reference-ui-flat-fee/` (spec only).
- **Slice A1 (2026-10-29, owner chose option (a)): pros pick jobs and set their own rate.** Worked in `D:\Handy-Fixx-Ritesh`, which is **not a git checkout** (owner: "work here, no commits"); copy these files into the repo on branch `Ritesh`. New `app/provider/services.tsx` ("My services", from Profile > Services I offer and from Edit profile): switch per service, tick/untick each job grouped by section, optional own price per job only when the admin set a band for it (`service_sub_items.price_min/max`, admin Price bands page; **no job has a band yet**, so the price box shows nowhere until the admin sets some). Edit profile no longer writes `service_ids`. Customer list hides a pro for an unticked job and shows the pro's own rate. Shared `catalog/pro-offers.ts` (+14 tests, reuses `money/price-band`); `resolveListedPrice` takes `proSubItemPrice`. Rule: no rows for a service = every job at the HandyFix price, so no existing pro disappears. **Needs proposal `20261113000002`** (dry run `13_`); until it is applied the screen saves services only and says so. Proposal tested on a throwaway PGlite Postgres (15 checks: RLS, band, booking price, unticked job refused, re-run safe). New browser suite `services-flow.cjs` (17 checks); all 7 suites 176/176.

- **Labour & Shifting service (2026-10-29, owner's prices):** proposal `20261113000001` (dry run `11_`), data only: 1 service (lucide `Truck` icon added to the app), 10 jobs in 3 sections, one helper per booking unless the job says "2 helpers". Tested on PGlite.
- **New pro pricing + recharge packs + Razorpay (2026-10-29, owner's spec):** 3% fee min ₹5 max ₹50 (`feeForServiceBill`, worked in paise so ₹250 → ₹8 like Postgres), packs ₹49/₹99/₹199 (`RECHARGE_PACKS`, `jobsCovered`, `packFor`), accept check with no dues, `settleJob` with a held fee (never a due when a hold exists; extras past hold + balance are `uncollected`, at most ₹45). Proposal `20261114000000` (dry run `12_`, verify `09_`): `wallet_holds`, accept trigger holds the fee, release on cancel/decline, settlement on ANY completion (code, admin, auto-close), `get_wallet_summary.held`, payouts exclude holds, `auto_complete_stale_jobs()` every 15 min via pg_cron for jobs started after the change. Tested on PGlite (21 checks). Owner decisions: the 3 pros who owe money must recharge first; the 7 jobs already stuck in progress are NOT auto-closed (listed by verify 09). Edge Function proposals in `supabase/proposals/functions/` (pack-only order + rate limit, webhook ignores non-top-up notes, new `verify-wallet-payment`); setup in `docs/PAYMENTS_SETUP.md`. Pro app: Wallet ("Covers about N more jobs", packs, reserved money), request popup and job screen show the 3% fee, "Recharge ₹49 to accept" button. Shared 662+ tests, 7 browser suites 181/181.

- **UI restyle "Black + Blur" (2026-10-29, owner spec; styling only, no logic/DB/route changes):** Light/Dark/System theming with CSS-variable tokens (`src/theme/`), `ThemeProvider` at the root, `Glass` blur wrapper with Android fallback, `ScreenBackground` glows, apnabanda `AppLogo` + Pro pill, shared components restyled (`ui.tsx`: Button with icon and on-primary text, Chip, Card, `HeroCard`, `StatusPill`, `WarnBanner`, inputs, header), frosted tab bar, 103 hard-coded colours moved to `useThemeColors()`. Screens: customer Home ("Apna banda hai.", area chip, promise card, 4-column service tiles, trust tiles), Choose a pro (lowest price outlined, verified badge, "final price", footer note), Review & confirm (progress bar, ₹0 fee pill, amber "Price is locked", lock on Confirm), Booking status (hero, code in 4 boxes, green done hero), Pro dashboard (PRO pill, online hero, new-request preview, wallet strip), request popup (frosted sheet, big "You earn"), job (step tracker, You earn hero), wallet (hero). Profile > Appearance in both apps. `expo-blur` added and `userInterfaceStyle: "automatic"`, splash `#05070D`: **both apps need new development builds.** Built in the non-git copy (no commits).
  Follow-ups for the owner: new app icon / adaptive icon / splash image from the apnabanda SVG (not changed yet); in-app copy still says "HandyFix" (fee lines, Help, About); a "Most jobs" sort needs a shared ranking change; RN web blur is real, Android shows the fallback by design.

- **Commission plan v2, phases 0-1 (2026-10-29):** launch period is now the first 10 jobs or 1 month (`LAUNCH_PERIOD`), Partner Agreement v1.2 states the 3% fee, hold at accept and the new launch, Help copy follows the constant. DB: proposal `20261115` (dry run `14_launch_one_month_DRYRUN.sql`, then `apply_14_launch_one_month_COMMIT.sql`; NOT applied, run it after or independent of `20261114`). Plan: `docs/PLAN_COMMISSION_PHASES.md` section 0.

- **Commission plan v2, phase 2 (2026-10-29):** `PLATFORM_RULES` + `feePreview` in `packages/shared/src/money/platform-config.ts` (built from the fee/launch/wallet constants, frozen, 8 tests) and a read-only admin page **Fees & rules** (`/fees`: rules in force + bill calculator with parts and launch waiver). Editing the numbers from the admin app needs a database config table: not built, ask first (it would also need the SQL twins to read it).

## NEXT (in this order)

Commission plan v2 (owner, 2026-10-29): **Phase 3** locked requests ("Top up ₹X to accept", lock = balance cannot cover the held fee); **Phase 4** in-app customer payment + same-day payout (deferred: needs Razorpay Payouts + refund rule from the owner). Then the A2-A7 list below.

Owner plan of 2026-10-29 ("first release, do all the things"), one slice at a time:
- **A2 "Not sure what's wrong?" check-up visit**: 27 check-up/visit items already exist in 7 services (none in HVAC; skip Salon, Cleaning, Home Help). Friendly names, a catalogue flag, shown first on each service. **Owner: priced per service; the visit fee is always charged** (repair added as extra work on top).
- **A3 Daily labour + house help by the day**: new "Daily Labour" service, half-day/full-day items in Home Help, number of workers. **Owner: price per worker per day; "lady worker only" filters on verified gender**, which needs a gender field in the identity check (none exists in `service_providers` or `provider_kyc`). Needs a migration (quantity on bookings, trigger multiplies).
- A4 Verified badge + price range before booking. A5 customer voice note/photos (check what exists). A6 ranking, emergency add-on, repeat booking/maintenance reminders, referral. A7 Hindi text (needs a native-speaker check).
- **Owner decision needed:** the live cron job `expire-stale-bookings` (every minute) cancels any request still pending 30 minutes after it was made ("No pro accepted in time"). That contradicts the locked rule "a request stays open until answered or its start time passes". Found 2026-10-29, not changed.
- **Not building without an explicit decision change:** customer in-app payment (contradicts the locked "customer pays the pro directly"); push still needs Firebase.

00. **BUG (owner, 2026-10-28): "I've arrived" does nothing on the Pro app.** Cause found read-only on the live project: the `arrived` enum value exists, but the live guard `guard_booking_update` refuses `on_the_way > arrived` and `arrived > in_progress`. Fix written and tested on a throwaway database: proposal `20261113000000_guard_allow_arrived` (`supabase/dryrun/10_guard_arrived_DRYRUN.sql`, then `apply_10_guard_arrived_COMMIT.sql`). **Not applied: waiting for the owner.** The app now shows a plain-words message instead of raw database text (`friendlyDbError` in the Pro API). Details and follow-ups: `docs/NEXT_CHAT_FINISH_PDF.md` section 1.

0. **Queued for later (owner, 2026-10-28): checkpoint 7 (UI polish pass over every screen, after the owner picks the look) and checkpoint 8 (full check run, web export, phone test checklist).** Only a first pass exists: loading skeletons, friendly errors, contrast fixes for green text and placeholders, working back buttons. Not done: a screen-by-screen review, small-screen and low-end Android checks, screen-reader labels audit, Hindi/regional text.

1. **Owner: test on a phone** with `docs/LOCAL_TEST_GUIDE.md` (needs new dev builds: the Pro app now uses the camera and `expo-image-manipulator`).
2. **Owner: approve the database proposals** (each has a dry-run file that saves nothing, tested on a throwaway local database, never on the live project). Order and effect in the guide. Most urgent: **reviews fix** (customers cannot rate at all today).
3. ~~Owner decision: how pros set their own rate~~ Done as slice A1 (option a). **Owner: approve `20261113000002`, then set price bands for the jobs where pros may choose their rate.**
4. **Slice 4b: push to a closed app** (needs a Firebase project from the owner).
5. **Set the app build env vars and rebuild both apps** (`EXPO_PUBLIC_PDF_PRICING_LIVE=1`, `EXPO_PUBLIC_ARRIVED_STATUS=1`, optional support phone / privacy / terms URLs). Set admin price bands.
6. **Security (ask first):** see list below.
7. **Release prep:** Google Maps key + `EXPO_PUBLIC_MAPS_ENABLED=1`, EAS builds, Play Store closed test, hosted privacy policy URL; delete `legacy/` at mobile parity.
8. **Later (PDF order):** ranking by rating, distance and response speed; Featured boost and Pro subscription (~40 pros); urgent add-on, real refunds, maintenance plans (after in-app payments); society tie-ups and ads (500+ bookings).

## BLOCKED on the owner

- Firebase project (push to a closed app). Google Maps API key. A hosted privacy policy and terms page. A Pro EAS project ID (`eas init` with `EXPO_PUBLIC_APP_VARIANT=provider`).
- **Database proposals waiting for approval** (all in `supabase/proposals/`, each with `supabase/dryrun/N_..._DRYRUN.sql` that ends in ROLLBACK and `apply_N_..._COMMIT.sql`):
  `20261113` arrived-step guard (**"I've arrived" broken today**) · `20261108` reviews fix (broken today) · `20261109` pro area for Nearest · `20261110` chat hardening (closes a hole: anyone can post in any chat) · `20261111` delete account (+ `proposals/functions/delete-account/index.ts`) · `20261112` late-cancel limit in the database. · `20261113000002` pros pick jobs + own rate (`13_provider_sub_items_DRYRUN.sql`; replaces `enforce_booking_price`) · `20261113000001` Labour & Shifting (`11_`) · `20261114000000` 3% fee, holds, auto-close (`12_`).
  Still not applied from before: `20261103` contact, `20261104` avatars, `20261105` attachment read fix, `20261106` catalogue (check which are needed).
- **Decision: brand colour contrast.** `#C16430` gives white button text 4.09:1 and brand text on cream 3.8:1; WCAG AA needs 4.5:1. `#B05526` passes (5.0:1) and looks almost the same. Kept `#C16430` as locked; change in `tailwind.config.js` and `src/theme/colors.ts` (brand) if approved.
- **Decision: what counts as a "late cancel"** (assumed: pro had accepted, start under 2 hours away) and whether chat should stay open after a job.

## Security and data findings (2026-10-28, read-only checks on the live project)

- `reviews`: cannot be inserted (guard trigger error), three overlapping insert policies allow fake reviews, no one-per-booking rule, `total_jobs` double counted: fixed in proposal `20261108`.
- `messages`: policy `messages_insert` lets any signed-in user post into any booking's chat: proposal `20261110`.
- `aadhaar_hash` is SHA-256 with a public salt (same as the old web app, so duplicates are caught across both). A database leak would allow brute-forcing Aadhaar numbers. Fix needs a server-side secret (RPC or edge function): not built.
- `provider_services` has no write policy for pros; `provider_service_pricing` (written by the old web app) is not read by the new customer app.
- Duplicate triggers on `bookings` (several "notify" triggers) and `messages` (two notify triggers) probably send duplicate notifications and add database load; part of the performance proposal still to do.
- Still open from before: `confirm_user_email` callable by anyone; provider OTP codes plaintext and unlimited; free-tier database overload (17 policies on `bookings`).

## Open product decisions (PDF page 17)

Assumed by the code today: (1) customers pay the pro directly, not in the app; (2) 10 jobs or 1 month fee-free (changed 2026-10-29); (3) no cheaper "Book again" with the same pro; (4) urgent add-on not built until payments are in the app. Change the assumption here when the owner decides.

## Known gotchas

- **2026-10-28 outage:** the free-tier database stopped accepting connections at 09:01 UTC (also short timeouts at 07:08 and 08:25) and needed a restart. The performance advisor flags many RLS policies (17 on `bookings`) and per-row `auth.uid()` calls; a performance proposal is the next DB task (ask first). Close the `legacy/` dev servers (ports 3000-3002) when not needed: they also hit the live DB.

- `.env.local` files are untracked; after pulling or moving folders run `npm run env:check`.
- `apps/mobile` has its own install (`npm run mobile:install`) and needs a development build on a phone (Razorpay is native).
- The sandbox Claude uses cannot reach the live Supabase over plain HTTP; use the Supabase tools for read-only checks.
- Do not edit `legacy/`; do not port the old 12% customer fee.
