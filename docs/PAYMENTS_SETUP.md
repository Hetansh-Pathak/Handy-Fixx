# Payments setup: wallet recharge packs with Razorpay

For the owner. Pros recharge their HandyFix wallet with a pack (₹49, ₹99 or ₹199). Customers pay a completed job either
in the app (Razorpay) or to the pro directly; see "Booking payments" below. Nothing here is live until you deploy it. Older notes about the QR flow are in
`WALLET_SETUP_GUIDE.md`.

## How money moves

1. The pro taps a pack in the Pro app. The app calls `create-wallet-topup-order`, which checks the pack (only 49, 99 or
   199), limits each pro to 5 orders per 10 minutes, and creates a Razorpay order (`notes.type = wallet_topup`).
2. Razorpay Checkout opens on the phone (UPI, card, net banking).
3. Razorpay calls `razorpay-webhook`. After checking the signature, it calls `record_wallet_topup`, which credits the
   wallet **once per payment and only if the paid amount equals the order**. The app never credits anything itself.
4. The app shows "Payment received, updating your wallet…" and refreshes until the credit appears. With
   `verify-wallet-payment` deployed it can confirm the payment instantly; the wallet is still credited only by step 3.
5. A refund made in the Razorpay dashboard (`refund.processed`) takes the money back out of the wallet.

## 1. Razorpay account, test mode first

1. Sign up at dashboard.razorpay.com and stay in **Test Mode** (toggle at the top).
2. Settings → API Keys → **Generate Test Key**. Keep the Key Id (`rzp_test_…`) and the Key Secret (shown once).
3. Settings → Webhooks → **Add New Webhook**:
   - URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook` (for this project: `https://jviwwhjwtyneqrguumro.supabase.co/functions/v1/razorpay-webhook`)
   - Secret: make up a long random string and keep it
   - Active events: **payment.captured**, **order.paid**, **refund.processed**, **payment.failed** (booking payments mark the order failed; no money moves)

## 2. Supabase secrets (never in the app, never in git)

Supabase → Edge Functions → Secrets (or the CLI):

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=the-string-you-made-up
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

## 3. Deploy the three functions

Recharge does **not** need the fee proposal 20261114000000: it only uses `wallet_topup_orders`, `record_wallet_topup`,
`record_refund`, `payment_events` and `wallet_transactions`, which are all live (checked read-only 2026-10-30). The
deployable versions are already in `supabase/functions/` (identical to `supabase/proposals/functions/`; a test fails if
they drift).

**Deployed 2026-10-30** (owner approved): `create-wallet-topup-order` v10, `verify-wallet-payment` v1, `razorpay-webhook`
v10 (the Section 0 version, top-ups only). Re-run the commands below only when they change.

From the repo root, signed in to the Supabase CLI (`npx supabase login` once):

```bash
npx supabase functions deploy create-wallet-topup-order --project-ref jviwwhjwtyneqrguumro
npx supabase functions deploy verify-wallet-payment --project-ref jviwwhjwtyneqrguumro
npx supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref jviwwhjwtyneqrguumro
```

`--no-verify-jwt` is required for the webhook only: Razorpay sends no Supabase login, and the signature check protects it.
The other two keep JWT checks on (only a signed-in pro can create or verify an order).

## 4. Test with test money

Install a **development build** of the Pro app (Razorpay is a native module; Expo Go cannot open it).

| Test | Do | Expect |
|---|---|---|
| UPI success | Wallet → ₹49 → UPI → `success@razorpay` | "Payment received", wallet +₹49 within seconds; one `topup` row in `wallet_transactions` |
| UPI failure | UPI → `failure@razorpay` | Razorpay's reason in plain words + "Nothing was charged" (never raw JSON); wallet unchanged |
| Card | Card `4111 1111 1111 1111`, any future date, any CVV, OTP from the test page | Same as UPI success |
| Cancel | Close the Razorpay window | "Nothing was charged" |
| Duplicate | Razorpay → Webhooks → the event → **Resend** | Still only one credit (`payment_events` result `duplicate`) |
| Refund | Razorpay → Payments → the payment → Refund | Wallet −₹49 (`refund_reversal`) |
| Wrong pack | Call the function with `{ "pack": 50 }` | 400 "Pick a recharge pack" |

If a payment succeeds but the wallet does not move: Supabase → Edge Functions → `razorpay-webhook` → Logs. A 401 means
the webhook secret in Razorpay and in Supabase differ.

## Booking payments (customer pays a completed job in the app, Payments Sections 1-2)

How it works: "Pay ₹X online" appears once the job is completed. `create-booking-payment-order` makes a Razorpay order for
the amount the database says (`booking_payable_paise`, the app never sends an amount). After Checkout,
`verify-booking-payment` only checks the signature for a quick "verified" message. **Only the webhook records money**:
`record_booking_payment` credits the pro once per payment, only when the amount equals the order, marks the booking paid
(`payment_method = online`) and, if the 3% fee was not already taken at completion, takes it now (₹0 in the launch
period) and releases the fee hold. The pro's earning is **on hold for 48 h after completion** (dispute window,
`wallet_settings.earning_hold_hours`), then withdrawable. A refund takes back the earning minus the fee pro rata (the fee
part goes back to the pro); the balance may go negative if the money was already spent.

Order (nothing of this is applied or deployed yet):

1. Apply `20261122000000` (dry run `supabase/dryrun/21_`, then `apply_21_`).
2. Apply `20261123000000` (dry run `22_`, then `apply_22_`). It works whether or not `20261114000000` is applied.
3. Run `supabase/verify/11_booking_payment_selftest_NOTHING_SAVED.sql`: it ends with an error on purpose that lists
   PASS/FAIL/SKIP lines and saves nothing. Every line must be PASS or SKIP.
4. Deploy, in this order:
   ```bash
   npx supabase functions deploy razorpay-webhook --no-verify-jwt --project-ref jviwwhjwtyneqrguumro
   npx supabase functions deploy verify-booking-payment --project-ref jviwwhjwtyneqrguumro
   npx supabase functions deploy create-booking-payment-order --project-ref jviwwhjwtyneqrguumro
   ```
   (the new webhook still handles top-ups exactly as before; all three deployable copies are already in
   `supabase/functions/`, identical to `supabase/proposals/functions/`, a test fails if they drift).
5. In Razorpay → Webhooks, make sure **payment.failed** is ticked as well.

Phone test (development builds of both apps, test mode):

| Test | Do | Expect |
|---|---|---|
| UPI | Customer: completed job → Pay ₹X online → UPI `success@razorpay` | "Payment verified", then the card says Paid. Pro: job says "Paid online ₹X"; Wallet history "Paid online +₹X, On hold until …" and the headline shows the on-hold amount; one `fee:<booking>` row only |
| Card | Card `4111 1111 1111 1111`, any future date, any CVV | Same as UPI |
| Failure | UPI `failure@razorpay` | Plain reason, booking stays unpaid, order `failed`, no wallet row; paying again works |
| Duplicate | Razorpay → Webhooks → the event → Resend | Still one credit (`payment_events` result `duplicate`) |
| Withdraw on hold | Pro tries to withdraw the online money before 48 h | Refused (money on hold) |
| Refund | Razorpay → Payments → Refund (full or partial) | `refund_reversal` row = earning minus fee pro rata; booking `refunded` / `partially_refunded` |

## Switching Razorpay account (for example a new test account)

Nothing about the account is stored in the code or the database: the key, secret and webhook secret live only in
Supabase secrets, and the app receives the public key id from `create-wallet-topup-order` at payment time.

1. In the **new** Razorpay account (same mode, test or live): generate API keys and add the webhook (section 1). The URL
   is the same, because it is your Supabase project's address, not tied to a Razorpay account.
2. Replace all three secrets together (a mix of old and new values fails):
   `npx supabase secrets set RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=… --project-ref jviwwhjwtyneqrguumro`
3. No redeploy is needed for the new secrets (functions read them on every call). Deploy only if the code changed.
4. In the **old** account, delete or disable the old webhook so it stops calling the function.
5. Orders created with the old account stay in `wallet_topup_orders` as `created` and are never credited (the new
   account cannot pay them). Payments already made on the old account must be refunded from the old dashboard.
6. Run the test table in section 4. A 401 in the `razorpay-webhook` logs = the webhook secret in Razorpay and in
   Supabase differ; "Razorpay keys are not configured" = a key secret is missing.

## 5. Going live

1. Complete Razorpay KYC (business PAN, bank account, website or app link with the privacy policy, refund and terms pages).
   Settlements reach your bank T+2 working days by default.
2. Switch the dashboard to **Live Mode**, generate live keys, add the same webhook again in Live Mode (live and test
   webhooks are separate) with a new secret.
3. `supabase secrets set` the three live values, redeploy nothing (functions read secrets at run time).
4. Make one real ₹49 recharge yourself, then refund it from the dashboard, and check both rows in `wallet_transactions`.

## Fees and records

- Razorpay charges about 2% per payment (UPI may be lower); HandyFix receives the pack amount minus that fee.
- Every payment event is kept in `payment_events`; every wallet movement is an immutable row in `wallet_transactions`.
