# Phase 14 - Security round 2: accounts, reviews, privacy, admin payouts

NOT VERIFIED: no Postgres or npm in this sandbox. SQL was read, never executed. TS files syntax-checked only.
Apply on STAGING first, in order: 20261008000000 then 20261009000000.

## Holes found (all from reading the existing migrations)
1. service_providers INSERT was unguarded: a new provider could insert themselves as kyc_status='approved',
   status='active', is_verified=true, rating=5 and skip KYC and admin review. (The old guard was UPDATE-only.)
2. The old guard was SECURITY DEFINER and relied on a session flag. It could also reject the legitimate
   earnings-totals trigger. Rewritten as an INVOKER trigger that only polices direct client writes.
3. reviews: any signed-in user could rate ANY provider/booking. Now only the customer of a completed booking,
   for that booking's provider, rating 1-5.
4. provider_notifications: WITH CHECK (true) let anyone notify any provider. Policy removed (triggers/RPCs are definer).
5. profiles: every signed-in user could read every customer's profile. Now owner only (+ existing admin policy).
6. Payouts could be created but never settled.

## Added
- database/migrations/20261009000000_account_and_review_integrity.sql
  (provider insert/update guard, review policy, notification + profile policy fixes, provider_earnings.payout_id,
   request_payout() now links earnings to the payout, admin_process_payout(), admin read policy on payouts)
- database/audit/rls_audit.sql - read-only checks to run in the Supabase SQL editor (tables without RLS,
  allow-all policies, write grants on money tables, messages/provider_locations policies, public buckets)
- admin-app: Payouts page (To pay / History; copy UPI/bank details; start processing, mark paid, mark failed
  with a required reason; failed returns the money to the provider's balance), route /payouts + sidebar item

## Staging checklist
1. As a new user, insert into service_providers with kyc_status='approved' -> row is saved as not_submitted/pending_approval.
2. As a provider: update service_providers set kyc_status='approved' / rating=5 -> must FAIL.
3. Normal provider onboarding, KYC submit, admin approve/reject, going online still work.
4. Complete a job -> earnings row + provider totals update (this is the path the old guard could break).
5. Insert a review for someone else's booking -> must FAIL; for your own completed booking -> works once.
6. As a customer, select * from profiles -> only your own row. Customer Profile page still loads.
7. Withdraw as provider -> Admin Payouts -> start processing -> mark paid: earnings become paid, provider notified.
   Mark another failed: money returns to Ready to withdraw.
8. Run database/audit/rls_audit.sql and read every row it returns.

## Known gaps / not done
- messages and provider_locations are not defined in any migration, so I could not audit them. The audit script
  prints their policies; chat and live location must be limited to the booking's customer and provider.
- Storage policies (booking attachments, KYC) only skimmed.
- Login rate limiting (Supabase Auth settings: enable CAPTCHA + rate limits in the dashboard), Edge Function input
  validation, and Sentry are still to do. Admin Payouts uses `as any` for the new RPC (types not regenerated).
- Admin payouts are manual: you pay by UPI/bank, then mark paid. Automating needs your payment gateway.
