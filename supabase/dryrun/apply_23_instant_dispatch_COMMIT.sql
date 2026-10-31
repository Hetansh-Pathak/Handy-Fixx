-- APPLY: INSTANT DISPATCH FOR REAL. Ends with COMMIT. Run the dry run first. Then ship the app version that uses it (slice 5).
BEGIN;
-- =====================================================================================================================
-- PROPOSAL 20261124000000: instant dispatch (Rapido-style matching)                         NOT APPLIED. ASK THE OWNER.
-- =====================================================================================================================
-- Owner decision 2026-10-31 (branch feature/instant-dispatch, docs/INSTANT_DISPATCH.md). Replaces "customer picks a
-- pro": the customer books a service with NO pro (status 'pending', provider_id NULL), calls start_dispatch, and the
-- server offers the job to eligible pros in widening rings (2 / 5 / 10 km, 10 s each, then the whole city zone until
-- the search ends at 120 s). The first pro to accept gets it (row lock: only one can ever win).
--
-- Shared twins (packages/shared/src/dispatch, keep in step; dispatch-sql.test.ts checks the key lines):
--   tickSearch -> dispatch_advance, dispatchEligibility -> dispatch_candidates, offerTransition -> the offer updates,
--   searchTransition -> the state checks in start/accept/cancel/extend, DEFAULT_DISPATCH_SETTINGS -> dispatch_settings.
--
-- Works with the live database as checked read-only on 2026-10-31:
--   * enforce_booking_price (BEFORE INSERT) already prices a booking without a pro at the catalogue price
--     (job price, else service price), platform fee 0. Nothing to change.
--   * zz_guard_booking_update lets SECURITY DEFINER functions through (it only checks 'authenticated' / 'anon').
--   * enforce_wallet_before_accept + enforce_provider_kyc_on_booking fire on pending -> confirmed with a pro set, so
--     accept_dispatch_offer reuses the live wallet and KYC checks unchanged (and 20261114's hold, if applied).
--   * trg_generate_completion_code runs on insert, so the code exists from acceptance as today.
--   * provider_notifications.type is an enum without a dispatch value: offers use 'new_booking' with
--     data.kind = 'dispatch_offer' (the push proposal 20261120/21 already alerts on new_booking).
-- Changes ONE live function: notify_provider_on_new_booking now skips dispatch bookings (it would tell the pro who
-- just accepted "New Booking Request... Accept or decline it now"). Original text in the rollback notes.
--
-- Independent of the other open proposals. Old-style bookings (provider chosen by the customer, dispatch_state NULL)
-- behave exactly as before. Note for 20261113000002 (pros pick jobs + own rate): its enforce_booking_price must keep
-- the "no pro = catalogue price" branch (it does today).
--
-- Server tick: pg_cron 1.6.4 (installed on the live project) runs dispatch_tick() every 3 seconds, so a search moves
-- on even when the customer closes the app. A ring may therefore last up to 3 s longer than its 10 s. A scheduled
-- edge function runs at most once a minute (too slow). The tick touches only bookings that are searching.
--
-- Not in this proposal: push to a closed app (slice 4b, Firebase). Until then offers reach pros whose app is open or
-- in the background with the location service (Realtime on booking_offers + a poll).
--
-- Dry run: supabase/dryrun/23_instant_dispatch_DRYRUN.sql (ends in ROLLBACK). Apply: apply_23_instant_dispatch_COMMIT.sql.
-- =====================================================================================================================

-- ── 1. Settings (one row, editable by admins) ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  ring_radii_km          numeric[] NOT NULL DEFAULT '{2,5,10}',
  ring_wait_seconds      integer[] NOT NULL DEFAULT '{10,10,10}',
  city_name              text NOT NULL DEFAULT 'Jamnagar',
  city_lat               double precision NOT NULL DEFAULT 22.4707,
  city_lng               double precision NOT NULL DEFAULT 70.0577,
  city_radius_km         numeric NOT NULL DEFAULT 20,
  max_search_seconds     integer NOT NULL DEFAULT 120 CHECK (max_search_seconds BETWEEN 30 AND 3600),
  extend_seconds         integer NOT NULL DEFAULT 600 CHECK (extend_seconds BETWEEN 60 AND 3600),
  presence_fresh_seconds integer NOT NULL DEFAULT 90 CHECK (presence_fresh_seconds BETWEEN 30 AND 600),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_settings_rings CHECK (
    cardinality(ring_radii_km) BETWEEN 1 AND 6 AND cardinality(ring_radii_km) = cardinality(ring_wait_seconds)
    AND city_radius_km > 0)
);
INSERT INTO public.dispatch_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dispatch_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_settings_read ON public.dispatch_settings;
CREATE POLICY dispatch_settings_read ON public.dispatch_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS dispatch_settings_admin_update ON public.dispatch_settings;
CREATE POLICY dispatch_settings_admin_update ON public.dispatch_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, UPDATE ON public.dispatch_settings TO authenticated;

-- ── 2. Pro position from the heartbeat (server-only: customers never read it) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_presence (
  provider_id uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  latitude    double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude   double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m  integer,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_presence ENABLE ROW LEVEL SECURITY;   -- no policies: only SECURITY DEFINER functions
REVOKE ALL ON public.provider_presence FROM anon, authenticated;

-- ── 3. Booking columns (a searching booking = status 'pending' + provider_id NULL + dispatch_state 'searching') ──────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS dispatch_state       text,
  ADD COLUMN IF NOT EXISTS current_ring         smallint,
  ADD COLUMN IF NOT EXISTS ring_deadline        timestamptz,
  ADD COLUMN IF NOT EXISTS searched_since       timestamptz,
  ADD COLUMN IF NOT EXISTS search_ends_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_accepted_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_dispatch_state_check
    CHECK (dispatch_state IS NULL OR dispatch_state IN ('searching','assigned','no_pro','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_bookings_dispatch_searching ON public.bookings (search_ends_at) WHERE dispatch_state = 'searching';
CREATE INDEX IF NOT EXISTS idx_bookings_dispatch_customer ON public.bookings (customer_id) WHERE dispatch_state IN ('searching','no_pro');

-- ── 4. Offers (one row per booking and pro: a pro is never offered the same job twice) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  ring         smallint NOT NULL,
  distance_km  numeric(6,2) NOT NULL,
  status       text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','taken','expired','withdrawn')),
  offered_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (booking_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_offers_provider_open ON public.booking_offers (provider_id) WHERE status = 'offered';
ALTER TABLE public.booking_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_offers_own_read ON public.booking_offers;
CREATE POLICY booking_offers_own_read ON public.booking_offers FOR SELECT TO authenticated
  USING (provider_id IN (SELECT sp.id FROM public.service_providers sp WHERE sp.user_id = auth.uid()));
REVOKE ALL ON public.booking_offers FROM anon, authenticated;
GRANT SELECT ON public.booking_offers TO authenticated;          -- rows limited by the policy; writes only via functions

-- ── 5. Audit trail (append-only) ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id          bigserial PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  event       text NOT NULL CHECK (event IN ('search_started','ring_opened','ring_skipped','offered','accepted',
                'accept_refused','cancelled','extended','no_pro')),
  ring        smallint,
  provider_id uuid,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_booking ON public.dispatch_events (booking_id, at);
ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_events_admin_read ON public.dispatch_events;
CREATE POLICY dispatch_events_admin_read ON public.dispatch_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE ALL ON public.dispatch_events FROM anon, authenticated;
GRANT SELECT ON public.dispatch_events TO authenticated;
CREATE OR REPLACE FUNCTION public.dispatch_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'dispatch_events is append-only'; END $$;
DROP TRIGGER IF EXISTS dispatch_events_no_change ON public.dispatch_events;
CREATE TRIGGER dispatch_events_no_change BEFORE UPDATE OR DELETE ON public.dispatch_events
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_events_append_only();

-- ── 6. Distance and candidates ───────────────────────────────────────────────────────────────────────────────────────
-- Haversine, same as distanceKm (packages/shared/src/geo/distance.ts). PostGIS is not installed on the live project.
CREATE OR REPLACE FUNCTION public.dispatch_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))));
$$;

-- Eligible pros for one booking with their ring (twin: dispatchEligibility + ringForDistance). Distance only: the pros'
-- pincode lists are not used (owner decision 2026-10-31). The wallet is not a filter (a low wallet sees "Top up").
CREATE OR REPLACE FUNCTION public.dispatch_candidates(p_booking_id uuid)
RETURNS TABLE (provider_id uuid, ring smallint, distance_km double precision, rating numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (SELECT * FROM public.dispatch_settings WHERE id),
  b AS (SELECT id, service_id, latitude, longitude FROM public.bookings WHERE id = p_booking_id),
  c AS (
    SELECT sp.id, sp.rating,
           public.dispatch_km(b.latitude, b.longitude, pp.latitude, pp.longitude) AS km,
           public.dispatch_km(s.city_lat, s.city_lng, pp.latitude, pp.longitude) <= s.city_radius_km AS in_city
    FROM b, s, public.service_providers sp
    JOIN public.provider_presence pp ON pp.provider_id = sp.id
    WHERE sp.kyc_status = 'approved'
      AND sp.status::text = 'active'
      AND sp.is_online IS TRUE
      AND pp.updated_at > now() - make_interval(secs => s.presence_fresh_seconds)
      AND b.service_id = ANY (COALESCE(sp.service_ids, ARRAY[]::uuid[]))
      AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
  )
  SELECT c.id,
         COALESCE(
           (SELECT min(i)::smallint FROM s, generate_subscripts(s.ring_radii_km, 1) i WHERE c.km <= s.ring_radii_km[i]),
           CASE WHEN c.in_city THEN (SELECT (cardinality(ring_radii_km) + 1)::smallint FROM s) END),
         c.km, c.rating
  FROM c
  WHERE c.km <= (SELECT ring_radii_km[cardinality(ring_radii_km)] FROM s) OR c.in_city
  ORDER BY c.km, c.rating DESC NULLS LAST, c.id;
$$;

-- The signed-in user owns the booking (null-safe: `x NOT IN (a, NULL)` is never true, so it is not used here).
CREATE OR REPLACE FUNCTION public.dispatch_is_owner(p_customer uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (COALESCE(auth.uid() = p_customer, false) OR COALESCE(auth.uid() = p_user, false));
$$;

-- ── 7. One step of one search (twin: tickSearch). Called by start_dispatch and every 3 s by dispatch_tick. ──────────
-- Cumulative rings: opening ring N offers the job to every eligible pro within N who has no offer yet. A ring that adds
-- nobody is skipped at once. On the open ring, pros who come online later are offered too. When even the city ring
-- has nobody and no offer is open, the search ends straight away ("no pro").
CREATE OR REPLACE FUNCTION public.dispatch_advance(p_booking_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s       public.dispatch_settings%ROWTYPE;
  b       public.bookings%ROWTYPE;
  v_last  smallint;
  v_next  smallint;
  v_new   integer;
  v_open  integer;
  v_wait  integer;
  v_added integer;
BEGIN
  SELECT * INTO s FROM public.dispatch_settings WHERE id;
  -- SKIP LOCKED: never wait behind an accept in progress; the next tick picks the booking up again.
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR b.dispatch_state IS DISTINCT FROM 'searching' OR b.provider_id IS NOT NULL THEN RETURN 'skip'; END IF;
  v_last := cardinality(s.ring_radii_km) + 1;

  SELECT count(*) INTO v_open FROM public.booking_offers WHERE booking_id = b.id AND status = 'offered';

  IF now() >= b.search_ends_at THEN
    UPDATE public.booking_offers SET status = 'expired', responded_at = now() WHERE booking_id = b.id AND status = 'offered';
    UPDATE public.bookings SET dispatch_state = 'no_pro', ring_deadline = NULL WHERE id = b.id;
    INSERT INTO public.dispatch_events (booking_id, event, ring, detail) VALUES (b.id, 'no_pro', b.current_ring, jsonb_build_object('reason', 'time_up'));
    RETURN 'no_pro';
  END IF;

  IF COALESCE(b.current_ring, 0) > 0 AND (b.current_ring >= v_last OR (b.ring_deadline IS NOT NULL AND now() < b.ring_deadline)) THEN
    v_next := b.current_ring;                         -- ring still open: only offer it to pros who came online since
  ELSE
    v_next := COALESCE(b.current_ring, 0) + 1;
    LOOP
      SELECT count(*) INTO v_new FROM public.dispatch_candidates(b.id) c
      WHERE c.ring <= v_next AND NOT EXISTS (SELECT 1 FROM public.booking_offers o WHERE o.booking_id = b.id AND o.provider_id = c.provider_id);
      EXIT WHEN v_new > 0 OR v_next >= v_last;
      INSERT INTO public.dispatch_events (booking_id, event, ring) VALUES (b.id, 'ring_skipped', v_next);
      v_next := v_next + 1;
    END LOOP;
    IF v_next >= v_last AND v_new = 0 AND v_open = 0 THEN
      UPDATE public.bookings SET dispatch_state = 'no_pro', current_ring = v_last, ring_deadline = NULL WHERE id = b.id;
      INSERT INTO public.dispatch_events (booking_id, event, ring, detail) VALUES (b.id, 'no_pro', v_last, jsonb_build_object('reason', 'nobody_online'));
      RETURN 'no_pro';
    END IF;
    v_wait := CASE WHEN v_next < v_last THEN s.ring_wait_seconds[v_next] END;
    UPDATE public.bookings
       SET current_ring = v_next,
           ring_deadline = CASE WHEN v_wait IS NULL THEN NULL ELSE now() + make_interval(secs => v_wait) END
     WHERE id = b.id;
    INSERT INTO public.dispatch_events (booking_id, event, ring) VALUES (b.id, 'ring_opened', v_next);
  END IF;

  WITH fresh AS (
    INSERT INTO public.booking_offers (booking_id, provider_id, ring, distance_km)
    SELECT b.id, c.provider_id, c.ring, round(c.distance_km::numeric, 2)
    FROM public.dispatch_candidates(b.id) c
    WHERE c.ring <= v_next
    ON CONFLICT (booking_id, provider_id) DO NOTHING
    RETURNING provider_id, ring
  ), logged AS (
    INSERT INTO public.dispatch_events (booking_id, event, ring, provider_id) SELECT b.id, 'offered', f.ring, f.provider_id FROM fresh f
  ), notified AS (
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    SELECT f.provider_id, 'new_booking', 'New job near you',
           'A customer needs a pro now. Open apnabanda Pro to see the job and accept it.',
           jsonb_build_object('booking_id', b.id, 'kind', 'dispatch_offer')
    FROM fresh f
  )
  SELECT count(*) INTO v_added FROM fresh;
  RETURN CASE WHEN v_added > 0 THEN 'offered' ELSE 'wait' END;
END;
$$;

-- Every searching booking whose ring is due, whose search ended, or whose open ring may have new pros.
CREATE OR REPLACE FUNCTION public.dispatch_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.bookings WHERE dispatch_state = 'searching' ORDER BY searched_since LOOP
    BEGIN
      PERFORM public.dispatch_advance(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN                       -- one broken search must not stop the others
      RAISE WARNING 'dispatch_tick %: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$$;

-- ── 8. What the customer's "Finding your pro" screen reads ───────────────────────────────────────────────────────────
-- Notified pros come back only as rounded positions (2 decimals, about 1 km): the app adds a fixed jitter on top.
CREATE OR REPLACE FUNCTION public.get_search_state(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; s public.dispatch_settings%ROWTYPE; v_pro jsonb;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.dispatch_is_owner(b.customer_id, b.user_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO s FROM public.dispatch_settings WHERE id;
  IF b.provider_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', sp.id, 'name', COALESCE(sp.full_name, sp.name), 'rating', sp.rating,
                              'jobs', sp.total_jobs, 'verified', sp.kyc_status = 'approved')
      INTO v_pro FROM public.service_providers sp WHERE sp.id = b.provider_id;
  END IF;
  RETURN jsonb_build_object(
    'booking_id', b.id, 'dispatch_state', b.dispatch_state, 'status', b.status, 'current_ring', COALESCE(b.current_ring, 0),
    'ring_deadline', b.ring_deadline, 'searched_since', b.searched_since, 'search_ends_at', b.search_ends_at,
    'accepted_at', b.dispatch_accepted_at, 'now', now(),
    'notified', (SELECT count(*) FROM public.booking_offers o WHERE o.booking_id = b.id AND o.status <> 'withdrawn'),
    'dots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', md5(b.id::text || o.provider_id::text), 'lat', round(pp.latitude::numeric, 2), 'lng', round(pp.longitude::numeric, 2)))
      FROM public.booking_offers o JOIN public.provider_presence pp ON pp.provider_id = o.provider_id
      WHERE o.booking_id = b.id AND o.status IN ('offered','accepted')), '[]'::jsonb),
    'pro', v_pro,
    'settings', jsonb_build_object('ring_radii_km', s.ring_radii_km, 'ring_wait_seconds', s.ring_wait_seconds,
      'city_name', s.city_name, 'city_lat', s.city_lat, 'city_lng', s.city_lng, 'city_radius_km', s.city_radius_km,
      'max_search_seconds', s.max_search_seconds, 'extend_seconds', s.extend_seconds));
END;
$$;

-- ── 9. Customer: start, cancel, keep looking ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_dispatch(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; s public.dispatch_settings%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO s FROM public.dispatch_settings WHERE id;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT public.dispatch_is_owner(b.customer_id, b.user_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0001';
  END IF;
  IF b.dispatch_state IS NOT NULL THEN RETURN public.get_search_state(b.id); END IF;   -- already started: same answer
  IF b.status::text <> 'pending' OR b.provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This booking already has a pro.' USING ERRCODE = 'P0001';
  END IF;
  IF b.latitude IS NULL OR b.longitude IS NULL THEN
    RAISE EXCEPTION 'Pick your address on the map so we can find a pro near you.' USING ERRCODE = 'P0001';
  END IF;
  IF public.dispatch_km(s.city_lat, s.city_lng, b.latitude, b.longitude) > s.city_radius_km THEN
    RAISE EXCEPTION 'apnabanda works in % for now. Pick an address in %.', s.city_name, s.city_name USING ERRCODE = 'P0001';
  END IF;
  -- One active search per customer (a double tap or a second phone must not start two).
  PERFORM pg_advisory_xact_lock(hashtext('dispatch-customer:' || v_uid::text));
  IF EXISTS (SELECT 1 FROM public.bookings o WHERE o.id <> b.id AND o.dispatch_state = 'searching'
             AND v_uid IN (o.customer_id, o.user_id)) THEN
    RAISE EXCEPTION 'You already have a search running. Cancel it first or wait for a pro.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.bookings
     SET dispatch_state = 'searching', current_ring = 0, ring_deadline = NULL, searched_since = now(),
         search_ends_at = now() + make_interval(secs => s.max_search_seconds)
   WHERE id = b.id;
  INSERT INTO public.dispatch_events (booking_id, event, detail) VALUES (b.id, 'search_started', jsonb_build_object('max_seconds', s.max_search_seconds));
  PERFORM public.dispatch_advance(b.id);
  RETURN public.get_search_state(b.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_search(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT public.dispatch_is_owner(b.customer_id, b.user_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0001';
  END IF;
  IF b.dispatch_state = 'cancelled' THEN RETURN jsonb_build_object('result', 'cancelled'); END IF;     -- idempotent
  IF b.dispatch_state = 'assigned' OR b.provider_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'assigned', 'message', 'A pro already accepted. Cancel from the booking screen if you need to.');
  END IF;
  IF b.dispatch_state IS DISTINCT FROM 'searching' AND b.dispatch_state IS DISTINCT FROM 'no_pro' THEN
    RAISE EXCEPTION 'This booking is not searching.' USING ERRCODE = 'P0001';
  END IF;
  -- The status change withdraws the open offers (trigger zzz_dispatch_on_cancel). Free: no pro had accepted.
  UPDATE public.bookings
     SET status = 'cancelled', cancelled_at = now(), cancellation_reason = 'Cancelled by customer while searching'
   WHERE id = b.id;
  RETURN jsonb_build_object('result', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_search(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings%ROWTYPE; s public.dispatch_settings%ROWTYPE; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO s FROM public.dispatch_settings WHERE id;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT public.dispatch_is_owner(b.customer_id, b.user_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0001';
  END IF;
  IF b.dispatch_state IS DISTINCT FROM 'no_pro' OR b.provider_id IS NOT NULL OR b.status::text <> 'pending' THEN
    RAISE EXCEPTION 'This search cannot be extended.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dispatch-customer:' || v_uid::text));
  IF EXISTS (SELECT 1 FROM public.bookings o WHERE o.id <> b.id AND o.dispatch_state = 'searching' AND v_uid IN (o.customer_id, o.user_id)) THEN
    RAISE EXCEPTION 'You already have a search running. Cancel it first or wait for a pro.' USING ERRCODE = 'P0001';
  END IF;
  -- Keep looking: the whole city for 10 more minutes; pros whose offer had expired are asked again.
  UPDATE public.booking_offers SET status = 'offered', responded_at = NULL, offered_at = now() WHERE booking_id = b.id AND status = 'expired';
  UPDATE public.bookings
     SET dispatch_state = 'searching', current_ring = cardinality(s.ring_radii_km) + 1, ring_deadline = NULL,
         search_ends_at = now() + make_interval(secs => s.extend_seconds)
   WHERE id = b.id;
  INSERT INTO public.dispatch_events (booking_id, event, detail) VALUES (b.id, 'extended', jsonb_build_object('seconds', s.extend_seconds));
  PERFORM public.dispatch_advance(b.id);
  RETURN public.get_search_state(b.id);
END;
$$;

-- ── 10. Pro: the offer card and accepting ────────────────────────────────────────────────────────────────────────────
-- Limited fields only: never the exact address, the customer's name or phone before accepting.
CREATE OR REPLACE FUNCTION public.get_offer_card(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; o public.booking_offers%ROWTYPE; b public.bookings%ROWTYPE; v_service text; v_bill numeric;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Only pros can see offers' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO o FROM public.booking_offers WHERE booking_id = p_booking_id AND provider_id = v_pid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  SELECT name INTO v_service FROM public.services WHERE id = b.service_id;
  v_bill := GREATEST(0, COALESCE(b.provider_amount, 0) - COALESCE(b.parts_amount, 0));
  RETURN jsonb_build_object(
    'booking_id', b.id, 'offer_status', CASE WHEN o.status = 'offered' AND b.dispatch_state <> 'searching' THEN
        CASE b.dispatch_state WHEN 'cancelled' THEN 'withdrawn' WHEN 'assigned' THEN 'taken' ELSE 'expired' END ELSE o.status END,
    'offered_at', o.offered_at, 'ring', o.ring,
    'approx_km', greatest(0.5, round(o.distance_km * 2) / 2),
    'service_name', v_service, 'sub_item_name', b.sub_item_name,
    'locality', NULLIF(concat_ws(', ', NULLIF(b.city, ''), NULLIF(b.pincode, '')), ''),
    'booking_date', b.booking_date, 'booking_time', b.booking_time, 'note', b.special_instructions,
    'price', b.provider_amount, 'fee', public.fee_for_service_bill(v_bill),
    'launch_active', public.provider_launch_active(v_pid), 'wallet_balance', public.wallet_balance(v_pid));
END;
$$;

-- First accept wins. The booking row lock serialises every accept for the same booking: the second pro waits, then
-- sees the pro already set and gets 'taken'. Setting provider_id + 'confirmed' together fires the live wallet and KYC
-- checks; their refusal comes back as a result (nothing changes) instead of an error.
CREATE OR REPLACE FUNCTION public.accept_dispatch_offer(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; b public.bookings%ROWTYPE; o public.booking_offers%ROWTYPE; v_msg text;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Only pros can accept offers' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO o FROM public.booking_offers WHERE booking_id = p_booking_id AND provider_id = v_pid;
  IF b.id IS NULL OR o.id IS NULL THEN RETURN jsonb_build_object('result', 'not_offered'); END IF;
  IF b.provider_id = v_pid THEN RETURN jsonb_build_object('result', 'accepted', 'booking_id', b.id); END IF;   -- double tap
  IF b.provider_id IS NOT NULL OR b.dispatch_state = 'assigned' THEN RETURN jsonb_build_object('result', 'taken'); END IF;
  IF b.dispatch_state = 'cancelled' OR b.status::text = 'cancelled' THEN RETURN jsonb_build_object('result', 'withdrawn'); END IF;
  IF b.dispatch_state IS DISTINCT FROM 'searching' OR o.status <> 'offered' THEN RETURN jsonb_build_object('result', 'expired'); END IF;

  BEGIN
    UPDATE public.bookings
       SET provider_id = v_pid, status = 'confirmed', dispatch_state = 'assigned', dispatch_accepted_at = now(), ring_deadline = NULL
     WHERE id = b.id;
  EXCEPTION WHEN raise_exception OR check_violation THEN      -- wallet below the fee (P0001), KYC not approved, ...
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    INSERT INTO public.dispatch_events (booking_id, event, provider_id, detail) VALUES (b.id, 'accept_refused', v_pid, jsonb_build_object('message', v_msg));
    RETURN jsonb_build_object('result', CASE WHEN v_msg ILIKE '%top up%' OR v_msg ILIKE '%wallet%' THEN 'top_up' ELSE 'refused' END, 'message', v_msg);
  END;

  UPDATE public.booking_offers SET status = 'accepted', responded_at = now() WHERE id = o.id;
  UPDATE public.booking_offers SET status = 'taken', responded_at = now() WHERE booking_id = b.id AND id <> o.id AND status = 'offered';
  INSERT INTO public.dispatch_events (booking_id, event, ring, provider_id, detail)
    VALUES (b.id, 'accepted', o.ring, v_pid, jsonb_build_object('seconds', round(extract(epoch FROM now() - b.searched_since))));
  -- The customer is told by the live triggers on 'confirmed' ("Your pro accepted the request").
  RETURN jsonb_build_object('result', 'accepted', 'booking_id', b.id);
END;
$$;

-- The pro app's heartbeat with position (also keeps the 90 s presence rule of the old list alive).
CREATE OR REPLACE FUNCTION public.report_presence(p_lat double precision, p_lng double precision, p_accuracy integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid() AND is_online IS TRUE;
  IF v_pid IS NULL THEN RETURN; END IF;                                   -- offline pros are never located
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN
    RAISE EXCEPTION 'Invalid position' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.provider_presence (provider_id, latitude, longitude, accuracy_m, updated_at)
  VALUES (v_pid, p_lat, p_lng, p_accuracy, now())
  ON CONFLICT (provider_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    accuracy_m = EXCLUDED.accuracy_m, updated_at = EXCLUDED.updated_at;
  UPDATE public.service_providers SET updated_at = now() WHERE id = v_pid;
END;
$$;

-- ── 11. Keep dispatch_state in step when a searching booking is cancelled any other way ─────────────────────────────
-- Named zzz_ so it runs after zz_guard_booking_update (the guard must not see dispatch_state change for a customer).
CREATE OR REPLACE FUNCTION public.dispatch_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_WHEN = 'BEFORE' THEN
    IF NEW.status::text = 'cancelled' AND OLD.status::text <> 'cancelled' AND OLD.dispatch_state IN ('searching','no_pro') THEN
      NEW.dispatch_state := 'cancelled';
      NEW.ring_deadline := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.dispatch_state = 'cancelled' AND OLD.dispatch_state IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.booking_offers SET status = 'withdrawn', responded_at = now() WHERE booking_id = NEW.id AND status IN ('offered','expired');
    INSERT INTO public.dispatch_events (booking_id, event, ring) VALUES (NEW.id, 'cancelled', OLD.current_ring);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zzz_dispatch_on_cancel ON public.bookings;
CREATE TRIGGER zzz_dispatch_on_cancel BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_on_cancel();
DROP TRIGGER IF EXISTS zzz_dispatch_after_cancel ON public.bookings;
CREATE TRIGGER zzz_dispatch_after_cancel AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_on_cancel();

-- ── 12. The live "new booking" notice must not fire for dispatch bookings (offers send their own) ───────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_on_new_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.dispatch_state IS NOT NULL THEN RETURN NEW; END IF;   -- instant dispatch (20261124): offers notify instead
  IF NEW.provider_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND (OLD.provider_id IS NULL OR OLD.provider_id <> NEW.provider_id)) THEN
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (
        NEW.provider_id,
        'new_booking',
        'New Booking Request 📋',
        'You have a new booking for ' ||
          TO_CHAR(NEW.scheduled_date, 'DD Mon YYYY') ||
          CASE WHEN NEW.scheduled_time IS NOT NULL
               THEN ' at ' || NEW.scheduled_time
               ELSE ''
          END || '. Accept or decline it now.',
        jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 13. Who may call what ────────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.dispatch_candidates(uuid), public.dispatch_advance(uuid), public.dispatch_tick(),
  public.dispatch_on_cancel(), public.dispatch_events_append_only(), public.dispatch_is_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_candidates(uuid), public.dispatch_advance(uuid), public.dispatch_tick() TO service_role;
REVOKE ALL ON FUNCTION public.start_dispatch(uuid), public.cancel_search(uuid), public.extend_search(uuid),
  public.get_search_state(uuid), public.get_offer_card(uuid), public.accept_dispatch_offer(uuid),
  public.report_presence(double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_dispatch(uuid), public.cancel_search(uuid), public.extend_search(uuid),
  public.get_search_state(uuid), public.get_offer_card(uuid), public.accept_dispatch_offer(uuid),
  public.report_presence(double precision, double precision, integer) TO authenticated;

-- ── 14. Realtime + the server tick ───────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'booking_offers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_offers;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dispatch-tick';
    PERFORM cron.schedule('dispatch-tick', '3 seconds', 'SELECT public.dispatch_tick()');
  END IF;
END $$;

-- =====================================================================================================================
-- ROLLBACK NOTES (only if the owner asks; nothing here touches money or applied migrations):
--   SELECT cron.unschedule('dispatch-tick');
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.booking_offers;
--   DROP TRIGGER zzz_dispatch_on_cancel ON public.bookings; DROP TRIGGER zzz_dispatch_after_cancel ON public.bookings;
--   DROP FUNCTION public.start_dispatch(uuid), public.cancel_search(uuid), public.extend_search(uuid),
--     public.get_search_state(uuid), public.get_offer_card(uuid), public.accept_dispatch_offer(uuid),
--     public.report_presence(double precision, double precision, integer), public.dispatch_tick(),
--     public.dispatch_advance(uuid), public.dispatch_candidates(uuid), public.dispatch_km(double precision, double precision, double precision, double precision),
--     public.dispatch_on_cancel(), public.dispatch_is_owner(uuid, uuid);
--   DROP TABLE public.dispatch_events, public.booking_offers, public.provider_presence, public.dispatch_settings;
--   DROP FUNCTION public.dispatch_events_append_only();
--   ALTER TABLE public.bookings DROP CONSTRAINT bookings_dispatch_state_check, DROP COLUMN dispatch_state,
--     DROP COLUMN current_ring, DROP COLUMN ring_deadline, DROP COLUMN searched_since, DROP COLUMN search_ends_at,
--     DROP COLUMN dispatch_accepted_at;
--   notify_provider_on_new_booking: re-create it without the first IF line (the rest is the live text of 2026-10-31).
-- =====================================================================================================================

-- ─── CHECK ───
SELECT to_regclass('public.booking_offers') IS NOT NULL AS offers_table,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_dispatch_offer') AS accept_function,
       (SELECT ring_radii_km::text FROM public.dispatch_settings WHERE id) AS rings_should_be_2_5_10,
       (SELECT city_name || ' ' || city_radius_km || ' km' FROM public.dispatch_settings WHERE id) AS city_should_be_jamnagar_20_km,
       EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-tick') AS tick_scheduled;
COMMIT;
