-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 - PRE-FLIGHT CHECK (READ-ONLY: changes NOTHING)
-- Paste this whole file in Supabase -> SQL Editor -> Run.
-- Look at the "result" column:
--   OK / OK (fresh) / INFO  -> good
--   WARN                    -> read the detail; usually fine
--   MISSING                 -> STOP and tell me which row(s) say MISSING
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result, detail) AS (
  SELECT 1, 'Table bookings', CASE WHEN to_regclass('public.bookings') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 2, 'Table service_providers', CASE WHEN to_regclass('public.service_providers') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 3, 'Table services', CASE WHEN to_regclass('public.services') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 4, 'Table provider_earnings', CASE WHEN to_regclass('public.provider_earnings') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 5, 'Table payout_requests', CASE WHEN to_regclass('public.payout_requests') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 6, 'Table booking_completion_codes', CASE WHEN to_regclass('public.booking_completion_codes') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 7, 'Table admin_audit_log', CASE WHEN to_regclass('public.admin_audit_log') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 8, 'Table user_roles', CASE WHEN to_regclass('public.user_roles') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 9, 'Table customer_notifications', CASE WHEN to_regclass('public.customer_notifications') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 10, 'Table provider_notifications', CASE WHEN to_regclass('public.provider_notifications') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 11, 'Table service_sub_items', CASE WHEN to_regclass('public.service_sub_items') IS NOT NULL THEN 'OK' ELSE 'WARN' END, 'Prices of sub-items cannot be checked server-side; the app price will be trusted'
  UNION ALL
  SELECT 12, 'Table profiles', CASE WHEN to_regclass('public.profiles') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 13, 'Function has_role(uuid,text)', CASE WHEN to_regprocedure('public.has_role(uuid,text)') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 14, 'Function complete_booking_with_code(uuid,text)', CASE WHEN to_regprocedure('public.complete_booking_with_code(uuid,text)') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 15, 'Function prevent_privileged_column_update()', CASE WHEN to_regprocedure('public.prevent_privileged_column_update()') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 16, 'Function enforce_kyc_before_online()', CASE WHEN to_regprocedure('public.enforce_kyc_before_online()') IS NOT NULL THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 17, 'Column bookings.provider_amount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='provider_amount') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 18, 'Column bookings.platform_fee', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='platform_fee') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 19, 'Column bookings.total_amount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='total_amount') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 20, 'Column bookings.payment_status', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_status') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 21, 'Column bookings.completed_at', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='completed_at') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 22, 'Column bookings.customer_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='customer_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 23, 'Column bookings.customer_name', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='customer_name') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 24, 'Column bookings.sub_item_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='sub_item_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 25, 'Column bookings.service_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='service_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 26, 'Column bookings.provider_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='provider_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 27, 'Column bookings.status', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='status') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 28, 'Column service_providers.kyc_status', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='kyc_status') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 29, 'Column service_providers.is_online', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='is_online') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 30, 'Column service_providers.status', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='status') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 31, 'Column service_providers.bank_account_number', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='bank_account_number') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 32, 'Column service_providers.bank_account_name', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='bank_account_name') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 33, 'Column service_providers.bank_ifsc', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='bank_ifsc') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 34, 'Column service_providers.upi_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='upi_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 35, 'Column service_providers.user_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='user_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 36, 'Column service_providers.full_name', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='full_name') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 37, 'Column service_providers.phone', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='phone') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 38, 'Column service_providers.email', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_providers' AND column_name='email') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 39, 'Column service_sub_items.base_price', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_sub_items' AND column_name='base_price') THEN 'OK' ELSE 'WARN' END, ''
  UNION ALL
  SELECT 40, 'Column service_sub_items.id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_sub_items' AND column_name='id') THEN 'OK' ELSE 'WARN' END, ''
  UNION ALL
  SELECT 41, 'Column customer_notifications.user_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='user_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 42, 'Column customer_notifications.type', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='type') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 43, 'Column customer_notifications.title', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='title') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 44, 'Column customer_notifications.message', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='message') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 45, 'Column customer_notifications.booking_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='booking_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 46, 'Column customer_notifications.data', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notifications' AND column_name='data') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 47, 'Column provider_notifications.provider_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_notifications' AND column_name='provider_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 48, 'Column provider_notifications.type', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_notifications' AND column_name='type') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 49, 'Column provider_notifications.title', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_notifications' AND column_name='title') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 50, 'Column provider_notifications.message', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_notifications' AND column_name='message') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 51, 'Column provider_notifications.data', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='provider_notifications' AND column_name='data') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 52, 'Column payout_requests.provider_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='provider_id') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 53, 'Column payout_requests.amount', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='amount') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 54, 'Column payout_requests.status', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='status') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 55, 'Column payout_requests.requested_at', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='requested_at') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 56, 'Column payout_requests.processed_at', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payout_requests' AND column_name='processed_at') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 57, 'bookings.payment_status is text', CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_status') = 'text' THEN 'OK' ELSE 'WARN' END, COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='payment_status'),'column missing (migration adds it)')
  UNION ALL
  SELECT 58, 'bookings.status type', CASE WHEN true THEN 'OK' ELSE 'OK' END, COALESCE((SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='status'),'?')
  UNION ALL
  SELECT 59, 'At least one admin exists', CASE WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN 'OK' ELSE 'WARN' END, 'No admin in user_roles: you will not be able to use the admin Wallet page'
  UNION ALL
  SELECT 60, 'Trigger enforce_kyc_before_online present', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_kyc_before_online' AND NOT tgisinternal) THEN 'OK' ELSE 'WARN' END, 'Will be (re)created by the migration if needed'
  UNION ALL
  SELECT 61, 'Trigger prevent_privileged_column_update present', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='prevent_privileged_column_update' AND NOT tgisinternal) THEN 'OK' ELSE 'WARN' END, 'Will be (re)created by the migration if needed'
  UNION ALL
  SELECT 62, 'Trigger trg_block_direct_completion present', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_block_direct_completion' AND NOT tgisinternal) THEN 'OK' ELSE 'WARN' END, 'Will be (re)created by the migration if needed'
  UNION ALL
  SELECT 63, 'Realtime publication exists', CASE WHEN EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN 'OK' ELSE 'MISSING' END, ''
  UNION ALL
  SELECT 64, 'Wallet already installed?', CASE WHEN to_regclass('public.wallet_transactions') IS NULL THEN 'OK (fresh)' ELSE 'WARN' END, 'wallet_transactions already exists - the migration is safe to re-run'
  UNION ALL
  SELECT 65, 'Existing bookings with wrong total (info)', CASE WHEN true THEN 'INFO' ELSE 'INFO' END, (SELECT COUNT(*)::text FROM public.bookings WHERE total_amount <> COALESCE(provider_amount,0)+COALESCE(platform_fee,0)) || ' rows (old rows are left untouched)'
  UNION ALL
  SELECT 66, 'Open jobs right now (info)', CASE WHEN true THEN 'INFO' ELSE 'INFO' END, (SELECT COUNT(*)::text FROM public.bookings WHERE status::text IN ('pending','confirmed','on_the_way','in_progress')) || ' open bookings - run the migration when this is low'
  UNION ALL
  SELECT 67, 'Approved providers (info)', CASE WHEN true THEN 'INFO' ELSE 'INFO' END, (SELECT COUNT(*)::text FROM public.service_providers WHERE kyc_status='approved') || ' approved providers'
  UNION ALL
  SELECT 68, 'Aadhaar key setting (info)', CASE WHEN true THEN 'INFO' ELSE 'INFO' END, CASE WHEN current_setting('app.aadhaar_hmac_key', true) IS NULL OR current_setting('app.aadhaar_hmac_key', true) = '' THEN 'NOT SET in this session (set it once with ALTER DATABASE if KYC needs it)' ELSE 'set' END
)
SELECT check_name, result, detail FROM checks ORDER BY (result IN ('MISSING')) DESC, (result = 'WARN') DESC, n;
