-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (owner, 2026-10-29; PDF "provider sets a rate inside an admin price band"): a pro picks the exact jobs
-- they do inside each service ("Tap leakage", "Toilet repair" …) and may set their own rate per job.
-- Customers who pick a job only see pros who do it, at that pro's rate.
--
-- Today: provider_services has no write policy for pros (they cannot save a rate), and every pro gets every
-- job of a service at the catalogue price.
--
-- What this does
--   1. New table provider_sub_items (provider, job, own rate). service_id is filled by the database.
--      Readable by everyone (no personal data; customers need it to list pros), writable only by the pro
--      who owns the row.
--   2. A row's own rate must sit inside the job's admin band (service_sub_items.price_min/price_max, set on the
--      admin Price bands page). No band set = no own rate allowed (the catalogue price is used).
--   3. enforce_booking_price (BEFORE INSERT on bookings, already live) learns two things:
--        - a pro who ticked jobs in a service cannot be booked for an unticked job in it (22023);
--        - the pro's own rate for the job replaces the catalogue price when it is inside the band.
--      A pro with no rows for the service still does every job at the catalogue price (no pro disappears).
--      Insert only: existing bookings are never re-priced.
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provider_sub_items (
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  sub_item_id  uuid NOT NULL REFERENCES public.service_sub_items(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price numeric(10,2) CHECK (custom_price IS NULL OR custom_price > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, sub_item_id)
);
CREATE INDEX IF NOT EXISTS provider_sub_items_service_idx ON public.provider_sub_items (service_id, provider_id);

-- Fills service_id from the job and keeps an own rate inside the admin band.
CREATE OR REPLACE FUNCTION public.check_provider_sub_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_service uuid;
  v_min     numeric;
  v_max     numeric;
BEGIN
  SELECT service_id, price_min, price_max INTO v_service, v_min, v_max
  FROM public.service_sub_items WHERE id = NEW.sub_item_id;
  IF v_service IS NULL THEN
    RAISE EXCEPTION 'This job is no longer offered by HandyFix.' USING ERRCODE = '22023';
  END IF;
  NEW.service_id := v_service;
  NEW.updated_at := now();

  IF NEW.custom_price IS NOT NULL THEN
    IF v_min IS NULL OR v_max IS NULL THEN
      RAISE EXCEPTION 'HandyFix has not set a price range for this job yet.' USING ERRCODE = '22023';
    END IF;
    IF NEW.custom_price < v_min OR NEW.custom_price > v_max THEN
      RAISE EXCEPTION 'Set a price between ₹% and ₹%.', round(v_min), round(v_max) USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_provider_sub_item ON public.provider_sub_items;
CREATE TRIGGER check_provider_sub_item
  BEFORE INSERT OR UPDATE ON public.provider_sub_items
  FOR EACH ROW EXECUTE FUNCTION public.check_provider_sub_item();

ALTER TABLE public.provider_sub_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_sub_items_read ON public.provider_sub_items;
CREATE POLICY provider_sub_items_read ON public.provider_sub_items FOR SELECT USING (true);

DROP POLICY IF EXISTS provider_sub_items_own_insert ON public.provider_sub_items;
CREATE POLICY provider_sub_items_own_insert ON public.provider_sub_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS provider_sub_items_own_update ON public.provider_sub_items;
CREATE POLICY provider_sub_items_own_update ON public.provider_sub_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_id AND sp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_id AND sp.user_id = auth.uid()));

DROP POLICY IF EXISTS provider_sub_items_own_delete ON public.provider_sub_items;
CREATE POLICY provider_sub_items_own_delete ON public.provider_sub_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_id AND sp.user_id = auth.uid()));

GRANT SELECT ON public.provider_sub_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.provider_sub_items TO authenticated;

-- Same as the live function (applied 2026-10-28 with 20261101) plus the job check and the pro's job rate.
CREATE OR REPLACE FUNCTION public.enforce_booking_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id      uuid;
  v_price       numeric;
  v_from_sub    boolean := false;
  v_min         numeric;
  v_max         numeric;
  v_sub_service uuid;
  v_own         numeric;
BEGIN
  BEGIN
    v_sub_id := NULLIF(to_jsonb(NEW) ->> 'sub_item_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_sub_id := NULL;
  END;

  IF v_sub_id IS NOT NULL THEN
    SELECT base_price, service_id, price_min, price_max INTO v_price, v_sub_service, v_min, v_max
    FROM public.service_sub_items WHERE id = v_sub_id;
    v_from_sub := v_price IS NOT NULL;

    IF v_from_sub AND NEW.provider_id IS NOT NULL THEN
      -- A pro who ticked jobs in this service only takes those jobs.
      IF EXISTS (SELECT 1 FROM public.provider_sub_items WHERE provider_id = NEW.provider_id AND service_id = v_sub_service)
         AND NOT EXISTS (SELECT 1 FROM public.provider_sub_items WHERE provider_id = NEW.provider_id AND sub_item_id = v_sub_id) THEN
        RAISE EXCEPTION 'This pro does not do this job. Pick another pro.' USING ERRCODE = '22023';
      END IF;
      -- The pro's own rate for this job, only while it is inside the band.
      SELECT custom_price INTO v_own FROM public.provider_sub_items
      WHERE provider_id = NEW.provider_id AND sub_item_id = v_sub_id;
      IF v_own IS NOT NULL AND v_min IS NOT NULL AND v_max IS NOT NULL AND v_own BETWEEN v_min AND v_max THEN
        v_price := v_own;
      END IF;
    END IF;
  END IF;

  -- Otherwise the pro's own rate for this service, then the service's starting price.
  IF v_price IS NULL AND NEW.provider_id IS NOT NULL AND NEW.service_id IS NOT NULL THEN
    SELECT custom_price INTO v_price
    FROM public.provider_services
    WHERE provider_id = NEW.provider_id AND service_id = NEW.service_id;
  END IF;
  IF v_price IS NULL AND NEW.service_id IS NOT NULL THEN
    SELECT base_price INTO v_price FROM public.services WHERE id = NEW.service_id;
  END IF;

  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'No valid price is available for this booking.' USING ERRCODE = '22023';
  END IF;

  -- The service band applies to a pro's service-level rate (job prices were checked above).
  IF NOT v_from_sub AND NEW.service_id IS NOT NULL THEN
    SELECT price_min, price_max INTO v_min, v_max FROM public.services WHERE id = NEW.service_id;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND (v_price < v_min OR v_price > v_max) THEN
      RAISE EXCEPTION 'Price % is outside the allowed range % to %.', v_price, v_min, v_max
        USING ERRCODE = '22023';
    END IF;
  END IF;

  NEW.provider_amount := v_price;
  NEW.service_charge  := v_price;
  NEW.platform_fee    := 0;        -- customers never pay a platform fee
  NEW.total_amount    := v_price;  -- price shown = price paid
  RETURN NEW;
END;
$$;

-- ─── ROLLBACK ───
-- Put back the previous enforce_booking_price from 20261101000000_pdf_pricing_model (section "enforce_booking_price"), then:
-- DROP TABLE IF EXISTS public.provider_sub_items;
-- DROP FUNCTION IF EXISTS public.check_provider_sub_item();

-- ─── CHECK ───
SELECT 'table' AS what, count(*)::text AS result FROM public.provider_sub_items
UNION ALL SELECT 'policies', string_agg(policyname, ', ' ORDER BY policyname) FROM pg_policies WHERE tablename = 'provider_sub_items'
UNION ALL SELECT 'trigger', tgname FROM pg_trigger WHERE tgrelid = 'public.provider_sub_items'::regclass AND tgname = 'check_provider_sub_item';
ROLLBACK;
