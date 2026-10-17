# Phase 18: audit fixes

Not built or run here (npm was blocked, no Postgres): every edited file passes a TypeScript syntax parse, nothing more.
Run `npm run build` in each app and test on STAGING before production.

## 1. Your provider error: "Profile saved, but some services did not sync"
Saving calls the database function `sync_my_provider_services`. That function lives in
`20261012000000_provider_customer_matching.sql`. The toast appears when it is missing or Supabase has not reloaded its cache.
Fix: run, in the Supabase SQL editor and IN ORDER, any migrations from 20261007 onward you have not applied:
20261007, 20261008, 20261009, 20261010, 20261011, 20261012, 20261013. Each ends with `NOTIFY pgrst, 'reload schema';`.
The toast now shows the real database message instead of the generic text.

## 2. Admin panel
- Any failed role check (network blip, missing `has_role`) signed the admin out. Now it keeps the session and shows Retry.
- Token refreshes no longer re-run the role check; the check no longer runs inside the auth callback (deadlock risk).
- Dashboard rendered blanks when the RPC answered "Permission denied" as data. Now it shows the error.
- Searching Bookings failed always (`ILIKE` on a uuid column). Audit-log entity search had the same bug.
  Search text containing a comma or bracket broke the PostgREST filter; it is now sanitised.
- Dashboard tiles linked to `/bookings?status=pending` etc.; the pages ignored the parameter. They honour it now.

## 3. Database (`20261013000000_integrity_repairs.sql`, additive and re-runnable)
on_the_way status allowed; booking owner columns kept in sync with canonical policies; provider live-location policies fixed
(they compared a provider row id with a user id); `messages` and `service_sub_items` created if missing; unread counters and
"new message" notice; customer notifications for confirmed / on the way / started / completed / cancelled;
`report_job_issue()` + `job_issue_reports`; realtime publication. The two older live-location migrations no longer abort
on a clean database.

## 4. Provider app
- Heartbeat re-created the realtime channel every 30s and lost events in the gap.
- "Report issue" always failed (`provider_id = '__admin__'`) yet said "Issue reported". Now calls `report_job_issue`.
- The completion toast no longer promises earnings that are only withdrawable after the customer pays.
- Location uploads are throttled (8s), and failures are logged.
- Chat bubbles used a class that exists only in the customer app (no background); fixed.

## 5. Customer app
- Chat: text is kept if sending fails, errors are shown, duplicates are ignored, 2000-char limit matches the database.
- A provider with no services selected was listed under every service; now only providers who offer it.
- The `sub_price` URL parameter (ignored by the booking page) was removed.
- Upcoming-bookings badge used the UTC date and dropped on-the-way / in-progress jobs.
- Any RLS refusal said "Verify your email first"; now only for unverified people.
- `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` so Razorpay popups can talk back.

## Not verified
Admin pages Payouts/KycReview internals, provider Earnings/KYC/Schedule, customer MyBookings/PayCard were only sampled.
Run `database/migrations/audit/rls_audit.sql` on the live database and send the output for the remaining checks.
