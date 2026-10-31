# Attack walkthrough (own pre-test before the VAPT), 2026-11-01

Phase 5 of the security plan. I played the attacker against the **live rules** (tables, policies, triggers and the money,
completion and payment functions, copied from read-only catalog queries on the live project) running on a throwaway
Postgres 17, and against the **real Razorpay webhook code**. Nothing was run on the live project.

How it works: each attack is first tried against the database **as it is today** (holes show up as passing "HOLE" checks),
then against the database **after the planned proposals A, D and E** (the same attack must fail). The tests are
`supabase/tests/security/test-attacks.mjs` (112 checks) and `edge/webhook.test.ts` (12 checks).

## Result in one table

| Attack | Today | After proposals A + D + E |
|---|---|---|
| Read someone else's booking, completion code, extras, pro's phone | **Blocked** | Blocked |
| Change the price or fee after booking (customer or pro) | **Blocked** (money guard) | Blocked |
| Send a low price when creating the booking | **Blocked** (catalogue price is forced) | Blocked |
| Pro approves their own extra work | **Blocked** | Blocked |
| Skip the completion code (direct update, wrong code, brute force, other pro, customer) | **Blocked** (5 guesses, then a 15-minute lock) | Blocked |
| Replay the same payment event; send it 6 times at once | **Blocked** (credited exactly once) | Blocked |
| Forged / tampered / unsigned webhook | **Blocked** (401) | Blocked |
| Wrong-amount payment; reuse an old payment id on a new order | **Blocked** | Blocked |
| Call the wallet-crediting function yourself | **Blocked** | Blocked |
| **Create a booking that is already `completed` / `confirmed` / `paid`** (W1) | **POSSIBLE** | Blocked (E) |
| **Create a booking under someone else's account** (M8) | **POSSIBLE** | Blocked (D) |
| **Attach a file to someone else's booking** (M9) | **POSSIBLE** | Blocked (D) |
| **Name any file path as an extra's bill photo** (W3) | **POSSIBLE** | Blocked (E) |
| Completion code from a weak random source (W2) | Weak (4 digits from `random()`) | Secure source (E) |

## The holes found

### W1 (High): the guards only watch UPDATEs, so a booking could be born in any state
The price, payment, completion and status guards are all `BEFORE UPDATE`. On INSERT the only triggers fix the price and the
owner. A customer could therefore send any column the app never sets. Reproduced against the live rules:
- `status = 'completed'` for **any approved pro** → the customer can then **leave a review** (fake praise or revenge ratings)
  and **raise a dispute against that pro**, and HandyFix **never earns the 3% fee** (it is settled on the update to completed).
- `status = 'confirmed'` → a job is **forced onto a pro who never accepted**, skipping the wallet check (also update-only).
- `payment_status = 'paid'` → the pro may believe the customer already paid.
- `dispatch_state`, `current_ring`, `created_at`, `arrived_at` (dispute evidence), `coupon_code`, `final_amount`,
  `completed_at`, location and tracking fields could all be set by the customer.

**Fix: proposal E** (`20261125000004_booking_integrity`): a `BEFORE INSERT` trigger for signed-in users. The booking must start
as `pending` (anything else is an error); every server-owned column is reset to its starting value. The app sends none of
these (checked in the code), the server and the SQL editor are unaffected, admins signed in to the app are not exempt.
Tests: 5 forbidden statuses refused, 15 forged columns reset, a normal booking with everything the app sends still works,
no way left to obtain a `completed` booking without the pro's code.

### M8 / M9 (Medium): two ownership gaps, fixed in proposal D
A booking could be created with someone else's `customer_id` (it appeared in their list and notified the pro); any signed-in
user could attach a file to any booking id (the booking's pro could then open it).

### W2 (Low): completion codes came from `random()`
Four digits, five guesses then a 15-minute lock, so brute force is not practical either way. E switches to a secure source
(`gen_random_uuid()`); 600 generated codes were all 4 digits and the first digit was spread evenly over 0-9.

### W3 (Low): `add_booking_extra` accepted any text as the bill-photo path
The storage rule lets a booking's parties read a file that one of its extras names. A pro could name a file in someone else's
folder. E requires `<your auth id>/<this booking id>/...` (what the app builds) and refuses `..`.

## What held up (and why)
- **Reading others' data**: every table policy on bookings, completion codes, extras and attachments ties rows to the customer
  or the booking's own pro; stranger and other-pro queries return zero rows. `get_booking_provider`, `record_arrival`,
  `add_booking_extra`, `decide_booking_extra`, `confirm_cash_collected`, `complete_booking_with_code` and `get_search_state`
  all check who is calling (read in full).
- **Price**: the catalogue price is forced on insert (the customer's number is ignored); `guard_booking_money_columns` blocks
  changes to ten money columns on update; only the customer's approval can raise the total (extra work).
- **Completion**: `block_direct_completion` + `guard_booking_update` + the code function, which locks after 5 wrong guesses
  and keeps locking one guess at a time afterwards. The two switches that bypass the guards (`handyfix.completing`,
  `wallet.internal`) are session settings that an API caller cannot set (PostgREST only exposes functions in `public`);
  they are reachable only with a raw SQL connection, which the apps never get.
- **Payments**: `record_wallet_topup` locks the order row, answers `duplicate` for a paid order, checks the amount against the
  order and credits through an idempotent wallet entry (`idempotency_key` unique); six simultaneous identical events credit once.
  The webhook (the live version 14 and the repo copy have the identical check) uses HMAC-SHA256 with a constant-time compare and
  refuses to run without its secret. The credit functions are not callable by app users.

## Accepted risks (not technical holes)
- **Collusion**: a pro and a friend acting as a customer can run a fake job (the friend reads the code from the customer app,
  the pro enters it). Platform-level defences are business rules, not code: payout name matching (built), the fee-free launch
  limits, admin review of unusual patterns (same phone / device / address, many jobs in one hour). Worth watching after launch.
- The completion code is stored readable by design (the customer must see it); it is protected by RLS (customer only).
- A customer can send a booking to a specific pro (skipping dispatch); the pro can decline. Low impact.

## Not covered by this walkthrough (the VAPT should)
Sign-in brute force and password reset at Supabase Auth (a dashboard setting), email-OTP abuse in the deployed customer
functions, JWT / session handling on devices, the built mobile bundle and logs (secrets in the bundle, sensitive data in
logs), deep links, Razorpay Checkout on a real phone, rate limiting at the API gateway, denial of service, the storage API
with crafted paths, and anything in the admin site's browser code.

## Fix status
Proposals E, D and A are written and tested; none is applied. Order and commands: `docs/SECURITY_CHANGES.md`.
