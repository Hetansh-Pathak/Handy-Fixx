-- READ-ONLY. Changes nothing. Paste ALL of it in Supabase -> SQL Editor -> Run.
-- One row per database proposal: applied = true means the objects it creates exist on this project.
-- (A proposal that only edits an existing function is recognised by a marker inside that function.)
-- Keep this file next to the proposals; add a row when you add a proposal.
SELECT * FROM (
  SELECT 1 AS n, '20261101 pricing model (price bands, locked price)' AS proposal,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'enforce_booking_price') AS applied
  UNION ALL SELECT 2, '20261102000000 booking status "arrived"',
    EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'booking_status' AND e.enumlabel = 'arrived')
  UNION ALL SELECT 3, '20261102000001 provider wallet fee (fee record, accept check)',
    to_regclass('public.booking_fees') IS NOT NULL
  UNION ALL SELECT 4, '20261103 customer can call the pro (contact function)',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname IN ('get_booking_provider_phone', 'get_booking_provider'))
  UNION ALL SELECT 5, '20261104 profile avatars (storage policies)',
    EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_owner_select')
  UNION ALL SELECT 6, '20261105 attachment read fix for pros',
    EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ba_provider_read')
  UNION ALL SELECT 7, '20261106 catalogue sections + sub-services',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_sub_items' AND column_name = 'section')
  UNION ALL SELECT 8, '20261107 extra work and disputes',
    to_regclass('public.booking_extras') IS NOT NULL AND to_regclass('public.booking_disputes') IS NOT NULL
  UNION ALL SELECT 9, '20261108 reviews fix (customers can rate)',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a_validate_review' AND NOT tgisinternal)
  UNION ALL SELECT 10, '20261109 pro area for "Nearest"',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_providers' AND column_name = 'approx_latitude')
  UNION ALL SELECT 11, '20261110 chat hardening',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'chat_message_problem')
  UNION ALL SELECT 12, '20261111 delete account',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'anonymise_account')
  UNION ALL SELECT 13, '20261112 late-cancel limit in the database',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'a_enforce_instant_booking_pause' AND NOT tgisinternal)
  UNION ALL SELECT 14, '20261113000000 "I''ve arrived" step allowed by the guard',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'guard_booking_update' AND p.prosrc LIKE '%''arrived''%')
  UNION ALL SELECT 15, '20261113000001 Labour & Shifting service',
    EXISTS (SELECT 1 FROM public.services WHERE slug = 'labour-shifting')
  UNION ALL SELECT 16, '20261113000002 pros pick their jobs and own rates',
    to_regclass('public.provider_sub_items') IS NOT NULL
  UNION ALL SELECT 17, '20261114 fee 3% (min 5, max 50), fee held at accept, auto-close',
    to_regclass('public.wallet_holds') IS NOT NULL
  UNION ALL SELECT 18, '20261115 launch = 10 jobs or 1 month',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = 'provider_launch_active' AND p.prosrc LIKE '%1 months%')
  UNION ALL SELECT 19, '20261116 dispute evidence (arrival + chat)',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'record_arrival')
  UNION ALL SELECT 20, '20261117 response speed for ranking',
    to_regclass('public.provider_response_log') IS NOT NULL
  UNION ALL SELECT 21, '20261122 booking payment orders (pay in the app, Section 1)',
    to_regclass('public.booking_payment_orders') IS NOT NULL
) t ORDER BY n;
