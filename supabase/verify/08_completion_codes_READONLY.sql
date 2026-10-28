-- ═══════════════════════════════════════════════════════════════════════════
-- COMPLETION CODE (OTP) CHECK (READ-ONLY: changes NOTHING)
-- Paste this whole file in Supabase -> SQL Editor -> Run, then send me the result table.
-- It answers: "Is the 4-digit code created for every booking?" and "Can the customer read it?".
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result, detail) AS (
  SELECT 1, 'Table booking_completion_codes',
    CASE WHEN to_regclass('public.booking_completion_codes') IS NOT NULL THEN 'yes' ELSE 'MISSING' END,
    'MISSING = apply migrations/customer/20261004000001_completion_codes_and_fixes.sql'
  UNION ALL
  SELECT 2, 'Trigger trg_generate_completion_code on bookings',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass AND tgname = 'trg_generate_completion_code' AND NOT tgisinternal)
         THEN 'yes' ELSE 'MISSING' END,
    'MISSING = new bookings get no code, the customer sees "not ready yet" and the pro cannot finish'
  UNION ALL
  SELECT 3, 'Customer read rule on codes',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_completion_codes' AND cmd = 'SELECT')
         THEN 'yes' ELSE 'MISSING' END,
    'MISSING = the code exists but the customer app cannot show it'
  UNION ALL
  SELECT 4, 'Function complete_booking_with_code(uuid,text)',
    CASE WHEN to_regprocedure('public.complete_booking_with_code(uuid,text)') IS NOT NULL THEN 'yes' ELSE 'MISSING' END,
    'MISSING = the pro cannot finish a job'
  UNION ALL
  SELECT 5, 'Open bookings WITHOUT a code (last 30 days)',
    (SELECT count(*)::text FROM public.bookings b
      WHERE b.status::text NOT IN ('completed', 'cancelled') AND b.created_at > now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM public.booking_completion_codes c WHERE c.booking_id = b.id)),
    'Should be 0'
  UNION ALL
  SELECT 6, 'Open bookings whose customer_id is not an auth user id',
    (SELECT count(*)::text FROM public.bookings b
      WHERE b.status::text NOT IN ('completed', 'cancelled') AND b.created_at > now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.customer_id)),
    'Not 0 = the read rule (customer_id = auth.uid()) can never match those bookings'
)
SELECT n, check_name, result, detail FROM checks ORDER BY n;
