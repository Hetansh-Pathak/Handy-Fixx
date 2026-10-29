-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- HandyFix-complete.pdf p.10-11: "Arrival location logged as evidence" and the dispute timeline with
-- "price locked, live trip, arrival location, code-entry time, chat and any approved extras".
-- Today nothing stores where the pro was when they tapped "I've arrived", and the admin cannot see the chat.
--
-- What this does (nothing existing is changed, no policy and no trigger is touched)
--   1. bookings gets arrived_at, arrived_lat, arrived_lng (nullable). The dispute timeline already reads
--      arrived_at when it exists (20261107 uses to_jsonb(b) ->> 'arrived_at').
--   2. record_arrival(booking, lat, lng): the booking's own pro calls it right after "I've arrived". It writes the time
--      and the position ONCE (a second call changes nothing). A SECURITY DEFINER function bypasses the
--      guard_booking_update trigger on purpose, so pros still cannot write these columns directly.
--      The position is optional (no permission = time only) and checked to be a real latitude/longitude.
--   3. admin_booking_evidence(booking): admins only, and only for a booking that has a dispute. Returns the arrival
--      record, the last live-trip position, and the chat (sender, text, time; newest 200). Never other bookings.
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL OR to_regclass('public.service_providers') IS NULL
     OR to_regclass('public.messages') IS NULL OR to_regclass('public.booking_disputes') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261107000000_extra_work_and_disputes first (booking_disputes missing)';
  END IF;
  IF to_regprocedure('public.has_role(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'public.has_role is missing';
  END IF;
END $$;

-- ─── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS arrived_at  timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS arrived_lat double precision;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS arrived_lng double precision;

-- ─── 2. The pro records their arrival (once) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_arrival(p_booking_id uuid, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
  v_at     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in first');
  END IF;

  SELECT b.status::text, b.arrived_at INTO v_status, v_at
  FROM public.bookings b
  JOIN public.service_providers sp ON sp.id = b.provider_id
  WHERE b.id = p_booking_id AND sp.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'This is not your booking');
  END IF;
  IF v_status NOT IN ('arrived', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Arrival is recorded after you tap I''ve arrived');
  END IF;
  IF v_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_recorded', true);   -- evidence is written once
  END IF;

  -- A position must be both parts and a real place; otherwise only the time is kept.
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
     OR p_lat = 'NaN'::double precision OR p_lng = 'NaN'::double precision THEN
    p_lat := NULL;
    p_lng := NULL;
  END IF;

  UPDATE public.bookings SET arrived_at = now(), arrived_lat = p_lat, arrived_lng = p_lng WHERE id = p_booking_id;
  RETURN jsonb_build_object('success', true, 'already_recorded', false, 'with_position', p_lat IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.record_arrival(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_arrival(uuid, double precision, double precision) TO authenticated;

-- ─── 3. Admin evidence for a disputed booking ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_booking_evidence(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_disputes WHERE booking_id = p_booking_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking has no dispute');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'job_latitude',  (SELECT latitude  FROM public.bookings WHERE id = p_booking_id),
    'job_longitude', (SELECT longitude FROM public.bookings WHERE id = p_booking_id),
    'arrival', (SELECT jsonb_build_object('at', b.arrived_at, 'lat', b.arrived_lat, 'lng', b.arrived_lng)
                FROM public.bookings b WHERE b.id = p_booking_id),
    'last_trip_position', (SELECT jsonb_build_object('lat', l.latitude, 'lng', l.longitude, 'at', l.updated_at)
                           FROM public.provider_locations l WHERE l.booking_id = p_booking_id),
    'chat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('sender', m.sender_type, 'text', m.content, 'at', m.created_at) ORDER BY m.created_at)
      FROM (SELECT * FROM public.messages WHERE booking_id = p_booking_id ORDER BY created_at DESC LIMIT 200) m
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_booking_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_evidence(uuid) TO authenticated;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.admin_booking_evidence(uuid);
--   DROP FUNCTION IF EXISTS public.record_arrival(uuid, double precision, double precision);
--   ALTER TABLE public.bookings DROP COLUMN IF EXISTS arrived_lng, DROP COLUMN IF EXISTS arrived_lat, DROP COLUMN IF EXISTS arrived_at;
