# Applying the SQL proposals safely

Nothing is applied. Owner decides; Claude only applies on an explicit "apply <name>".

Live facts (owner ran verify 04 and 05): `booking_status` is an enum WITHOUT `arrived`; 12% `enforce_booking_fee` trigger
live; old `enforce_dues_before_accept` live; 4 pros have a completed job and no payment record; kyc_reviewed_at/total_jobs exist.
Superseded: `20261002000003_server_side_fee_trigger` (do NOT apply; the pricing proposal replaces that trigger).

## Rules for every step
1. Take a backup first (Supabase → Database → Backups, or a branch via the dashboard). Apply in a Supabase **branch** if available.
2. One proposal at a time, in a transaction, off-peak. Each file has a ROLLBACK note at the bottom.
3. After each one: run its smoke test below, and `npm run test:e2e-web` is irrelevant (mock) so test on a phone/dev build.
4. Stop at the first surprise. Do not continue to the next.

## Order and why
| # | File | Risk | Safe to apply now? |
|---|---|---|---|
| 0 | `verify/06_guard_triggers_READONLY.sql` | none (read only) | Run first. The three guard triggers may block the new writes; their bodies decide whether 1 and 3 need edits |
| A | `20261103000000_customer_booking_contact` | Lowest: adds one function, changes no table or trigger | Yes, any time |
| B | `20261102000000_booking_status_arrived` | Low: adds an enum value (cannot be removed later). Needs the app flag after | Yes, but cannot run inside a transaction block with code that uses the value; run alone |
| C | `20261101000000_pdf_pricing_model` | Medium: stops the 12% fee. **Until D exists HandyFix collects nothing** | Only together with D, same day |
| D | `20261102000001_provider_wallet_fee` | Highest: replaces completion, accept rule and block reason | After 0 is reviewed, and right after C |

Minimum to run the NEW app end to end in production: C + D (+ B if you want "I've arrived").
If you want zero revenue gap and zero lockout risk: apply D first (it works under the old 12% model too, but the old
12% fee would then be charged to customers while pros also pay a flat fee, so do not leave that state for long), then C.

## Smoke tests after each
- A: as a customer with a confirmed booking: `select get_booking_provider_phone('<booking id>')` returns a number; as another user it errors/returns null.
- B: `select unnest(enum_range(null::booking_status))` lists `arrived`.
- C: create a booking from the app; stored `platform_fee = 0`, `total_amount = provider_amount`; the app shows no red price warning.
- D: a test pro completes a job with the code; a `booking_fees` row and one `cash_fee` ledger entry `fee:<booking>` exist; a pro with 0 balance outside launch cannot accept.

## After applying
Set `EXPO_PUBLIC_PDF_PRICING_LIVE=1` (after C) and `EXPO_PUBLIC_ARRIVED_STATUS=1` (after B) in the build env, rebuild.
