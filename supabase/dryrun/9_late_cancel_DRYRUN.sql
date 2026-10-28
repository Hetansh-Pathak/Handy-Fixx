-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (HandyFix-complete.pdf p.4 and p.11): three late cancellations in 30 days pause instant booking for a week.
-- The app already counts and shows this, but the app can be modified. These two triggers make the database the judge.
--
-- "Late" is not defined in the PDF. Working definition (confirm with the owner), same as the app:
--   a customer cancels a booking that a pro had already accepted (confirmed, on_the_way, arrived, in_progress),
--   less than 2 hours before the booked start. Times in booking_date / booking_time are India time.
--
-- What this does
--   1. BEFORE UPDATE on bookings: when the customer cancels such a booking late, the database itself writes the
--      reason 'Cancelled by customer (late)', whatever the app sent. A pro or admin cancelling is not counted.
--   2. BEFORE INSERT on bookings: if the customer already has 3 late cancellations in the last 30 days and the most
--      recent one is under 7 days old, the new booking is refused with a readable message (22023).
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_late_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_starts timestamptz;
BEGIN
  IF NEW.status::text <> 'cancelled' OR OLD.status::text = 'cancelled' THEN RETURN NEW; END IF;
  IF OLD.status::text NOT IN ('confirmed', 'on_the_way', 'arrived', 'in_progress') THEN RETURN NEW; END IF;
  -- Only the customer's own cancellation counts (not a pro, admin or system action).
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM COALESCE(NEW.customer_id, NEW.user_id) THEN RETURN NEW; END IF;
  IF NEW.booking_date IS NULL OR NEW.booking_time IS NULL THEN RETURN NEW; END IF;

  v_starts := (NEW.booking_date::timestamp + NEW.booking_time::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_starts - now() < interval '2 hours' THEN
    NEW.cancellation_reason := 'Cancelled by customer (late)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_mark_late_cancellation ON public.bookings;
CREATE TRIGGER a_mark_late_cancellation
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.mark_late_cancellation();

CREATE OR REPLACE FUNCTION public.enforce_instant_booking_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_last  timestamptz;
BEGIN
  SELECT count(*), max(cancelled_at) INTO v_count, v_last
  FROM public.bookings
  WHERE COALESCE(customer_id, user_id) = COALESCE(NEW.customer_id, NEW.user_id)
    AND status::text = 'cancelled'
    AND cancellation_reason = 'Cancelled by customer (late)'
    AND cancelled_at >= now() - interval '30 days';
  IF v_count >= 3 AND v_last + interval '7 days' > now() THEN
    RAISE EXCEPTION 'Instant booking is paused until % because of 3 late cancellations in 30 days.',
      to_char((v_last + interval '7 days') AT TIME ZONE 'Asia/Kolkata', 'DD Mon')
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_enforce_instant_booking_pause ON public.bookings;
CREATE TRIGGER a_enforce_instant_booking_pause
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_instant_booking_pause();

-- ─── ROLLBACK ───
-- DROP TRIGGER IF EXISTS a_mark_late_cancellation ON public.bookings;
-- DROP TRIGGER IF EXISTS a_enforce_instant_booking_pause ON public.bookings;
-- DROP FUNCTION IF EXISTS public.mark_late_cancellation();
-- DROP FUNCTION IF EXISTS public.enforce_instant_booking_pause();

-- ─── CHECK ───
SELECT tgname FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND tgname IN ('a_mark_late_cancellation','a_enforce_instant_booking_pause') ORDER BY 1;
ROLLBACK;
