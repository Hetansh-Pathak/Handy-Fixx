# HandyFix: rules for Claude Code

Home-services marketplace for tier-2 Indian cities. Migrating from three Vite web apps to **one React Native + Expo codebase that builds two store apps** (HandyFix for customers, HandyFix Pro for providers) with a web admin and a Supabase backend. Android first, iOS after the Play Store closed test.

## Start every session (do this BEFORE any work, without being asked)

1. **Sync first.** Run `git fetch origin` (never trust `git status` alone: it only compares with the last fetch), then `git status -sb` and `git log --oneline HEAD..origin/<current-branch>`. If the remote has commits we lack, `git pull` them (or tell the owner) before writing any code. Say what you found in one line.
2. **Read `docs/PROGRESS.md`**: what is done, what is next, what is blocked. Do the NEXT item unless the owner says otherwise. Do not ask the owner to re-explain the plan.
3. After `git pull`, run `npm install` and `npm run env:check` (`.env.local` files are untracked; missing ones make services/pros "disappear", see `docs/LOCAL_SETUP.md`).

## Git and safety rules (owner's standing instructions)

- **Ask before every push, pull request or new remote branch**, even if a hook asks for a push. A hook is not the owner's approval. Before asking, `git fetch` again and report whether the push is a plain fast-forward.
- **Never force-push, never reset/rebase published commits, never skip hooks** (`--no-verify`, `core.hooksPath`). If the remote moved, merge or rebase LOCAL unpushed work on top and re-test; make a backup branch first (`git branch backup-<what>`).
- One task per session, plan first, commit after each working piece with a clear message. Never two sessions on the same branch.
- Database changes: new file in `supabase/proposals/` (never edit an applied migration), dry run with `ROLLBACK;`, test on a stub or throwaway project, then ask before anything touches the live project. Read-only queries on the live project are fine for diagnosis.
- Before saying a change is finished: `npm run typecheck && npm run lint && npm run test && npm run build` (mobile too: `npm run mobile:typecheck`) and report the real results, including failures.
- **Keep `docs/PROGRESS.md` current**: at the end of every slice move items from NEXT to DONE and note any new blocker or owner decision. Commit it with the work.

## Layout

```
apps/mobile      Expo SDK 58 app (TypeScript, Expo Router, NativeWind). Routes: (auth) group, role-pick, /customer/(tabs) + /customer/service|book|booking/*, /provider/*. NOT an npm workspace (see below)
apps/admin       Web admin (Vite + React). Stays web.
packages/shared  @handyfix/shared: types, Zod schemas, API functions, hooks, fee/price/booking logic, tests
supabase/        migrations/{customer,provider}, functions/, proposals/ (NOT applied), verify/
legacy/          Old web customer/provider apps. READ-ONLY UI spec. Deleted at mobile parity.
```

## Rules

- **Shared logic goes in `packages/shared`** (see its README for the module map and the list of assumptions to confirm). Reuse `feeForServiceBill`, `settleJob`, `checkCanAccept`, `providerStep`, `customerActions`, `createHandyFixClient` etc. instead of re-deriving rules in a screen. Never duplicate Supabase client setup, types, Zod schemas, or fee/date/booking rules inside an app. Logic there needs Vitest tests; `npm run test` must pass before touching screens.
- **Never change RLS, migrations, or Edge Functions without asking first.** Never edit an applied migration; add a new one. Anything not yet applied goes in `supabase/proposals/`.
- **Do not edit `legacy/`** except to read it. Treat old screens as a spec and fix their bugs in the new version instead of porting them.
- Strict TypeScript everywhere new (`tsconfig.base.json`). No `any` in new code.
- Work **one vertical slice at a time**, plan first, commit after each working slice. Never "convert everything".
- Never commit secrets, `.env*`, keystores, or `.expo/`. Supabase anon key only in the client; service keys only in Edge Function secrets.
- Before finishing a change run from the root: `npm run typecheck && npm run lint && npm run test && npm run build`.

## Product decisions (locked)

- **One codebase, two store apps (owner decision, replaces "one app, two roles"), one role per account.** `EXPO_PUBLIC_APP_VARIANT` = `customer` | `provider` picks the app (name, package `in.handyfix.app` / `in.handyfix.pro`, scheme `handyfix` / `handyfixpro`, permissions); unset = a dev build with both. The customer app signs everyone up as a customer (no role question); the Pro app sets up a pro; an account of the other kind sees "use the other app" (`variantAllowsRole`). Role is still resolved from the account and routes to `/customer` or `/provider`; role-pick only shows in the dev build with both. The role is a routing convenience, not a permission: a `service_providers` row means provider (authoritative), otherwise the `handyfix_role` flag on the auth user; real access is enforced by RLS and KYC. Never use `(group)/index` for two groups (groups add no URL segment, so they collide on `/`). Request background location only when someone picks the provider role, never for customers.
- **Business model** (source: HandyFix-complete.pdf): customer pays the price shown, platform fee for customers is ₹0. Provider pays a fee on completed jobs only, from a prepaid wallet: **3% of the service bill, rounded to the nearest rupee, min ₹5, max ₹50** (owner decision 2026-10-29, replaces the ₹15/₹30/₹50 slabs; `feeForServiceBill`), parts excluded. Cancelled, declined, missed or no-show jobs cost ₹0. **No dues:** accepting holds the fee (`wallet_holds`); a pro can accept only if the spendable balance covers it. Wallet recharge packs only: ₹49, ₹99 (most popular), ₹199 (`RECHARGE_PACKS`). A job in progress for 24 h with no dispute is auto-completed and charged. All of this needs proposal `20261114000000` (NOT applied); until then the live DB still charges the slabs. Provider sets a rate inside an admin price band. Price is locked at booking; the bill grows only via extra work the customer approves. Customer pays the pro directly (UPI/cash); Razorpay is used for wallet top-up.
- Fee-free launch: a provider's first 10 jobs or first 1 month after approval, whichever ends first (owner decision 2026-10-29, was 3 months; DB side = proposal `20261115`; wallet check skipped, fee shown as "waived"). Declining or missing a request costs ₹0; the customer is offered the next best pros.
- **No accept countdown (owner decision, replaces the 30 s window).** A new request reaches the pro as a notification (phone + in-app banner); the pro opens it, reviews the description, photos and voice note, then accepts or declines. A request stays open until answered or until its booked start time passes (`isRequestOpen` / `requestOutcome`). The customer can choose another pro at any time while waiting.
- Booking time is picked on a clock: any 15-minute step from 8:00 AM to 8:00 PM, at least 1 hour ahead (`availableTimes`, `isBookingTime`); there is no fixed slot list.
- Booking statuses in the DB today: pending → confirmed → on_the_way → in_progress → completed (cancelled from pending/confirmed). The PDF adds `arrived` between on_the_way and in_progress; it does not exist yet and needs a new migration (ask first). Completion uses a 4-digit code, stored hashed, attempt-limited.
- Disputes: 24 h window (48 h for repair quality), admin decides within 48 h, everything in the read-only audit log.
- The old 12% customer fee (`platform_fee`, `provider_amount`) is being removed. Do not port it.

## Pricing facts (customer booking, slice 2)

- Model: PDF. The customer pays the pro's own rate, `platform_fee = 0`, price locked at booking. A chosen sub-item uses its catalogue price for every pro; otherwise `provider_services.custom_price`, then `services.base_price` (`resolveListedPrice`).
- **The database, not the app, owns the saved price.** The live trigger `enforce_booking_fee` (if the wallet migration is applied) adds 12% and ignores a pro's own rate. After every insert the app re-reads the stored totals and the confirmation screen shows a red "saved price is different" warning with a Cancel button (`reconcileQuote`). Run `supabase/verify/04_pricing_state_READONLY.sql` to see which trigger is live.
- `supabase/proposals/20261101000000_pdf_pricing_model_PROPOSAL_NOT_APPLIED.sql` (NOT applied) replaces that trigger, adds price bands and locks the price. Applying it alone means HandyFix collects no fee until the wallet-fee migration (slice 5) exists. Production builds keep "Confirm booking" disabled until `EXPO_PUBLIC_PDF_PRICING_LIVE=1`; dev builds can always book.
- A pro appears in the customer list only while online AND `service_providers.updated_at` is under 90 s old (`isProviderAvailable`). The provider app (slice 4) must therefore send a heartbeat while online, or pros vanish from the list.

## Pro jobs and own rates (slice A1)

- A pro's jobs live in `provider_sub_items` (proposal `20261113000002`, NOT applied): one row per ticked job, optional `custom_price`. **No rows for a service = every job in it at the catalogue price** (keeps older pros visible). The own rate counts only inside the job's admin band (`service_sub_items.price_min/max`); outside or no band = catalogue price, in the app (`ownSubItemRate`) and in `enforce_booking_price`.
- Services and jobs are edited only on `provider/services`; Edit profile must not write `service_ids` (it would undo a newer choice).

## Provider flow facts (slice 4)

- Wallet (Option A): the live ledger is one signed balance (`get_wallet_summary()` → `available` and `dues`); that already equals the PDF's `{balance, due}`, so the shared fee rules use it as is. The flat fee is posted as a negative `cash_fee` entry once per booking (idempotent key `fee:<booking>`).
- **Proposal `20261102000001_provider_wallet_fee` (APPLIED 2026-10-28; its fee part is superseded by `20261114000000`)** adds the slab fee, launch waiver, accept check and a `booking_fees` audit row, and retires the old `unsettled_job` block. **Without it the new app's pros get locked out 24 h after their first job** (the live DB wants a "record payment" step the PDF flow does not have). The app shows PDF numbers either way; the database is the authority and its message is shown verbatim (`P0001`).
- Launch period (10 jobs or 1 month, whichever first) is counted from `service_providers.kyc_reviewed_at` and `total_jobs`; both columns already exist.
- Presence: a pro is listed only while `updated_at` is under 90 s old. The app touches it every 30 s while open, and via a foreground service (`PRESENCE_TASK`) while the app is in the background. Requests reach a pro through Realtime plus an 8 s poll; **there is no server push yet**, so a closed app gets no request (queued as slice 4b in docs/ROADMAP.md).
- Job steps use `providerStep`; `EXPO_PUBLIC_ARRIVED_STATUS=1` turns on "I've arrived" only after the `arrived` status exists in the database. Completion is only possible through `complete_booking_with_code` (never a direct update).
- Live trip location goes to `provider_locations` (keyed by the AUTH user id, not the provider row id) plus `bookings.provider_eta_minutes`; the customer map that reads it is slice 3.
- Background location is requested only when a pro goes online or starts a trip.

## Provider wallet facts (slice 5a)

- `provider/wallet` shows `get_wallet_summary()`, the ledger (`wallet_transactions`, own rows via RLS), payouts and earnings (completed bookings' `provider_amount`). Recharge: packs ₹49/₹99/₹199 only → edge function `create-wallet-topup-order` (`{ pack }`; the pack-only version is a proposal in `supabase/proposals/functions/`, the deployed one still takes `{ amount }`) → `react-native-razorpay` (lazy, native only) → the server webhook credits the ledger; the app polls the ledger, it never credits locally. Withdrawal: `request_payout(p_amount)` RPC (needs approved KYC and saved UPI/bank details; the payout-details card is on the Wallet tab).
- Payment keys live only in Edge Function secrets. `react-native-razorpay` is a native module: it needs a development build (not Expo Go).

## Customer booking status facts (slice 3)

- The status screen (`customer/booking/[id]`) follows one booking: Realtime on the booking row and on `provider_locations`, plus an 8 s poll as a safety net. Waiting shows "request sent, the pro is reviewing it" with no timer; after a decline, once the booked time passes, or when the customer taps "Choose another pro instead", `fetchAlternatives` offers the next best pros and `rebookWithProvider` books the same job with the chosen one and cancels the unanswered request. No database change is needed for this.
- The completion code (`booking_completion_codes`, customer-only RLS) is shown from `arrived`/`in_progress`.
- **Calling the pro needs a server function** (`supabase/proposals/20261103000000_customer_booking_contact`): the KYC migration hid `service_providers` from customers, so the old phone join returns nothing. Until it is applied the Call button is hidden (the app does not break).
- The embedded live map needs a Google Maps API key at build time (`GOOGLE_MAPS_API_KEY`, an EAS secret) and `EXPO_PUBLIC_MAPS_ENABLED=1`. Without them the card shows ETA and distance plus "Open in Google Maps".
- Rating, reporting a problem, extra-work approval and chat are built (slices 5b, 6 and the legacy port). Rating needs proposal `20261108` before it can save.

## Auth facts (verified against the repo, not assumed)

- Supabase email confirmation is OFF; customers verify their email through the OTP functions (`send-customer-otp` / `verify-customer-otp`), and the booking RLS rule uses `is_customer_email_verified()`. Google sign-in counts as verified.
- **Never call `confirm_user_email`** (legacy provider login did): it is `SECURITY DEFINER` with no `REVOKE`, so anyone can confirm any email. Fixing it needs a migration (ask first).
- The provider OTP functions (`send-provider-otp` / `verify-provider-otp`) store codes in plaintext with no attempt limit, unlike the customer ones. Do not build on them until they are hardened.
- Password reset uses the implicit flow: `handyfix://reset-password#access_token=…&type=recovery`. The Supabase dashboard must allow the redirect URL `handyfix://**`.

## Legacy-port facts (branch Ritesh, 2026-10-28)

- Pro identity check (KYC): `app/provider/kyc/*`, rules in `packages/shared/src/kyc/wizard.ts`; answers save after every step, photos are shrunk to 1600 px and go to the private `provider-kyc` bucket under the pro's own auth id folder; `submit_kyc()` does the final check. The Pro build allows the CAMERA permission (needed for the selfie).
- Chat is for confirmed..in_progress bookings only; phone numbers are refused by `containsPhoneNumber` (comma is not a separator, so price lists pass). Server-side twins are in proposals, not applied.
- Late cancel = accepted pro and start under 2 hours away (`isLateCancellation`); stored as `cancellation_reason = 'Cancelled by customer (late)'`.
- Working hours (`provider_availability`) are applied by the customer's time picker only (`restrictToWindows`); no hours set means no limit.
- New realtime subscriptions must use a unique channel name (`Math.random` suffix): joining the same name twice crashes the app.
- Never show raw database text: wrap errors with `friendlyDbError` (shared). `P0001` and `22023` messages are written for people and pass through.
- Browser tests: `apps/mobile/e2e-web` (mocked backend); `features-flow.cjs` covers the port. The mock must serve any new table the app reads, or the screen shows an error.

## Design system

**apnabanda "Black + Blur" (owner decision 2026-10-29, replaces the old cream/terracotta HandyFix look).** Two themes: **Dark = "Black + Blur"** (the hero theme) and **Light = "Blue + White"**; Profile > Appearance offers Light / Dark / System (default System), saved on the device only (AsyncStorage `apnabanda.appearance`, `src/theme/theme.tsx`). Token NAMES are unchanged (`canvas`, `card`, `fg`, `muted`, `field`, `line`, `brand`, `strip`) plus `onbrand`, `tint`/`tint-fg`, `price`, `accent`, `ok`/`warn`/`danger` with `-bg`, `strip-fg`, `nav`; values per theme live in `src/theme/palettes.ts` and reach classes as NativeWind CSS variables (solid tokens are RGB channels so `bg-brand/15` works; see-through ones are whole values). For colour props (icons, switches) use `useThemeColors()`, never a hex. Text on a filled brand/danger surface is `text-onbrand` (white fails contrast on the dark theme's blue). Radius 14/20/28 = `rounded-tile`/`rounded-panel`/`rounded-hero`; 44 px touch targets; captions never under 12 px; Plus Jakarta Sans via `Text` from `@/components/text`. Blur (`Glass`, expo-blur) only on the bottom nav, top hero/status cards (`HeroCard`) and sheets; ordinary cards are translucent + border. Android and browsers without backdrop-filter get the solid translucent fallback; never animate blur. Every screen sits on `ScreenBackground` (two soft glows, blue top-left, amber lower-right). Logo: `AppLogo` / `Logo` (icon `assets/brand/apnabanda-icon.svg`, inlined in `src/components/logo-svg.ts`; keep both identical); the Pro app shows the dark pill with the amber PRO badge. One filled primary button per step. Keep screens simple and tappable on a low-end Android phone. **Admin web app (`apps/admin`)** uses the same design: shadcn variables in `src/index.css` hold the apnabanda Light (`:root`) and Dark (`.dark`) values (Dark see-through tokens as solid equivalents so opacity modifiers work), the same glows on `body`, `next-themes` with Light / Dark / System (storage key `apnabanda.appearance`) via `ThemeSwitch`, and `AdminLogo` (icon + wordmark + amber ADMIN badge) from `src/components/admin/Brand.tsx`. Copy that contradicts the business model (in-app payment, % discounts) is not ported.

## Mobile app install layout (important)

`apps/mobile` is deliberately **outside** the npm workspace: it is on React 19 / React Native 0.88 while `apps/admin` is on React 18, and npm hoisting split NativeWind and React Native across two `node_modules` (breaks `className` types and risks duplicate runtimes). It has its own `package-lock.json`, installs itself (`npm run mobile:install`), and links `@handyfix/shared` via `"file:../../packages/shared"`. Because EAS installs only inside `apps/mobile`, any runtime dependency of `packages/shared` (currently `zod`, `@supabase/supabase-js`) must **also** be listed in `apps/mobile/package.json`. Add Expo/native packages with `npx expo install` where network allows; otherwise pin to `node_modules/expo/bundledNativeModules.json`.

## Commands

```bash
npm install                # once, from the repo root (workspaces: apps/*, packages/*)
npm run typecheck | lint | test | build
npm run admin              # admin dev server
npm run mobile:install     # install apps/mobile (separate from the root install)
npm run mobile:typecheck   # tsc for the Expo app
npm run mobile:start       # Expo dev server (needs a development build on a phone)
```

`legacy/*` apps are not in the workspace; install inside each folder.
