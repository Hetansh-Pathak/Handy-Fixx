# HandyFix progress (keep this file current: update it at the end of every slice)

Last updated: 2026-10-28 (DB proposals applied). Branch: `handyfix-merge-changes` (backup of the state before the flat-fee work: `develop`).
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
- Web reference screens for the new flows: `docs/reference-ui-flat-fee/` (spec only).

## NEXT (in this order)

1. **Set the app build env vars, then rebuild both apps.** The DB is ready (pricing, `arrived`, wallet fee, extra work and disputes are live). In EAS (`eas env:create --environment production`): `EXPO_PUBLIC_PDF_PRICING_LIVE=1` and `EXPO_PUBLIC_ARRIVED_STATUS=1`, then rebuild `customer-production` and `provider-production`. Set admin price bands on the Price bands page (no band is enforced until set). Run `supabase/verify/02_after_migration_check_READONLY.sql` and a real test booking end to end (accept, arrive, code, fee row).
2. **Test slice 5b on a phone** end to end (needs NEXT 1 builds): add extra work, approve, complete, fee record, report a problem.
3. **Pro KYC wizard, payout details form, pro sets own rate inside the band (slice 5b-rest).**
4. **Slice 4b: push to a closed app** (FCM edge function + token table). Needs a Firebase project from the owner.
5. **Slice 6:** chat with phone-number blocking, reviews, notifications, account deletion.
6. **Security (ask first, needs a migration):** `confirm_user_email` is callable by anyone; provider OTP codes are plaintext and unlimited. Hash the completion code if not already.
7. **Release prep:** Google Maps key + `EXPO_PUBLIC_MAPS_ENABLED=1`, EAS builds, Play Store closed test; delete `legacy/` at mobile parity.
8. **Later (PDF order):** late-cancel limit (3 in 30 days) and admin watch-list; ranking by rating → distance → response speed; Featured boost and Pro subscription (~40 pros); urgent add-on, real refunds, maintenance plans (after in-app payments); society tie-ups and ads (500+ bookings); new categories.

## BLOCKED on the owner

- Firebase project (for NEXT 4). Google Maps API key (NEXT 7).
- Approval to add security migrations (NEXT 6). Applied so far: pricing, arrived, wallet fee, extra work and disputes. Still NOT applied: `20261103` contact, `20261104` avatars, `20261105` attachment read fix, `20261106` catalogue (check which are needed).

## Open product decisions (PDF page 17)

Assumed by the code today: (1) customers pay the pro directly, not in the app; (2) 3 months or 10 jobs fee-free; (3) no cheaper "Book again" with the same pro; (4) urgent add-on not built until payments are in the app. Change the assumption here when the owner decides.

## Known gotchas

- **2026-10-28 outage:** the free-tier database stopped accepting connections at 09:01 UTC (also short timeouts at 07:08 and 08:25) and needed a restart. The performance advisor flags many RLS policies (17 on `bookings`) and per-row `auth.uid()` calls; a performance proposal is the next DB task (ask first). Close the `legacy/` dev servers (ports 3000-3002) when not needed: they also hit the live DB.

- `.env.local` files are untracked; after pulling or moving folders run `npm run env:check`.
- `apps/mobile` has its own install (`npm run mobile:install`) and needs a development build on a phone (Razorpay is native).
- The sandbox Claude uses cannot reach the live Supabase over plain HTTP; use the Supabase tools for read-only checks.
- Do not edit `legacy/`; do not port the old 12% customer fee.
