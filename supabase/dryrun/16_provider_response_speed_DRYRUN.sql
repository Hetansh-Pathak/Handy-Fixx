-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- HandyFix-complete.pdf p.12: everyone is ranked by rating, then distance, then RESPONSE SPEED, never by money.
-- Nothing records how fast a pro answers today, so the customer list cannot use it (it is always empty).
--
-- What this does (no existing table, policy or trigger is changed; the bookings row is NOT touched, so the
-- guard_booking_update trigger is not involved)
--   1. provider_response_log: one row per accepted request = seconds from "booked" (bookings.created_at) to the
--      pro's accept. Filled by an AFTER UPDATE trigger on bookings when a booking moves pending -> confirmed.
--      The trigger swallows its own errors, so it can NEVER stop a pro from accepting. Declined and missed
--      requests are not logged (they cost the pro nothing; the owner decided that).
--   2. provider_response_times(ids[]): the average of each pro's latest 20 replies and how many there are. Aggregates
--      only, no booking or customer data; callable by the customer app (anon and signed-in). At most 200 ids.
--   3. Admins can read the log (to check a number); nobody else can read or write it directly.
--
-- Safe to re-run. Rollback is at the bottom. Check afterwards with:
--   SELECT * FROM public.provider_response_log ORDER BY answered_at DESC LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL OR to_regclass('public.service_providers') IS NULL THEN
    RAISE EXCEPTION 'bookings / service_providers are missing';
  END IF;
END $$;

-- ─── 1. The log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_response_log (
  booking_id   uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  seconds      integer NOT NULL CHECK (seconds >= 0),
  answered_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_response_log_provider_idx ON public.provider_response_log (provider_id, answered_at DESC);

ALTER TABLE public.provider_response_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read response log" ON public.provider_response_log;
CREATE POLICY "Admins read response log" ON public.provider_response_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.provider_response_log FROM anon;

CREATE OR REPLACE FUNCTION public.log_provider_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status::text = 'pending' AND NEW.status::text = 'confirmed' AND NEW.provider_id IS NOT NULL AND OLD.created_at IS NOT NULL THEN
    INSERT INTO public.provider_response_log (booking_id, provider_id, seconds)
    VALUES (NEW.id, NEW.provider_id, LEAST(86400, GREATEST(0, extract(epoch FROM (now() - OLD.created_at))::integer)))
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- a logging problem must never block accepting a job
END;
$$;

DROP TRIGGER IF EXISTS zz_log_provider_response ON public.bookings;
CREATE TRIGGER zz_log_provider_response
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_provider_response();

-- ─── 2. Aggregates for the customer list ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_response_times(p_ids uuid[])
RETURNS TABLE (provider_id uuid, avg_seconds numeric, samples integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.provider_id, round(avg(l.seconds)::numeric, 1), count(*)::integer
  FROM (
    SELECT r.provider_id, r.seconds,
           row_number() OVER (PARTITION BY r.provider_id ORDER BY r.answered_at DESC) AS rn
    FROM public.provider_response_log r
    WHERE r.provider_id = ANY (p_ids[1:200])
  ) l
  WHERE l.rn <= 20
  GROUP BY l.provider_id;
$$;

REVOKE ALL ON FUNCTION public.provider_response_times(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_response_times(uuid[]) TO anon, authenticated;

-- Rollback:
--   DROP TRIGGER IF EXISTS zz_log_provider_response ON public.bookings;
--   DROP FUNCTION IF EXISTS public.provider_response_times(uuid[]);
--   DROP FUNCTION IF EXISTS public.log_provider_response();
--   DROP TABLE IF EXISTS public.provider_response_log;
SELECT to_regclass('public.provider_response_log') IS NOT NULL AS log_table_ok, to_regprocedure('public.provider_response_times(uuid[])') IS NOT NULL AS function_ok, EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='zz_log_provider_response') AS trigger_ok;
ROLLBACK;
