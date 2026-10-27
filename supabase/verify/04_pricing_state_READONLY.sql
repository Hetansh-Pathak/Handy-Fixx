-- ═══════════════════════════════════════════════════════════════════════════
-- PRICING STATE CHECK (READ-ONLY: changes NOTHING)
-- Paste this whole file in Supabase -> SQL Editor -> Run, then send me the result table.
-- It answers: "Is the 12% fee trigger live?", "Do price bands exist?", and
-- "What did recent bookings actually store?".
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result, detail) AS (
  SELECT 1, 'Trigger enforce_booking_fee (12% model) on bookings',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.bookings'::regclass
                      AND t.tgname = 'enforce_booking_fee' AND NOT t.tgisinternal)
         THEN 'LIVE' ELSE 'not present' END,
    'LIVE = bookings are saved as price + 12% no matter what the app sends'
  UNION ALL
  SELECT 2, 'Trigger enforce_booking_price (PDF model) on bookings',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.bookings'::regclass
                      AND t.tgname = 'enforce_booking_price' AND NOT t.tgisinternal)
         THEN 'LIVE' ELSE 'not present' END,
    'LIVE = the proposal migration has been applied'
  UNION ALL
  SELECT 3, 'wallet_settings.fee_rate',
    CASE WHEN to_regclass('public.wallet_settings') IS NULL THEN 'table missing'
         ELSE COALESCE((xpath('/row/fee_rate/text()',
              query_to_xml('select fee_rate from public.wallet_settings limit 1', true, true, '')))[1]::text, 'empty') END,
    'e.g. 0.1200 = 12%'
  UNION ALL
  SELECT 4, 'services.price_min / price_max columns',
    CASE WHEN (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'services'
                 AND column_name IN ('price_min', 'price_max')) = 2
         THEN 'present' ELSE 'missing' END,
    'present = price bands can be stored'
  UNION ALL
  SELECT 5, 'Table service_sub_items',
    CASE WHEN to_regclass('public.service_sub_items') IS NOT NULL THEN 'present' ELSE 'missing' END,
    'sub-item catalogue prices come from here'
  UNION ALL
  SELECT 6, 'Pro rates set (provider_services.custom_price not null)',
    (SELECT count(*)::text FROM public.provider_services WHERE custom_price IS NOT NULL),
    'rows where a pro chose their own price'
  UNION ALL
  SELECT 7, 'Last 20 bookings: how many have a platform fee above 0',
    (SELECT count(*) FILTER (WHERE COALESCE(platform_fee, 0) > 0)::text || ' of ' || count(*)::text
       FROM (SELECT platform_fee FROM public.bookings ORDER BY created_at DESC LIMIT 20) b),
    'most of them above 0 = customers are being charged a fee today'
  UNION ALL
  SELECT 8, 'Last booking: stored price vs total',
    COALESCE((SELECT 'provider_amount=' || COALESCE(provider_amount::text, 'null')
                     || ' platform_fee=' || COALESCE(platform_fee::text, 'null')
                     || ' total=' || COALESCE(total_amount::text, 'null')
                FROM public.bookings ORDER BY created_at DESC LIMIT 1), 'no bookings'),
    'if total = provider_amount x 1.12 the 12% model is live'
)
SELECT n, check_name, result, detail FROM checks ORDER BY n;
