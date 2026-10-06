# Phase 16 - Razorpay payments

Verified with real tools: customer-app tsc clean, build OK, 75 vitest tests (53 -> 75); provider-app tsc clean, build OK, 26 tests.
The SQL migration was run TWICE on a real PostgreSQL 16 (stub schema, not your live one) and 15 behaviours were checked: tampered price,
wrong amount, replayed webhook, double payment, refund after payout, role permissions, legacy earnings.
NOT verified: any call to the real Razorpay API, the Checkout window in a browser, the migration against your live Supabase.

## How a payment flows
1. Pro enters the completion code -> booking is `completed` -> customer sees the black "Pay" card (BookingConfirmation).
2. Browser sends ONLY the booking id to `create-razorpay-order`. The server reads the amount from the database, creates the Razorpay order, stores a `payments` row.
3. Razorpay Checkout opens (UPI, cards, netbanking). On success the browser calls `verify-razorpay-payment`: signature check + Razorpay's own API says "captured" + stored amount matches.
4. `razorpay-webhook` does the same independently. If the customer closes the tab after paying, the webhook still marks it paid and the screen updates by itself.
5. `record_payment_captured()` (service_role only) sets payments=paid, bookings.payment_status=paid, earnings.payable=true, notifies the provider. Replays are harmless.
6. The provider can withdraw only `payable` earnings (request_payout was changed).

## Money bugs found and fixed
- Price came from the browser, including a `?sub_price=` URL parameter: a customer could book a job for Rs 1. Now a BEFORE INSERT trigger prices every booking from services / service_sub_items and forces payment_status='unpaid'.
- Earnings used a hard-coded 80% of the total (provider got 89.6% of the service charge while the app promised 100%). Now uses provider_amount / platform_fee. BUSINESS DECISION: provider keeps 100% of the service charge, platform keeps the 12% fee. Razorpay's fee (about 2%) comes out of that 12%. Change the CASE in the migration if you want a different split.
- Providers could withdraw money the customer never paid. Fixed with provider_earnings.payable (old rows are marked payable so nobody's existing balance disappears).
- CSP: customer vercel.json now allows checkout.razorpay.com (script, frame, connect) and the payment permission.
- Account deletion now refuses while a completed booking is unpaid (code `unpaid_booking`).

## You must do (in this order)
1. Razorpay Dashboard (TEST mode first) -> Account & Settings -> API Keys -> Generate Test Key. Make sure payment capture is AUTOMATIC (Settings -> Payment Capture).
2. `supabase secrets set RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=<any long random string you choose>`
3. Apply `database/migrations/20261011000000_razorpay_payments.sql` on staging, then production.
4. Deploy:
   - `supabase functions deploy create-razorpay-order`
   - `supabase functions deploy verify-razorpay-payment`
   - `supabase functions deploy razorpay-webhook --no-verify-jwt`
   - `supabase functions deploy delete-customer-account` (changed)
5. Razorpay Dashboard -> Webhooks -> Add: URL `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`, the same webhook secret as step 2, events: payment.captured, payment.failed, order.paid, refund.processed.
6. Make sure `ALLOWED_ORIGINS` includes the customer app URL.
7. Test with a real completed booking using Razorpay test UPI `success@razorpay` (and `failure@razorpay`). Check: card turns green, provider gets a notification, provider Earnings shows the money as ready to withdraw, a second tap on Pay does nothing.
8. Only then switch to live keys (KYC on Razorpay must be approved) and repeat steps 2 and 5 with live values.

## Money you move by hand (important)
Razorpay collects the money into YOUR Razorpay account. Providers are still paid through the existing payout flow: they tap Withdraw, an admin pays them (UPI/bank) in the admin Payouts screen. Automatic splits (Razorpay Route) need a separate business verification and are not built.
Refunds: issue them from the Razorpay dashboard. The webhook updates the booking. If the provider already requested a payout for that job the webhook logs `ALERT refund_after_payout_requested` and you must reconcile by hand.
Search the Supabase function logs for the word ALERT regularly (amount mismatch, double payment).

## Not done
- No GST invoice / receipt PDF, no tips, no cancellation fees, no partial refunds in-app.
- The old duplicate Bookings page buttons, provider Profile/KYC redesign, Capacitor, push notifications: unchanged from PHASE15B notes.
