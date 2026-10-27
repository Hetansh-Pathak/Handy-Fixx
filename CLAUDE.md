# HandyFix: rules for Claude Code

Home-services marketplace for tier-2 Indian cities. Migrating from three Vite web apps to **one React Native + Expo app** (customer + provider roles) with a web admin and a Supabase backend. Android first, iOS after the Play Store closed test.

## Layout

```
apps/mobile      Expo app (TypeScript, Expo Router, NativeWind). Route groups: (auth) (customer) (provider)
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

- **One app, two roles, one role per account.** Role is picked once after sign-up and routes to `(customer)` or `(provider)`. Request background location only when someone picks the provider role, never for customers.
- **Business model** (source: HandyFix-complete.pdf): customer pays the price shown, platform fee for customers is ₹0. Provider pays a flat fee on completed jobs only, from a prepaid wallet: ₹15 (<₹500), ₹30 (₹500-1,500), ₹50 (>₹1,500), based on the service bill, parts excluded. Provider sets a rate inside an admin price band. Price is locked at booking; the bill grows only via extra work the customer approves. Customer pays the pro directly (UPI/cash); Razorpay is used for wallet top-up.
- Fee-free launch: a provider's first 3 months or first 10 jobs (wallet check skipped, fee shown as "waived"). Declining or missing a request costs ₹0; the customer is offered the next best pros.
- Booking statuses in the DB today: pending → confirmed → on_the_way → in_progress → completed (cancelled from pending/confirmed). The PDF adds `arrived` between on_the_way and in_progress; it does not exist yet and needs a new migration (ask first). Completion uses a 4-digit code, stored hashed, attempt-limited.
- Disputes: 24 h window (48 h for repair quality), admin decides within 48 h, everything in the read-only audit log.
- The old 12% customer fee (`platform_fee`, `provider_amount`) is being removed. Do not port it.

## Design system

Black, white and gold. Gold is the accent (primary buttons, highlights); backgrounds black or white; one primary button per step. Keep screens simple and tappable on a low-end Android phone.

## Commands

```bash
npm install                # once, from the repo root (workspaces: apps/*, packages/*)
npm run typecheck | lint | test | build
npm run admin              # admin dev server
```

`legacy/*` apps are not in the workspace; install inside each folder.
