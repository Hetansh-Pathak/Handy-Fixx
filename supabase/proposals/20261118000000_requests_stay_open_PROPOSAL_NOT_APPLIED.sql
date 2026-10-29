-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Owner decision 2026-10-29: "the request stays open until a pro accepts it".
-- Today a cron job (expire-stale-bookings, every minute) cancels any request still pending 30 minutes after it was
-- made, with the reason "No pro accepted in time". That ignores when the visit is booked for.
--
-- What this does
--   1. Removes the 30-minute job (the old function expire_stale_pending_bookings stays in place, unused, so nothing
--      that might call it breaks).
--   2. Adds close_missed_requests(): a request is closed ONLY when its booked start time (India time) has passed by
--      the grace period (default 30 minutes) and it is still pending. Reason "Booked time passed without an answer".
--      The apps show that as "missed" and offer the next best pros (packages/shared MISSED_REQUEST_REASON).
--      A request for next week stays open all week; an unanswered request is never closed just for being old.
--   3. Schedules it every 10 minutes (job name close-missed-requests) when pg_cron exists.
--
-- Does not touch accepted, in-progress or completed bookings, and does not touch the 7 jobs stuck in progress.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_missed_requests(p_grace_minutes integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = 'Booked time passed without an answer',
         updated_at = now()
   WHERE status::text = 'pending'
     AND booking_date IS NOT NULL
     AND booking_time IS NOT NULL
     AND ((booking_date + booking_time) AT TIME ZONE 'Asia/Kolkata') < now() - make_interval(mins => GREATEST(0, p_grace_minutes));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.close_missed_requests(integer) FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-bookings';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'close-missed-requests';
    PERFORM cron.schedule('close-missed-requests', '*/10 * * * *', 'SELECT public.close_missed_requests(30)');
  ELSE
    RAISE NOTICE 'pg_cron is not installed: run SELECT public.close_missed_requests(30) every 10 minutes another way.';
  END IF;
END
$cron$;

-- Rollback (brings back the 30-minute cancellation):
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'close-missed-requests';
--   SELECT cron.schedule('expire-stale-bookings', '* * * * *', 'SELECT public.expire_stale_pending_bookings(30)');
--   DROP FUNCTION IF EXISTS public.close_missed_requests(integer);
