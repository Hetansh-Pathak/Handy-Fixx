-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 - AFTER-MIGRATION CHECK (READ-ONLY). Run after the real migration.
-- Every row in "result" must say OK.
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result) AS (
  SELECT 1,  'wallet_transactions table', CASE WHEN to_regclass('public.wallet_transactions') IS NOT NULL THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 2,  'booking_payments table', CASE WHEN to_regclass('public.booking_payments') IS NOT NULL THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 3,  'wallet_topup_orders table', CASE WHEN to_regclass('public.wallet_topup_orders') IS NOT NULL THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 4,  'payment_disputes table', CASE WHEN to_regclass('public.payment_disputes') IS NOT NULL THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 5,  'wallet_settings has 1 row (limit ' || COALESCE((SELECT dues_limit::text FROM public.wallet_settings LIMIT 1),'?') || ')',
                       CASE WHEN (SELECT COUNT(*) FROM public.wallet_settings) = 1 THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 6,  'ledger is append-only (trigger)', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='wallet_tx_no_update') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 7,  'RLS on wallet_transactions', CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.wallet_transactions'::regclass) THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 8,  'RLS on booking_payments', CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.booking_payments'::regclass) THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 9,  'clients CANNOT insert into wallet_transactions', CASE WHEN NOT has_table_privilege('authenticated','public.wallet_transactions','INSERT') AND NOT has_table_privilege('anon','public.wallet_transactions','INSERT') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 10, 'clients CANNOT update/delete wallet_transactions', CASE WHEN NOT has_table_privilege('authenticated','public.wallet_transactions','UPDATE') AND NOT has_table_privilege('authenticated','public.wallet_transactions','DELETE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 11, 'clients CANNOT write provider_earnings', CASE WHEN NOT has_table_privilege('authenticated','public.provider_earnings','INSERT') AND NOT has_table_privilege('authenticated','public.provider_earnings','UPDATE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 12, 'clients CANNOT write payout_requests', CASE WHEN NOT has_table_privilege('authenticated','public.payout_requests','INSERT') AND NOT has_table_privilege('authenticated','public.payout_requests','UPDATE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 13, 'no open INSERT/UPDATE policy left on provider_earnings',
                       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='provider_earnings' AND cmd IN ('INSERT','UPDATE','ALL')) THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 14, 'no client-write policy left on payout_requests',
                       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payout_requests' AND cmd IN ('INSERT','UPDATE','ALL','DELETE')) THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 15, 'app users cannot call wallet_post()', CASE WHEN NOT has_function_privilege('authenticated','public.wallet_post(uuid,uuid,text,numeric,text,text,text,uuid)','EXECUTE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 16, 'app users cannot call record_qr_payment()', CASE WHEN NOT has_function_privilege('authenticated','public.record_qr_payment(text,uuid,text,bigint)','EXECUTE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 17, 'server (service_role) can call record_qr_payment()', CASE WHEN has_function_privilege('service_role','public.record_qr_payment(text,uuid,text,bigint)','EXECUTE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 18, 'providers can call confirm_cash_collected()', CASE WHEN has_function_privilege('authenticated','public.confirm_cash_collected(uuid)','EXECUTE') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 19, 'trigger: dues block on going online', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_dues_before_online') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 20, 'trigger: dues block on accepting a job', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_dues_before_accept') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 21, 'trigger: server-side fee', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_booking_fee') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 22, 'trigger: money columns protected', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='guard_booking_money_columns') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 23, 'trigger: OTP-only completion', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_block_direct_completion') THEN 'OK' ELSE 'FAIL' END
  UNION ALL SELECT 24, 'admin RPC exists', CASE WHEN to_regprocedure('public.admin_get_wallet_overview()') IS NOT NULL THEN 'OK' ELSE 'FAIL' END
)
SELECT check_name, result FROM checks ORDER BY (result <> 'OK') DESC, n;
