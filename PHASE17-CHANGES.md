# Phase 17 - Payment audit fixes

NOT built or run: this sandbox had no npm access (403 from the registry). Only a TypeScript syntax pass was possible.
Please run `cd customer-app && npm install && npm run build && npm test` (expect 76 tests: 75 + 1 new).

## Audit result
Checked the Razorpay migration, both Edge Functions and the webhook router against your real migrations:
column names (provider_notifications, provider_earnings.payout_id, 'processing' status), the 12% fee and the
36-character receipt id all match. The server-side money logic looks right. Not proven until a real test payment.

## Fixed
1. Booking.tsx still read the price from `?sub_price=` in the URL. The database re-prices on insert, so billing was
   safe, but the screen could show one total and charge another. The price now comes from `service_sub_items`
   (matched to the service). Confirm stays disabled until that price has loaded.
2. PayCard: after "payment accepted, confirming" it waited forever if realtime missed the update. It now re-checks
   every 4 seconds for up to a minute, then shows a calm "taking longer than usual" message.
3. My Bookings: a completed but unpaid booking had no way to pay from the list. It now shows a "Pay Rs X" button
   (opens the booking page with the Pay card) and a green "Paid" chip once settled.
4. verify-razorpay-payment: the call to Razorpay had no timeout. Now 10 seconds, then "pending" (the webhook settles it).

## Redeploy
`supabase functions deploy verify-razorpay-payment`

# Phase 17b - Customer/provider matching audit

NOT built, tested or run: no npm access (403) and no Postgres here. Only TypeScript syntax was checked.
Run `npm install && npm run build && npm test` in customer-app and provider-app, then apply
`database/migrations/20261012000000_provider_customer_matching.sql` on STAGING.

## Why customers saw no providers (confirmed in the code)
1. Area mismatch. Providers save CITY NAMES in `service_providers.pincodes`. The customer app browses with a 6-digit
   PINCODE (Home, tab bar, Profile, services grid) and compared the two with ===, so any customer who had a pincode
   saw zero pros. Only the hero "pick a city" box worked. New `lib/serviceArea.ts`: a pincode is matched through the
   customer's saved city; an unresolvable pincode shows online pros instead of nothing.
2. Heartbeat window. A pro counted as online only if `updated_at` was under 90s old. A phone that sleeps for 90s
   fell out of the list. Now 120s, and a view without `updated_at` falls back to the online flag instead of hiding everyone.
3. Needs migration 20261007 (adds name, city, updated_at to the public_providers view). If it was never applied,
   the pro profile page and the booking page fail. Check with: `select name, city, updated_at from public_providers limit 1;`

## Why providers could not save bank details (confirmed in the code)
- Bank fields were saved only by the big Save button, which stops with "Select at least one service" first. A new
  pro with no services ticked could never save a bank account. There is now a "Save payout details" button that works
  on its own, with validation (account 9-18 digits, IFSC format, UPI format), and the big Save no longer blocks on it.
- Custom prices were written to `provider_service_pricing`, a table no migration creates, errors ignored, then "Saved"
  was shown anyway. The migration creates it and the app now reports a failure.
- Services a pro ticks were saved only in `service_ids`; the customer's pro profile reads `provider_services`, which
  nothing wrote to (no write policy). `sync_my_provider_services()` keeps them in step.

## Other mismatches found and fixed
- Customers cannot read `service_providers` (phase 14), so booking screens showed "Your pro", no rating, no call button.
  New view `booking_provider_info` (only the caller's own bookings; phone only while the job is live).
- The provider profile page showed "Rs 0" for every service. It shows the catalogue price ("From Rs X").
- The provider's 30-second heartbeat set is_online=true again, undoing a manual "go offline". Fixed.

## Found, NOT changed (needs a decision)
- Provider "custom price" does nothing: the database prices every booking from the catalogue (phase 16). Either remove
  the field or build per-provider pricing properly.
- The repo's booking policies disagree with each other (some use user_id, some customer_id = profiles.id; the booking
  insert sets customer_id only). I cannot see your live policies, so run database/audit/rls_audit.sql and send me the result.
- A provider only appears to customers after admin approves KYC (kyc_status='approved' AND status='active'). An online
  provider who is still pending is invisible by design; the app does not say so.
