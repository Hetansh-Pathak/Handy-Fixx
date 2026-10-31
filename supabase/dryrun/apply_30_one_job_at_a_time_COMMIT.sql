-- APPLY (saves). Run 30_one_job_at_a_time_DRYRUN.sql first. Then try to accept a second job with a pro who is on a job (it must say "You already have a job at this time. Finish it first.").
BEGIN;
-- =====================================================================================================================
-- PROPOSAL 20261126000000: one job at a time                                                NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Owner rule (2026-11-01): a pro who is busy cannot accept, or be offered, another job until the current one ends.
-- Apply AFTER 20261114000000 (wallet accept check) and 20261124000000 + 20261124000001 (instant dispatch). Re-run safe.
-- Changes no fee, price, wallet or customer-facing rule. Twin of packages/shared/src/booking/provider-busy.ts.
--
-- "Busy" means one of:
--   * the pro has a booking that is on_the_way, arrived or in_progress (at any time of day), or
--   * the pro has a CONFIRMED booking whose window overlaps the new one. A window is the booked start, plus the
--     service duration (services.duration_minutes, 60 when empty), plus a 30 minute travel buffer on both sides.
--     A job ending exactly one buffer before the new start does not conflict. A confirmed job on another day or
--     at a clearly different time does not block. A confirmed job without a readable time is ignored.
-- Start time = booking_date + booking_time, falling back to scheduled_date + scheduled_time (the app writes both).
--
--   1. provider_busy_core / provider_busy_conflict   the rule (SQL twin of providerBusy). Not callable by the apps.
--   2. providers_busy_at                             lets the CUSTOMER app mark busy pros: ids only, no job details.
--   3. enforce_one_job_at_a_time (BEFORE UPDATE)     the server check on pending -> confirmed. It takes an advisory lock
--                                                    on the provider, so two accepts at the same moment cannot both win.
--                                                    It runs before the wallet check (trigger names sort e..o before e..w),
--                                                    so a busy pro never gets a fee hold. accept_dispatch_offer already
--                                                    catches this error and answers {result:'refused', message}, so the
--                                                    first-accept RPC needs no change and a busy pro cannot win an offer.
--   4. dispatch_candidates                           recreated from 20261124000001 with ONE added line: busy pros are
--                                                    skipped, so no offer is created for them.
-- Rollback at the end.
-- =====================================================================================================================

-- ─── 1. The rule ───────────────────────────────────────────────────────────────────────────────────────────────────
-- p_start / p_minutes describe the NEW job (p_start NULL = unknown time: only an active job can block).
-- Returns the id of a booking that blocks it, or NULL. p_exclude is the booking being accepted (never blocks itself).
CREATE OR REPLACE FUNCTION public.provider_busy_core(p_provider uuid, p_exclude uuid, p_start timestamp, p_minutes integer)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT j.id
  FROM public.bookings j
  LEFT JOIN public.services s ON s.id = j.service_id
  WHERE j.provider_id = p_provider
    AND j.id IS DISTINCT FROM p_exclude
    AND (
      j.status::text IN ('on_the_way', 'arrived', 'in_progress')
      OR (
        j.status::text = 'confirmed'
        AND p_start IS NOT NULL
        AND COALESCE(j.booking_date, j.scheduled_date) IS NOT NULL
        AND COALESCE(j.booking_time, j.scheduled_time) IS NOT NULL
        -- window overlap with a 30 minute buffer on both sides (TRAVEL_BUFFER_MINUTES in provider-busy.ts):
        AND p_start < (COALESCE(j.booking_date, j.scheduled_date) + COALESCE(j.booking_time, j.scheduled_time))
                      + make_interval(mins => COALESCE(NULLIF(s.duration_minutes, 0), 60) + 30)
        AND (COALESCE(j.booking_date, j.scheduled_date) + COALESCE(j.booking_time, j.scheduled_time))
                      < p_start + make_interval(mins => COALESCE(NULLIF(p_minutes, 0), 60) + 30)
      )
    )
  -- an active job is the clearest answer; then the earliest overlapping one
  ORDER BY (j.status::text IN ('on_the_way', 'arrived', 'in_progress')) DESC, j.created_at, j.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.provider_busy_conflict(p_provider uuid, p_booking uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.provider_busy_core(
    p_provider,
    p_booking,
    (COALESCE(b.booking_date, b.scheduled_date) + COALESCE(b.booking_time, b.scheduled_time)),
    COALESCE(NULLIF(s.duration_minutes, 0), 60)
  )
  FROM public.bookings b
  LEFT JOIN public.services s ON s.id = b.service_id
  WHERE b.id = p_booking;
$$;
REVOKE ALL ON FUNCTION public.provider_busy_core(uuid, uuid, timestamp, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_busy_conflict(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_busy_core(uuid, uuid, timestamp, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_busy_conflict(uuid, uuid) TO service_role;

-- ─── 2. For the customer's pro list: which of these pros are busy at that time? Ids only. ──────────────────────────
CREATE OR REPLACE FUNCTION public.providers_busy_at(p_provider_ids uuid[], p_date date, p_time time, p_service_id uuid DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id
  FROM unnest(p_provider_ids[1:200]) AS p(id)
  WHERE auth.uid() IS NOT NULL
    AND public.provider_busy_core(
          p.id, NULL,
          CASE WHEN p_date IS NOT NULL AND p_time IS NOT NULL THEN p_date + p_time END,
          COALESCE(NULLIF((SELECT duration_minutes FROM public.services WHERE id = p_service_id), 0), 60)
        ) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.providers_busy_at(uuid[], date, time, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.providers_busy_at(uuid[], date, time, uuid) TO authenticated, service_role;

-- ─── 3. The server check: pending -> confirmed by a busy pro is refused ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_one_job_at_a_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.provider_id IS NULL OR NEW.status::text <> 'confirmed' OR OLD.status::text = 'confirmed' THEN
    RETURN NEW;
  END IF;
  -- One accept at a time per pro: the second waits here until the first has committed, then sees its job.
  PERFORM pg_advisory_xact_lock(hashtext('busy:' || NEW.provider_id::text));
  IF public.provider_busy_conflict(NEW.provider_id, NEW.id) IS NOT NULL THEN
    RAISE EXCEPTION 'You already have a job at this time. Finish it first.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_one_job_at_a_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_one_job_at_a_time ON public.bookings;
CREATE TRIGGER enforce_one_job_at_a_time
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_one_job_at_a_time();

-- ─── 4. Busy pros get no offer (dispatch_candidates from 20261124000001 + one added line) ──────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_candidates(p_booking_id uuid)
RETURNS TABLE (provider_id uuid, ring smallint, distance_km double precision, rating numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (SELECT * FROM public.dispatch_settings WHERE id),
  b AS (SELECT id, service_id, latitude, longitude FROM public.bookings WHERE id = p_booking_id),
  c AS (
    SELECT sp.id, sp.rating,
           -- A GPS position counts only while it is fresh itself (an old position must not place a pro in a close ring).
           CASE WHEN pp.updated_at > now() - make_interval(secs => s.presence_fresh_seconds)
                THEN public.dispatch_km(b.latitude, b.longitude, pp.latitude, pp.longitude) END AS km,
           pp.updated_at > now() - make_interval(secs => s.presence_fresh_seconds)
             AND public.dispatch_km(s.city_lat, s.city_lng, pp.latitude, pp.longitude) <= s.city_radius_km AS gps_in_city,
           sp.updated_at > now() - make_interval(secs => s.presence_fresh_seconds) AS heartbeat_fresh,
           EXISTS (
             SELECT 1 FROM unnest(COALESCE(sp.pincodes, ARRAY[]::text[])) a
             WHERE lower(btrim(a)) = lower(btrim(s.city_name))
                OR (btrim(a) ~ '^[0-9]{6}$' AND btrim(a) LIKE s.city_pincode_prefix || '%')
           ) AS serves_city,
           public.dispatch_km(b.latitude, b.longitude, s.city_lat, s.city_lng) AS km_to_centre
    FROM b, s, public.service_providers sp
    LEFT JOIN public.provider_presence pp ON pp.provider_id = sp.id
    WHERE sp.kyc_status = 'approved'
      AND sp.status::text = 'active'
      AND sp.is_online IS TRUE
      AND b.service_id = ANY (COALESCE(sp.service_ids, ARRAY[]::uuid[]))
      AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
      AND public.provider_busy_conflict(sp.id, b.id) IS NULL   -- one job at a time: busy pros get no offer
  ),
  r AS (
    SELECT c.id, c.rating,
           CASE
             WHEN c.km IS NOT NULL AND (c.km <= (SELECT ring_radii_km[cardinality(ring_radii_km)] FROM s) OR c.gps_in_city) THEN c.km
             WHEN c.serves_city AND c.heartbeat_fresh THEN c.km_to_centre
           END AS km,
           COALESCE(
             (SELECT min(i)::smallint FROM s, generate_subscripts(s.ring_radii_km, 1) i WHERE c.km <= s.ring_radii_km[i]),
             CASE WHEN c.gps_in_city OR (c.serves_city AND c.heartbeat_fresh) THEN (SELECT (cardinality(ring_radii_km) + 1)::smallint FROM s) END) AS ring
    FROM c
  )
  SELECT r.id, r.ring, r.km, r.rating
  FROM r
  WHERE r.ring IS NOT NULL AND r.km IS NOT NULL
  ORDER BY r.km, r.rating DESC NULLS LAST, r.id;
$$;
REVOKE ALL ON FUNCTION public.dispatch_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_candidates(uuid) TO service_role;

-- =====================================================================================================================
-- ROLLBACK
--   1. DROP TRIGGER IF EXISTS enforce_one_job_at_a_time ON public.bookings;  DROP FUNCTION IF EXISTS public.enforce_one_job_at_a_time();
--   2. Re-run 20261124000001_dispatch_service_area_*.sql (it recreates dispatch_candidates without the busy line).
--   3. DROP FUNCTION IF EXISTS public.providers_busy_at(uuid[], date, time, uuid);
--      DROP FUNCTION IF EXISTS public.provider_busy_conflict(uuid, uuid);
--      DROP FUNCTION IF EXISTS public.provider_busy_core(uuid, uuid, timestamp, integer);
-- =====================================================================================================================

COMMIT;
