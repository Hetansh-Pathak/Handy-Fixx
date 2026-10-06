-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix: make customer and provider sides agree (idempotent). NOT run against a live database here.
-- Apply on staging first, after 20261011000000_razorpay_payments.sql.
--
-- 1. booking_provider_info: since phase 14 customers cannot read service_providers, so every
--    `service_providers(...)` join from a booking came back empty ("Your pro", no phone, no rating).
--    This view returns ONLY the pro of the caller's own bookings, and the phone only while the job is live.
-- 2. provider_services: customers read the services a pro offers from here, but nothing ever wrote to it
--    (no write policy; the provider app saved to service_providers.service_ids). sync_my_provider_services()
--    keeps it in step.
-- 3. provider_service_pricing: the provider app reads and writes it, but no migration created it.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.booking_provider_info AS
SELECT
  b.id              AS booking_id,
  sp.id             AS provider_id,
  sp.full_name,
  sp.name,
  sp.rating,
  sp.avatar_url,
  CASE WHEN b.status IN ('confirmed', 'on_the_way', 'in_progress') THEN sp.phone END AS phone
FROM public.bookings b
JOIN public.service_providers sp ON sp.id = b.provider_id
WHERE auth.uid() IS NOT NULL
  AND (b.customer_id = auth.uid() OR b.user_id = auth.uid());

REVOKE ALL ON public.booking_provider_info FROM PUBLIC, anon;
GRANT SELECT ON public.booking_provider_info TO authenticated;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_my_provider_services(p_service_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider uuid;
  v_ids uuid[] := COALESCE(p_service_ids, ARRAY[]::uuid[]);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_provider FROM public.service_providers WHERE user_id = auth.uid();
  IF v_provider IS NULL THEN RAISE EXCEPTION 'Not a provider' USING ERRCODE = '42501'; END IF;

  DELETE FROM public.provider_services
   WHERE provider_id = v_provider AND NOT (service_id = ANY (v_ids));

  INSERT INTO public.provider_services (provider_id, service_id)
  SELECT v_provider, s.id
    FROM public.services s
   WHERE s.id = ANY (v_ids)
     AND NOT EXISTS (SELECT 1 FROM public.provider_services ps WHERE ps.provider_id = v_provider AND ps.service_id = s.id);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_my_provider_services(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_provider_services(uuid[]) TO authenticated;

-- One-off: fill provider_services from the arrays providers already saved.
INSERT INTO public.provider_services (provider_id, service_id)
SELECT sp.id, sid
  FROM public.service_providers sp, LATERAL unnest(COALESCE(sp.service_ids, ARRAY[]::uuid[])) AS sid
 WHERE EXISTS (SELECT 1 FROM public.services s WHERE s.id = sid)
   AND NOT EXISTS (SELECT 1 FROM public.provider_services ps WHERE ps.provider_id = sp.id AND ps.service_id = sid);

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_service_pricing (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price numeric(10,2),
  is_available boolean NOT NULL DEFAULT true,
  UNIQUE (provider_id, service_id)
);
ALTER TABLE public.provider_service_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_pricing_own" ON public.provider_service_pricing;
CREATE POLICY "provider_pricing_own" ON public.provider_service_pricing
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- PostgREST caches the schema: without this a freshly created function/table can answer "not found in the schema cache".
NOTIFY pgrst, 'reload schema';
