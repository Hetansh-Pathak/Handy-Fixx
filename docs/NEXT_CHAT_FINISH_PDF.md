# Handoff 2: finish what is left of `HandyFix-complete.pdf` (and fix the bugs the owner found on test)

Paste the short prompt at the bottom into a **new chat**. Everything the new chat needs is here, in `CLAUDE.md` and in `docs/PROGRESS.md`.
Written 2026-10-28, after the owner tested branch `Ritesh` in the browser. Earlier handoff (already done, checkpoints 1-6): `docs/NEXT_CHAT_PORT_LEGACY.md`.

**Branch:** all work on `Ritesh` (pushed up to `a6d3cb2`; the commit that adds this file is local until the owner says "push").
Never commit to `handyfix-merge-changes`. Ask before every push, pull request or new remote branch (a stop hook is not approval).

## 0. The owner (read first)
Non-developer founder on **Windows + VS Code + PowerShell**. Explain in simple words, give the exact folder for each command, **one command per code block**.
Prefers "do the best thing and tell me what you need". Ask before: any push, any database / RLS / edge-function change, anything that costs money.
Keep the look **cream `#FAF6EF` + terracotta `#C16430`** (locked) until the owner says otherwise.
The sandbox cannot run a phone and **cannot write to the live database** (Supabase MCP writes time out). Method that works: write
`supabase/proposals/*_PROPOSAL_NOT_APPLIED.sql`, a dry run `supabase/dryrun/N_*_DRYRUN.sql` (ends in `ROLLBACK;`) and `supabase/dryrun/apply_N_*_COMMIT.sql`,
test them on a throwaway local Postgres (`/usr/lib/postgresql/16/bin`, run as the `postgres` user via `runuser`), and the owner pastes the file into
Supabase > SQL Editor. Read-only checks on the live project (project id `jviwwhjwtyneqrguumro`) with `mcp__Supabase__execute_sql` are fine.

## 1. The bug the owner reported: "I've arrived" does nothing (DIAGNOSED, fix written, NOT applied)
**Symptom:** on the Pro job screen, after "Start trip", the **I've arrived** button does not work.
**Root cause (verified read-only on the live project):**
- The `arrived` value **is** in the live enum `booking_status` (the owner applied it) and the owner's `.env.local` has `EXPO_PUBLIC_ARRIVED_STATUS=1`, so the app shows the button.
- But the live trigger `zz_guard_booking_update` (function `guard_booking_update`) only allows a pro: `confirmed > on_the_way/in_progress/cancelled`,
  `on_the_way > in_progress/cancelled`, `in_progress > cancelled`. So **`on_the_way > arrived` and `arrived > in_progress` are refused** (`42501 Invalid status change`).
  It also refuses the column `tracking_active` (the app works around that, so tracking stays "on" after the trip).
- The app then showed the raw database text (a second bug: `features/provider/api.ts` `readable()` used `friendlyAuthError`, which lets text under 120 chars through).
**Done in this session (local commit):**
- `supabase/proposals/20261113000000_guard_allow_arrived_PROPOSAL_NOT_APPLIED.sql` + `supabase/dryrun/10_guard_arrived_DRYRUN.sql` + `supabase/dryrun/apply_10_guard_arrived_COMMIT.sql`.
  Changes only the body of `guard_booking_update()`: adds `on_the_way > arrived`, `arrived > in_progress/cancelled`, and `tracking_active` to the pro's allowed columns.
  Tested on a throwaway Postgres with a stub: before = `on_the_way > arrived` refused; after = all 11 cases pass (pro steps, `completed` still refused, money columns still refused, stranger and customer still blocked, older `on_the_way > in_progress` still works).
- `friendlyDbError` now explains a refused step in plain words ("The 'I've arrived' step is not switched on in the HandyFix database yet…"); the Pro API uses `friendlyDbError`. +1 test (636 shared tests).
**The owner still has to:** paste `supabase/dryrun/10_guard_arrived_DRYRUN.sql` in Supabase > SQL Editor (it prints `true, true` and rolls back), then `apply_10_guard_arrived_COMMIT.sql`.
Then test again on the Pro app: Accept > Start trip > **I've arrived** > Start job > enter the customer's code.
**Follow-ups worth a second small proposal (ask first):**
- `notify_customer_on_booking_change` has no branch for `arrived`, so the customer gets no "Your pro has arrived" notice (the old `notify_customer_on_booking_update` calls `in_progress` "Pro has arrived" — wrong wording).
- PDF p.10: "Arrival location logged as evidence". Nothing stores it yet (add `arrived_lat/arrived_lng/arrived_at` written by the arrived step; show it in the dispute timeline).
- The customer's cancel rule in the guard only allows `pending/confirmed`, while the app's late-cancel rule also counts `on_the_way/arrived/in_progress`. PDF p.4/p.11 say "cancel hidden once the pro starts the trip", so the app and `20261112` should be aligned (the late-cancel definition is still an owner decision).

## 2. What is DONE (do not rebuild; see `docs/PROGRESS.md` for details)
Customer: services, pros with own price, 3-step booking (clock picker, respects pro working hours), live status/map/ETA/call, next-best-pros, extra-work approve, bill card, report a problem + appeal, rating, Book again, late-cancel rule, Nearest sort, chat with phone blocking, notifications, About/Help/Delete account screens.
Pro: online switch + heartbeat, request alert, accept/decline with wallet check, job steps, extra work with bill photo, completion code, fee record, dispute reply/appeal, wallet (Razorpay top-up, ledger, withdraw, payout details), **9-step KYC wizard**, working hours, reviews, notifications, chat, About/Help/Delete account.
Admin (web): price bands, fees and disputes, KYC review, audit log. Shared: 636 tests; browser suites (mock backend) 159 checks.
Live DB already has: price bands + locked price (`enforce_booking_price`), `arrived` enum value, flat wallet fee + launch waiver (`booking_fees`), extra work + disputes, 266 catalogue sub-services.

## 3. What is LEFT, in order (the new chat starts with step A)
**A. Owner-blocked first (tell the owner plainly, one list, do not build around them):**
1. Apply proposal 10 (arrived fix, above). 2. Apply `20261108` reviews fix (**customers cannot rate today**), then `20261110` chat hardening (anyone can post in any chat), `20261109` area for Nearest, `20261112` late-cancel, `20261111` delete account + deploy `proposals/functions/delete-account`. Order and effect: `docs/LOCAL_TEST_GUIDE.md` Part 6. Also unapplied from before: `20261103` contact (Call button), `20261104` avatars, `20261105` attachment read fix, `20261106` catalogue — check which are still needed with a read-only query.
3. Decisions: pro's own rate approach (below), brand colour `#B05526` vs `#C16430`, late-cancel definition, chat open after job?
4. Accounts/keys: Firebase project (push), Google Maps key + `EXPO_PUBLIC_MAPS_ENABLED=1`, hosted privacy policy URL, Pro EAS project ID (`eas init` with `EXPO_PUBLIC_APP_VARIANT=provider`), Pro dev-build rebuild (camera + image-manipulator), set admin price bands (10 of 11 services have none).

**B. Build next (pilot scope, PDF p.2-12). Each = shared logic + tests first, then screen, commit, update PROGRESS.md:**
1. **Pro sets own rate inside the admin band** (PDF p.3, p.6). Live `provider_services` has no write policy for pros, and customers pick catalogue sub-items whose price is the same for every pro. Recommended option (a): per-sub-item rates (new table + change `enforce_booking_price`), screen `app/provider/rates.tsx`, band rule `packages/shared/src/money/price-band.ts`. Needs the owner's choice first, then a proposal.
2. **"Problem closing the job?" prompt** (PDF p.10): if the customer has not shared the code 2 hours after `in_progress` start, show a prompt to the pro and customer and give the admin a flag (not built; grep found nothing).
3. **Dispute auto-evidence timeline** (PDF p.11): price locked, live trip, arrival location, code-entry time, chat, approved extras attached to a dispute. Partly there (`features/disputes`, admin `AuditLog`); verify what the admin sees, then add arrival evidence (see 1. follow-ups).
4. **Complex-job quote flow** (PDF p.3): a ₹99-199 visit fee, the pro inspects and sends a quote, the customer accepts or declines, the visit fee is adjusted against the final bill. Not built. Needs an owner decision on the visit-fee share (PDF p.17).
5. **Masked calling** (PDF p.4, p.9): today the pro's and customer's real numbers are shown after acceptance. Masking needs a telephony provider: ask the owner before choosing one; until then keep numbers hidden until confirmed (already true).
6. **Push to a closed app** (slice 4b): FCM edge function + token table. Needs the owner's Firebase project. Until then a closed app gets no request. (The PDF's 30 s alert is replaced by "no countdown": do not add a timer.)
7. **Ranking** (PDF p.12): everyone ordered by rating, then distance, then response speed, never by money (`packages/shared/src/providers/ranking.ts` exists and is tested; wire it into the customer list and collect response-speed data). **Admin "flag suspicious pros"** (high acceptance, low completions) and "watch pending requests over 15 min", and reassign a booking.
8. **Customer rules check** (PDF p.4): email verified before first booking (done), 6-digit pincode required, cancel hidden once the pro starts the trip (align with 1. follow-ups).

**C. Queued checkpoints from before (owner postponed):** checkpoint 7 = screen-by-screen UI polish after the owner picks the look, small-screen and low-end Android checks, screen-reader labels, Hindi/regional text; checkpoint 8 = full check run, web export, phone test checklist.

**D. Later, per the PDF (do not start without the owner):** Featured boost + Pro subscription (after ~40 pros), urgent add-on and maintenance plans and real refunds (after in-app payments), HandyFix Plus, starter kit, training, instant payout, product add-ons, society tie-ups and ads (after 500+ bookings), corporate/hostel contracts, lead referrals, maids and event helpers.

**E. Security items found, not changed without asking:** `confirm_user_email` callable by anyone; provider OTP codes plaintext with no attempt limit; Aadhaar hash uses a public salt (needs a server-side secret); duplicate notify triggers on `bookings` and `messages`; free-tier database overload (17 policies on `bookings`, per-row `auth.uid()` calls). A performance proposal is the next DB task after the owner's approvals.

## 4. Hard rules (from `CLAUDE.md`, keep following)
Start of session: `git fetch origin`, `git switch Ritesh`, `git status -sb`, `git log --oneline HEAD..origin/Ritesh`, pull if behind, read `docs/PROGRESS.md`, then `npm install` and `npm run env:check`. Say what you found in one line.
Never change RLS/migrations/edge functions without asking; never edit an applied migration; no `any`; shared logic in `packages/shared` with Vitest first; do not edit `legacy/`; no `--no-verify`, no force-push.
Never show raw database text (`friendlyDbError`); new Realtime channels need a unique name (`Math.random` suffix); the mock backend in `apps/mobile/e2e-web` must serve any new table the app reads.
Do not port the old 12% fee, the QR / "record payment" step, or the 30-second timer. Business model: customer ₹0 fee and pays the pro directly; pro flat fee ₹15 / ₹30 / ₹50 from the wallet on completed jobs, parts excluded; first 3 months or 10 jobs fee-free; price locked at booking, only approved extras raise it.
Before saying a change is finished: from the repo root `npm run typecheck && npm run lint && npm run test && npm run build` and `npm run mobile:typecheck`, and report real results. Update `docs/PROGRESS.md` at the end of each slice and commit it with the work.

## 5. How the owner tests (so the new chat can say "now test this")
Web: `npm run web:customer` (http://localhost:8081), `npm run web:provider` (http://localhost:8082), `npm run admin`, all from `C:\Users\DELL\Handy-Fixx`. This uses the **real** database: name accounts "TEST …", and turn the test pro offline afterwards. Google sign-in, Razorpay, live map, push and background location only work on a phone development build. Full guide: `docs/LOCAL_TEST_GUIDE.md`.

## Short prompt to paste into the new chat
> Continue the HandyFix project on the branch `Ritesh`. Follow CLAUDE.md "Start every session" (git fetch, git switch Ritesh, status, pull if behind, read docs/PROGRESS.md). Then read docs/NEXT_CHAT_FINISH_PDF.md and the PDF HandyFix-complete.pdf. First, tell me in simple words which database proposals I still need to paste into Supabase (start with the "I've arrived" fix, proposal 20261113 / dryrun 10), then do section 3 step B in order, one vertical slice at a time, with tests in packages/shared first. Do not port the old 12% fee, QR payment or the 30-second timer. Ask me before every push and before any database, RLS or edge-function change. Keep the cream and terracotta look. Explain everything in simple words, with the exact folder for each command (I use Windows + VS Code), one command per code block.
