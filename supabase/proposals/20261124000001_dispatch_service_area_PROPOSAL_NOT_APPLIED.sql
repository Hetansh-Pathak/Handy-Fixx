-- =====================================================================================================================
-- PROPOSAL 20261124000001: instant dispatch also reaches pros whose service area is the city   NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Needs 20261124000000 (applied 2026-10-31). Owner, 2026-10-31: "the providers that are in Jamnagar didn't get any
-- request". Read-only check of the first live search: the only pro with the app open (madhav) reported a position in
-- Ahmedabad (23.03, 72.58: a PC browser guesses its position from the internet line), 264 km from the customer, so
-- every ring was skipped. His profile's service area lists "Jamnagar".
--
-- Change (twin: dispatchEligibility + servesCity in packages/shared/src/dispatch/eligibility.ts):
--   * Rings 1..n (2 / 5 / 10 km) still use the live GPS position: the nearest pros are asked first.
--   * The CITY ring also takes an online pro with a fresh heartbeat whose service area (service_providers.pincodes)
--     lists the city's name or a pincode starting with dispatch_settings.city_pincode_prefix ('361' for Jamnagar),
--     when their GPS position is missing or outside the city. Their distance = the customer's distance to the city
--     centre (never "264 km away").
--   * A GPS position counts only while it is fresh (provider_presence.updated_at). The service-area path needs the
--     existing 30 s heartbeat (service_providers.updated_at), so a pro with the app open but no position yet is not
--     missed, and a pro whose app is closed is never asked.
-- Replaces one function (dispatch_candidates) and adds one settings column. Nothing else changes.
-- Rollback: re-create dispatch_candidates from 20261124000000 (section 6); the column is harmless to keep.
-- =====================================================================================================================

ALTER TABLE public.dispatch_settings ADD COLUMN IF NOT EXISTS city_pincode_prefix text NOT NULL DEFAULT '361'
  CHECK (city_pincode_prefix ~ '^[0-9]{1,6}$');

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
