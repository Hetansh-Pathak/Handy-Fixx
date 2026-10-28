# Handoff: port the useful parts of `legacy/` into `apps/mobile`, matching the PDF plan

Paste the short prompt at the bottom into a new chat. Everything the new chat needs is in this file, in `CLAUDE.md`
and in `docs/PROGRESS.md`. Written 2026-10-28.

## 1. Mission
`apps/mobile` (Expo / React Native, one codebase, two store apps) must become the complete, production-quality product described in
`HandyFix-complete.pdf` (17 pages). The old web apps in `legacy/` (customer-app, provider-app) hold UI and flow ideas and some
features the new app does not have yet. Read them as a **spec**, rebuild them natively, and leave behind anything the PDF replaced.
Goal: best flow, functionality and UI/UX, one checkpoint at a time.

Do **not** edit `legacy/`. Do not port the old 12% customer fee, the QR / "record payment" step, the 30-second accept timer, or any
copy that says customers pay inside the app. These were replaced by the PDF model (see section 5).

## 2. State of play (all on GitHub, branch `handyfix-merge-changes`)
- Database (Supabase project `jviwwhjwtyneqrguumro`, "Handy-fix"): the four migrations are **applied live**: price bands and locked price
  (`enforce_booking_price`), `arrived` status, flat wallet fee with launch waiver (`booking_fees`, `enforce_wallet_before_accept`),
  extra work (`booking_extras`) and disputes (`booking_disputes`) with their RPCs.
- Mobile: auth (email + Google code), customer services, pros with prices, 3-step booking, live status and tracking, next-best-pros,
  extra-work approve/decline, bill card, report a problem + appeal. Pro: online switch, requests, accept/decline, job steps, add extra
  work (bill photo for parts), completion code, fee record, dispute reply/appeal, wallet (Razorpay top-up, ledger, withdraw).
- Shared logic: `packages/shared` (451 tests). Admin: `apps/admin` (price bands, fees and disputes, KYC review).
- **Never run on a real phone yet.** Treat everything as untested on device.
- Expo: customer project `@riteshkanara/handyfix` (ID in `apps/mobile/app.config.ts`). The Pro project does not exist yet (the owner runs
  `eas init` with `$env:EXPO_PUBLIC_APP_VARIANT="provider"` and sends the ID; then put it in `app.config.ts`).

## 3. What is missing in `apps/mobile`, and where the legacy reference is
Priority order (owner agreed): 1 pro onboarding, 2 customer completeness, 3 chat and notifications, 4 UI polish.

| # | Feature | PDF page | Legacy reference (read only) | New home in `apps/mobile` |
|---|---|---|---|---|
| 1 | **Pro KYC wizard** (9 steps, documents, selfie, admin approves) | 6 | `legacy/provider-app/src/pages/provider/KycOnboarding.tsx` (1,069 lines), `KycStatusBanner.tsx`, `supabase/migrations/provider/20261005000000_kyc_onboarding.sql`, `packages/shared/src/kyc/kyc.ts` | `app/provider/kyc/*` (a step per screen), `features/kyc/` |
| 2 | **Pro sets own rate inside the admin band** | 3, 6 | `legacy/provider-app/src/pages/provider/ProviderSettings.tsx`; band rule `packages/shared/src/money/price-band.ts`; DB trigger `enforce_provider_rate_band` | `app/provider/rates.tsx`, writes `provider_services.custom_price` |
| 3 | **Payout details form** (UPI / bank) | 8 | `legacy/provider-app/src/pages/provider/Wallet.tsx`, `Earnings.tsx` | extend `provider/(tabs)/wallet.tsx` |
| 4 | **Rating** (one review per completed booking) | 4, 10 | `legacy/customer-app/src/pages/MyBookings.tsx` (review part) | `features/reviews/`, on `customer/booking/[id]` |
| 5 | **Reviews list for the pro** | 6 | `legacy/provider-app/src/pages/provider/Reviews.tsx` | `app/provider/reviews.tsx` |
| 6 | **Sort by Nearest** on the pro list | 5 | `packages/shared/src/providers/ranking.ts`, `geo/distance.ts` | `customer/service/[slug].tsx` (add chip) |
| 7 | **Booking chat** with phone-number blocking | 4, 12 | `legacy/*/src/components/**/BookingChat.tsx`; table `messages` | `features/chat/`, both booking screens. Number blocking logic goes in `packages/shared` with tests |
| 8 | **Notifications screen** | 4 | `legacy/customer-app/src/pages/Notifications.tsx`, `provider/Notifications.tsx`; tables `customer_notifications`, `provider_notifications` | `app/customer/notifications.tsx`, `app/provider/notifications.tsx` |
| 9 | **Provider schedule / availability** | 6 | `legacy/provider-app/src/pages/provider/Schedule.tsx`; table `provider_availability` | `app/provider/schedule.tsx` |
| 10 | **Account deletion** (store requirement) | n/a | none (new) | settings screens; needs an edge function, ask first |
| 11 | **Late-cancel limit** (3 in 30 days pauses instant booking a week) | 4, 11 | `packages/shared/src/booking/cancellation.ts` is written and tested but unused | wire into the booking flow |
| 12 | About / Contact / Terms | n/a | `legacy/customer-app/src/pages/About.tsx`, `Contact.tsx`, `provider/TermsAndConditions.tsx` | `help` screens |
| 13 | **UI polish pass** | all | see section 6 | all screens |

Later (PDF order, do not start without the owner): push to a closed app (needs a Firebase project), ranking by rating, distance and
response speed, Featured boost and Pro subscription (after about 40 pros), urgent add-on and maintenance plans (after in-app payments),
society tie-ups and ads (after 500+ bookings).

## 4. Hard rules (from `CLAUDE.md`, the owner's standing instructions)
- **Ask before every push**, pull request or new remote branch. A "stop hook" asking for a push is not approval. `git fetch` first and
  say whether it is a plain fast-forward. Never force-push or rewrite published history.
- **Never change RLS, migrations or Edge Functions without asking first.** New SQL goes in `supabase/proposals/`, dry run with
  `ROLLBACK;`, then ask. Never edit an applied migration.
- Shared logic goes in `packages/shared` **with Vitest tests first**; screens only call it. No `any`. Strict TypeScript.
- One vertical slice at a time, commit after each working slice, update `docs/PROGRESS.md`.
- Before saying anything is finished run from the repo root: `npm run typecheck && npm run lint && npm run test && npm run build`, and
  `npm run mobile:typecheck`. Report real results, including failures.
- Start every session: `git fetch origin`, `git status -sb`, `git log --oneline HEAD..origin/<branch>`, pull if behind, read `docs/PROGRESS.md`,
  then `npm install` and `npm run env:check`.
- Keep `apps/mobile` outside the npm workspace (own `package-lock.json`; runtime deps of `packages/shared` must also be in
  `apps/mobile/package.json`).

## 5. Product decisions that override the legacy apps and parts of the PDF
- Customer pays **₹0 platform fee**; pays the pro directly (UPI/cash). Provider pays flat ₹15 (<₹500), ₹30 (₹500-1,500), ₹50 (>₹1,500)
  from the wallet on completed jobs only; parts excluded; first 3 months or 10 jobs fee-free.
- **No accept countdown** (owner decision replaces the PDF's 30 s): a request stays open until answered or its booked time passes.
- Booking time on a clock: any 15-minute step 8:00-20:00, at least 1 hour ahead.
- One role per account; two store apps from one codebase (`EXPO_PUBLIC_APP_VARIANT` = `customer` | `provider`).
- Open PDF decisions (assumed): customers pay the pro directly; launch period yes; no cheaper "Book again"; urgent add-on later.
- Never call `confirm_user_email` (anyone can confirm any email). Provider OTP codes are plaintext: do not build on them until hardened.

## 6. Design brief (the owner thinks the UI is not production-level yet)
Current system (owner decision): cream `#FAF6EF`, white cards, charcoal text, terracotta `#C16430`, dark strip `#1C1C1C`, Plus Jakarta Sans,
lucide icons, NativeWind. Tokens in `apps/mobile/tailwind.config.js` and `src/theme/colors.ts`; components in `src/components/ui.tsx`
(`Screen`, `Card`, `Button`, `TextField`, `Chip`, banners). The PDF itself is dark with amber, the old web apps were dark and gold: **ask
the owner which look to keep before restyling** (cream/terracotta or PDF dark/amber). Then:
- one primary button per step; 48 px minimum tap targets; works on a low-end Android phone and small screens
- loading skeletons and empty states instead of blank screens; clear error text with a retry
- consistent spacing, type scale, card elevation; no raw database error messages shown
- check contrast (WCAG AA) and screen-reader labels; Hindi/regional text can come later
- visual references: `docs/reference-ui-flat-fee/` (PDF concept screens), `docs/customer-app-preview.png`, the legacy screens

## 7. Environment and gotchas learned the hard way
- Owner runs everything on **Windows + VS Code**, PowerShell. Explain every step simply and name the folder to `cd` into. Give each
  command in its own code block.
- The cloud sandbox cannot run the phone app. It can run typecheck, lint, tests, `expo export --platform web`, and read-only Supabase
  checks via the Supabase MCP tools.
- **Supabase MCP writes time out** (the approval prompt does not reach the owner). The working method: write
  `supabase/dryrun/*_DRYRUN.sql` (ends in `ROLLBACK;`) and `apply_*_COMMIT.sql`, send the file, and the owner pastes it into
  Supabase > SQL Editor. Verify afterwards with a read-only query.
- **Free-tier database overload:** on 2026-10-28 the database stopped answering at 09:01 UTC and needed a restart. The performance advisor
  flags `bookings` with 17 overlapping policies and per-row `auth.uid()` calls. A performance proposal is the next DB task; do it before
  adding more load. The old `legacy/` dev servers (ports 3000-3002) also hit the live database: close them.
- Expo/EAS: dev build needs `eas build --profile customer-dev --platform android` from `apps/mobile`. `.env.local` is not uploaded to EAS;
  expo.dev environment variables (6 `EXPO_PUBLIC_*`) are set by the owner. Razorpay and native Google sign-in need a development build, not
  Expo Go. Google sign-in needs a Web client ID (in Supabase and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) plus an Android client per package
  and SHA-1 (`docs/GOOGLE_SIGNIN_SETUP.md`).
- Use `AskUserQuestion` sparingly; the owner prefers "do the best thing and tell me what you need".

## 8. Owner's local legacy edits
The owner made some changes today **inside `legacy/` on their own computer** that are not on GitHub. They will either push a branch named
`my-legacy-changes` or paste `git diff --stat`. First task of the new chat: look at those changes, keep what matches the PDF, port it to
`apps/mobile`, and discard what the PDF replaced.

## 9. Suggested checkpoints (commit and update PROGRESS.md after each)
1. Sync, read docs, inspect the owner's legacy changes, write the port plan.
2. Pro KYC wizard + rate-in-band + payout form (the pro cannot join without these).
3. Customer: Nearest sort, rating, late-cancel limit.
4. Chat with number blocking + notifications (both apps).
5. Provider schedule, reviews, About/Contact/Terms, account deletion proposal.
6. UI polish pass over every screen (after the owner picks the look).
7. Full check run, web export, then a phone test checklist for the owner.

## Short prompt to paste into the new chat
> Continue the HandyFix project. Follow CLAUDE.md "Start every session" (git fetch, status, pull if behind, read docs/PROGRESS.md). Then read docs/NEXT_CHAT_PORT_LEGACY.md and do checkpoint 1: inspect my local legacy changes (branch `my-legacy-changes` or the diff I paste), then port every legacy feature that matches HandyFix-complete.pdf into apps/mobile, one checkpoint at a time, with tests in packages/shared first. Do not port the old 12% fee, QR payment or the 30-second timer. Ask me before every push and before any database, RLS or edge-function change. Explain everything in simple words, with the exact folder for each command (I use Windows + VS Code).
