-- READ ONLY. Run after applying 20261114000000_fee_3pct_holds_autoclose. Changes nothing.
-- Every row should say ok = true, except the two lists at the end, which are for the admin to look at.

SELECT 'fee 3% min 5 max 50' AS check_name,
       (fee_for_service_bill(1), fee_for_service_bill(250), fee_for_service_bill(400), fee_for_service_bill(1667), fee_for_service_bill(0))
         = (5::numeric, 8::numeric, 12::numeric, 50::numeric, 0::numeric) AS ok
UNION ALL SELECT 'wallet_holds table with RLS', EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.wallet_holds'::regclass AND relrowsecurity)
UNION ALL SELECT 'accept trigger present', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass AND tgname = 'enforce_wallet_before_accept')
UNION ALL SELECT 'release trigger present', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass AND tgname = 'release_wallet_hold')
UNION ALL SELECT 'auto-close scheduled every 15 min', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-complete-stale-jobs' AND schedule = '*/15 * * * *')
UNION ALL SELECT 'auto-close start date set', (SELECT auto_close_since IS NOT NULL FROM wallet_settings WHERE id = true)
UNION ALL SELECT 'old 12% function removed', NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_booking_fee')
UNION ALL SELECT 'internal functions not callable by apps',
       NOT has_function_privilege('authenticated', 'public.auto_complete_stale_jobs()', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.settle_booking_fee(uuid)', 'EXECUTE')
UNION ALL SELECT 'no held fee on a finished booking',
       NOT EXISTS (SELECT 1 FROM wallet_holds h JOIN bookings b ON b.id = h.booking_id
                   WHERE h.status = 'held' AND b.status::text IN ('completed', 'cancelled'));

-- For the admin: jobs stuck in progress before the change (auto-close leaves them alone; owner decision 2026-10-29).
SELECT 'stuck before the change' AS list, b.id, b.provider_id, b.started_at, b.provider_amount
FROM bookings b, wallet_settings s
WHERE s.id = true AND b.status::text = 'in_progress' AND (b.started_at IS NULL OR b.started_at < s.auto_close_since)
ORDER BY b.started_at;

-- For the admin: pros who still owe money from the old model (they must recharge before accepting).
SELECT 'owes money' AS list, provider_id, -SUM(amount) AS owes
FROM wallet_transactions GROUP BY provider_id HAVING SUM(amount) < 0;
