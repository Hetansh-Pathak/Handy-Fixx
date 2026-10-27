-- READ-ONLY. Changes nothing. Run in the Supabase SQL editor and paste the single result back.
-- Why: three live triggers on bookings (guard_booking_money_columns, zz_guard_booking_update,
-- trg_block_direct_completion) may reject the writes the new model needs (price at insert, fee at completion).
-- We need their bodies before applying the pricing / wallet-fee proposals.
SELECT t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_def,
       pg_get_functiondef(p.oid) AS function_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.bookings'::regclass
  AND NOT t.tgisinternal
  AND t.tgname IN ('guard_booking_money_columns','zz_guard_booking_update','trg_block_direct_completion',
                   'enforce_dues_before_accept','enforce_booking_fee','aa_sync_booking_owner')
UNION ALL
SELECT 'FUNCTION complete_booking_with_code', NULL, pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.proname = 'complete_booking_with_code' AND p.pronamespace = 'public'::regnamespace
ORDER BY 1;
