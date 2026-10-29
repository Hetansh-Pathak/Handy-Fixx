# Applying the SQL proposals safely

Owner decides; Claude only applies on an explicit "apply <name>". Every proposal has a dry run (`supabase/dryrun/N_*_DRYRUN.sql`,
ends in ROLLBACK) and an apply file (`apply_N_*_COMMIT.sql`).

## Already applied to the live project (2026-10-28, checked read-only 2026-10-29)
`20261101` pricing (12% customer fee stopped, price bands, locked price) · `20261102000000` arrived status · `20261102000001`
wallet fee (₹15/₹30/₹50 slabs, launch waiver, accept check, `booking_fees`) · `20261107` extra work, disputes, `get_booking_provider`.
Never edit these files; `20261114000000` supersedes the fee part of `20261102000001`.
Superseded, do NOT apply: `20261002000003_server_side_fee_trigger`.

## Rules for every step
1. Take a backup first (Supabase → Database → Backups, or a branch via the dashboard). Apply in a Supabase **branch** if available.
2. One proposal at a time, in a transaction, off-peak. Each file has a ROLLBACK note at the bottom.
3. After each one: run its check below and test on a phone/dev build (`npm run test:e2e-web` uses a mock, it proves nothing about the database).
4. Stop at the first surprise. Do not continue to the next.

## Waiting, in this order
| # | Proposal (dry run) | Risk | Notes |
|---|---|---|---|
| 0 | `20261113000000` arrived-step guard (`10_guard_arrived`) | Low | **"I've arrived" does nothing on the Pro app today**; then set `EXPO_PUBLIC_ARRIVED_STATUS=1` |
| 1 | `20261108` reviews fix (`5_`) | Low | Customers cannot rate today. Most urgent |
| 2 | `20261110` chat hardening (`7_`) | Low | Closes "anyone can post in any chat" |
| 3 | `20261113000001` Labour & Shifting service (`11_`) | Lowest: data only | New service + 10 jobs, owner's prices |
| 4 | `20261113000002` pros pick jobs + own rate (`13_`) | Medium: replaces `enforce_booking_price` | Then set price bands for jobs in admin |
| 5 | `20261114000000` 3% fee, holds, auto-close (`12_`) | **Highest**: replaces accept, completion fee, wallet summary, payouts; adds a cron job | Same day as the app build with packs. Then run `verify/09_wallet_holds_READONLY.sql` |
| 6 | `20261109` pro area for Nearest (`6_`), `20261112` late-cancel limit (`9_`), `20261111` delete account (`8_`, + function) | Low | Any time |
| – | Edge Function proposals in `proposals/functions/` (`create-wallet-topup-order`, `razorpay-webhook`, `verify-wallet-payment`) | Payments | Deploy with or right after 5; see `docs/PAYMENTS_SETUP.md` |

| 7 | `20261122000000` booking payment orders (`21_`) | Low: new table, new column, new CHECK, new function; changes no existing function | Then deploy `create-booking-payment-order` (from `supabase/proposals/functions/`). Only useful together with Payments Section 2 (webhook marks paid) |

Not yet reviewed whether still needed: `20261103` contact, `20261104` avatars, `20261105` attachment read fix, `20261106` catalogue.

## Checks after each
- 1: a customer rates a completed job once; a second rating is refused.
- 3: `select count(*) from service_sub_items i join services s on s.id = i.service_id where s.slug = 'labour-shifting'` = 10.
- 4: a pro unticks a job on My services; booking that job with that pro is refused ("This pro does not do this job").
- 5: `verify/09` all ok; a test pro with ₹0 (launch over) cannot accept ("Recharge ₹49 to accept…"); after a ₹49 test top-up
  accept works, Wallet shows "₹12 reserved"; completing with the code charges ₹12 (`booking_fees`, one `fee:<booking>` entry).

## After applying
`EXPO_PUBLIC_PDF_PRICING_LIVE=1` and `EXPO_PUBLIC_ARRIVED_STATUS=1` in the build env (both migrations are live), rebuild.
