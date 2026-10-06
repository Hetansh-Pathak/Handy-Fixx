# Phase 13 - Security: financial integrity, booking guard, unanswered requests

NOT VERIFIED: no Postgres or npm in this sandbox. The SQL has been read carefully but never executed.
Run it on a STAGING Supabase project first. Syntax of the two TS files was checked only.

## Holes found in the existing migrations (all real)
A. provider_earnings INSERT policy was WITH CHECK (true): any role could add earnings rows.
   Providers could also UPDATE any column of their own rows (amount, status='paid').
B. payout_requests was FOR ALL: providers could insert any amount, mark it paid, or delete it.
C. bookings: providers could UPDATE any column (total_amount, provider_id, status).
D. block_direct_completion() never blocked anything (SECURITY DEFINER + pg_has_role('postgres','MEMBER') is
   always true). A provider could set status='completed' directly, skipping the customer's code, and the
   earnings trigger would credit 80% of a total_amount they could also edit.

## Added: database/migrations/20261008000000_financial_integrity.sql
- Earnings + payouts are read-only for clients (INSERT/UPDATE/DELETE revoked, old policies dropped)
- request_payout(): one locked transaction; amount is computed on the server; double-tap/two-device safe;
  checks approved KYC and a payout destination
- guard_booking_update() trigger (replaces the broken one): providers may only change trip/accept/decline
  columns with valid status transitions and can never set 'completed'; customers may only cancel
  pending/confirmed bookings; everything else (amounts, ids, dates) is blocked for clients. Service role,
  RPCs and triggers bypass it.
- expire_stale_pending_bookings(30) on pg_cron every minute (skipped with a NOTICE if cron is unavailable)
- expire_my_pending_booking(): customer-side fallback so a stuck "Finding your pro" resolves itself

## Changed
- provider-app Earnings.tsx: withdraw calls request_payout() (client no longer sends an amount)
- customer-app BookingConfirmation.tsx: fetches created_at; after 30 min pending it calls the fallback

## Staging checklist (please run these)
1. As a provider (anon key + their JWT): update bookings set status='completed' -> must FAIL.
2. Same: update bookings set total_amount=99999 -> must FAIL. update provider_earnings ... -> must FAIL.
3. insert into payout_requests (...) -> must FAIL. Withdraw button -> must work once, 2nd tap = "nothing".
4. Provider flow: accept, start trip, arrived, start job, code -> completed + earnings row created.
5. Customer cancels a pending booking -> works. Cancels an in_progress one -> fails.
6. Chat unread counters still reset for both sides.
7. Create a pending booking, wait 30 min (or call the function with p_minutes=0) -> cancelled.
If any legit action fails with a 42501 error, the guard's allowed-column list is missing a column your
app writes: add it to v_allowed in guard_booking_update().

## Product choices to confirm
- 30-minute request timeout (a booking for tomorrow also expires if no one accepts within 30 min)
- No minimum withdrawal (v_min = 1)

## Still open from the security list
Admin payout processing has no UI/RPC yet (admin-app never touched payout_requests). Rate limits on login,
RLS review of the remaining tables (messages, reviews, service_providers writes, storage buckets), Edge
Function input validation, Sentry.
