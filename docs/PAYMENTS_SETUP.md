# Payments setup: wallet recharge packs with Razorpay

For the owner. Pros recharge their HandyFix wallet with a pack (₹49, ₹99 or ₹199). Customers never pay through the app;
they pay the pro directly. Nothing here is live until you deploy it. Older notes about the QR flow are in
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
   - Active events: **payment.captured**, **order.paid**, **refund.processed**

## 2. Supabase secrets (never in the app, never in git)

Supabase → Edge Functions → Secrets (or the CLI):

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=the-string-you-made-up
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

## 3. Deploy (only after the database proposal 20261114000000 is applied)

The new versions are proposals in `supabase/proposals/functions/`. To deploy them, copy each folder over the one in
`supabase/functions/` (or ask Claude to), then:

```bash
supabase functions deploy create-wallet-topup-order
supabase functions deploy verify-wallet-payment
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` is required for the webhook only: Razorpay sends no Supabase login, and the signature check protects it.

## 4. Test with test money

Install a **development build** of the Pro app (Razorpay is a native module; Expo Go cannot open it).

| Test | Do | Expect |
|---|---|---|
| UPI success | Wallet → ₹49 → UPI → `success@razorpay` | "Payment received", wallet +₹49 within seconds; one `topup` row in `wallet_transactions` |
| UPI failure | UPI → `failure@razorpay` | Razorpay's error message; wallet unchanged |
| Card | Card `4111 1111 1111 1111`, any future date, any CVV, OTP from the test page | Same as UPI success |
| Cancel | Close the Razorpay window | "Nothing was charged" |
| Duplicate | Razorpay → Webhooks → the event → **Resend** | Still only one credit (`payment_events` result `duplicate`) |
| Refund | Razorpay → Payments → the payment → Refund | Wallet −₹49 (`refund_reversal`) |
| Wrong pack | Call the function with `{ "pack": 50 }` | 400 "Pick a recharge pack" |

If a payment succeeds but the wallet does not move: Supabase → Edge Functions → `razorpay-webhook` → Logs. A 401 means
the webhook secret in Razorpay and in Supabase differ.

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
