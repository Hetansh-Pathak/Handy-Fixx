-- ═══════════════════════════════════════════════════════════════════════════
-- BOOKING STATUS + TRIGGERS CHECK (READ-ONLY: changes NOTHING)
-- Paste in Supabase -> SQL Editor -> Run, then send me the result table.
-- It answers: "Is bookings.status an enum or plain text? Is 'arrived' already allowed?"
-- and "Which triggers fire on bookings and wallet_transactions today?"
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result, detail) AS (
  SELECT 1, 'bookings.status column type',
    COALESCE((SELECT data_type || ' (' || udt_name || ')' FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'status'), 'missing'),
    'USER-DEFINED (booking_status) = an enum: adding "arrived" needs a migration. text = no enum change needed.'
  UNION ALL
  SELECT 2, 'Allowed enum values for booking_status',
    COALESCE((SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
              FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
              WHERE t.typname = 'booking_status'), 'no enum named booking_status'),
    'look for "arrived" in this list'
  UNION ALL
  SELECT 3, 'CHECK constraints on bookings that mention status',
    COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' | ')
              FROM pg_constraint c
              WHERE c.conrelid = 'public.bookings'::regclass AND c.contype = 'c'
                AND pg_get_constraintdef(c.oid) ILIKE '%status%'), 'none'),
    'a CHECK listing statuses would also need "arrived" added'
  UNION ALL
  SELECT 4, 'Triggers on bookings',
    COALESCE((SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname)
              FROM pg_trigger t WHERE t.tgrelid = 'public.bookings'::regclass AND NOT t.tgisinternal), 'none'),
    'enforce_dues_before_accept = the old accept rule; enforce_booking_fee = the 12% rule'
  UNION ALL
  SELECT 5, 'Triggers on service_providers',
    COALESCE((SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname)
              FROM pg_trigger t WHERE t.tgrelid = 'public.service_providers'::regclass AND NOT t.tgisinternal), 'none'),
    'enforce_dues_before_online keeps a blocked pro offline'
  UNION ALL
  SELECT 6, 'wallet_transactions types in use',
    COALESCE((SELECT string_agg(type || '=' || n::text, ', ' ORDER BY type)
              FROM (SELECT type, count(*) AS n FROM public.wallet_transactions GROUP BY type) s), 'no rows'),
    'cash_fee rows are what the flat fee will be posted as'
  UNION ALL
  SELECT 7, 'Pros who completed a job but have no payment record (old "unsettled" block)',
    COALESCE((SELECT count(DISTINCT b.provider_id)::text
              FROM public.bookings b
              WHERE b.status::text = 'completed' AND COALESCE(b.total_amount, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM public.booking_payments bp WHERE bp.booking_id = b.id AND bp.status = 'paid')), '0'),
    'these pros get blocked by the old rule 24 h after a job; the new model removes that rule'
  UNION ALL
  SELECT 8, 'service_providers.kyc_reviewed_at and total_jobs present',
    CASE WHEN (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'service_providers'
                 AND column_name IN ('kyc_reviewed_at', 'total_jobs')) = 2 THEN 'present' ELSE 'missing' END,
    'the fee-free launch period is counted from these two columns'
)
SELECT n, check_name, result, detail FROM checks ORDER BY n;
