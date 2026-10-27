# HandyFix: rules for Claude Code

Home-services marketplace for tier-2 Indian cities. Migrating from three Vite web apps to **one React Native + Expo app** (customer + provider roles) with a web admin and a Supabase backend. Android first, iOS after the Play Store closed test.

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

- **One app, two roles, one role per account.** Role is picked once after sign-up (`/role-pick`) and routes to `/customer` or `/provider`. The role is a routing convenience, not a permission: a `service_providers` row means provider (authoritative), otherwise the `handyfix_role` flag on the auth user; real access is enforced by RLS and KYC. Never use `(group)/index` for two groups (groups add no URL segment, so they collide on `/`). Request background location only when someone picks the provider role, never for customers.
- **Business model** (source: HandyFix-complete.pdf): customer pays the price shown, platform fee for customers is ₹0. Provider pays a flat fee on completed jobs only, from a prepaid wallet: ₹15 (<₹500), ₹30 (₹500-1,500), ₹50 (>₹1,500), based on the service bill, parts excluded. Provider sets a rate inside an admin price band. Price is locked at booking; the bill grows only via extra work the customer approves. Customer pays the pro directly (UPI/cash); Razorpay is used for wallet top-up.
- Fee-free launch: a provider's first 3 months or first 10 jobs (wallet check skipped, fee shown as "waived"). Declining or missing a request costs ₹0; the customer is offered the next best pros.
- Booking statuses in the DB today: pending → confirmed → on_the_way → in_progress → completed (cancelled from pending/confirmed). The PDF adds `arrived` between on_the_way and in_progress; it does not exist yet and needs a new migration (ask first). Completion uses a 4-digit code, stored hashed, attempt-limited.
- Disputes: 24 h window (48 h for repair quality), admin decides within 48 h, everything in the read-only audit log.
- The old 12% customer fee (`platform_fee`, `provider_amount`) is being removed. Do not port it.

## Pricing facts (customer booking, slice 2)

- Model: PDF. The customer pays the pro's own rate, `platform_fee = 0`, price locked at booking. A chosen sub-item uses its catalogue price for every pro; otherwise `provider_services.custom_price`, then `services.base_price` (`resolveListedPrice`).
- **The database, not the app, owns the saved price.** The live trigger `enforce_booking_fee` (if the wallet migration is applied) adds 12% and ignores a pro's own rate. After every insert the app re-reads the stored totals and the confirmation screen shows a red "saved price is different" warning with a Cancel button (`reconcileQuote`). Run `supabase/verify/04_pricing_state_READONLY.sql` to see which trigger is live.
- `supabase/proposals/20261101000000_pdf_pricing_model_PROPOSAL_NOT_APPLIED.sql` (NOT applied) replaces that trigger, adds price bands and locks the price. Applying it alone means HandyFix collects no fee until the wallet-fee migration (slice 5) exists. Production builds keep "Confirm booking" disabled until `EXPO_PUBLIC_PDF_PRICING_LIVE=1`; dev builds can always book.
- A pro appears in the customer list only while online AND `service_providers.updated_at` is under 90 s old (`isProviderAvailable`). The provider app (slice 4) must therefore send a heartbeat while online, or pros vanish from the list.

## Provider flow facts (slice 4)

- Wallet (Option A): the live ledger is one signed balance (`get_wallet_summary()` → `available` and `dues`); that already equals the PDF's `{balance, due}`, so the shared fee rules use it as is. The flat fee is posted as a negative `cash_fee` entry once per booking (idempotent key `fee:<booking>`).
- **Proposal `20261102000001_provider_wallet_fee` (NOT applied)** adds the slab fee, launch waiver, accept check and a `booking_fees` audit row, and retires the old `unsettled_job` block. **Without it the new app's pros get locked out 24 h after their first job** (the live DB wants a "record payment" step the PDF flow does not have). The app shows PDF numbers either way; the database is the authority and its message is shown verbatim (`P0001`).
- Launch period (3 months or 10 jobs, whichever first) is counted from `service_providers.kyc_reviewed_at` and `total_jobs`; both columns already exist.
- Presence: a pro is listed only while `updated_at` is under 90 s old. The app touches it every 30 s while open, and via a foreground service (`PRESENCE_TASK`) while the app is in the background. Requests reach a pro through Realtime plus an 8 s poll; **there is no server push yet**, so a closed app gets no request (queued as slice 4b in docs/ROADMAP.md).
- Job steps use `providerStep`; `EXPO_PUBLIC_ARRIVED_STATUS=1` turns on "I've arrived" only after the `arrived` status exists in the database. Completion is only possible through `complete_booking_with_code` (never a direct update).
- Live trip location goes to `provider_locations` (keyed by the AUTH user id, not the provider row id) plus `bookings.provider_eta_minutes`; the customer map that reads it is slice 3.
- Background location is requested only when a pro goes online or starts a trip.

## Provider wallet facts (slice 5a)

- `provider/wallet` shows `get_wallet_summary()`, the ledger (`wallet_transactions`, own rows via RLS), payouts and earnings (completed bookings' `provider_amount`). Top-up: edge function `create-wallet-topup-order` (whole rupees ₹100-₹50,000 in the app) → `react-native-razorpay` (lazy, native only) → the server webhook credits the ledger; the app polls the ledger, it never credits locally. Withdrawal: `request_payout(p_amount)` RPC (needs approved KYC and saved UPI/bank details; the payout-details form is not built yet).
- Payment keys live only in Edge Function secrets. `react-native-razorpay` is a native module: it needs a development build (not Expo Go).

## Customer booking status facts (slice 3)

- The status screen (`customer/booking/[id]`) follows one booking: Realtime on the booking row and on `provider_locations`, plus an 8 s poll as a safety net. Waiting shows the pro's 30 s window; after it (or after a decline) `fetchAlternatives` offers the next best pros and `rebookWithProvider` books the same job with the chosen one and cancels the unanswered request. No database change is needed for this.
- The completion code (`booking_completion_codes`, customer-only RLS) is shown from `arrived`/`in_progress`.
- **Calling the pro needs a server function** (`supabase/proposals/20261103000000_customer_booking_contact`): the KYC migration hid `service_providers` from customers, so the old phone join returns nothing. Until it is applied the Call button is hidden (the app does not break).
- The embedded live map needs a Google Maps API key at build time (`GOOGLE_MAPS_API_KEY`, an EAS secret) and `EXPO_PUBLIC_MAPS_ENABLED=1`. Without them the card shows ETA and distance plus "Open in Google Maps".
- Rating, reporting a problem, extra-work approval and chat are not built yet (slices 5b and 6).

## Auth facts (verified against the repo, not assumed)

- Supabase email confirmation is OFF; customers verify their email through the OTP functions (`send-customer-otp` / `verify-customer-otp`), and the booking RLS rule uses `is_customer_email_verified()`. Google sign-in counts as verified.
- **Never call `confirm_user_email`** (legacy provider login did): it is `SECURITY DEFINER` with no `REVOKE`, so anyone can confirm any email. Fixing it needs a migration (ask first).
- The provider OTP functions (`send-provider-otp` / `verify-provider-otp`) store codes in plaintext with no attempt limit, unlike the customer ones. Do not build on them until they are hardened.
- Password reset uses the implicit flow: `handyfix://reset-password#access_token=…&type=recovery`. The Supabase dashboard must allow the redirect URL `handyfix://**`.

## Design system

Black, white and gold. Gold is the accent (primary buttons, highlights); backgrounds black or white; one primary button per step. Keep screens simple and tappable on a low-end Android phone.

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
