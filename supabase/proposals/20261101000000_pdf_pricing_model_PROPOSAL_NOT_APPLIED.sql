-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (HandyFix-complete.pdf, pages 2-3): the customer pays exactly the price shown, which is
-- the pro's own rate, with a Rs 0 platform fee, and the price is locked at booking. Admin sets a
-- price band per service and a pro's rate must sit inside it.
--
-- What this changes
--   1. Adds optional price bands (price_min / price_max) to services and service_sub_items.
--      A NULL band means "no limit", so nothing is enforced until an admin sets bands.
--   2. Rejects a pro rate (provider_services.custom_price) outside its service's band.
--   3. Replaces the 12% trigger enforce_booking_fee with enforce_booking_price:
--        price = sub-item catalogue price, else the pro's own rate, else the service base price
--        provider_amount = service_charge = total_amount = price, platform_fee = 0.
--      The price comes ONLY from the database; whatever the client sends is ignored. If no valid
--      price exists the booking is refused (the old trigger silently trusted the client value).
--
-- What this does NOT do (separate migration, built with the wallet slice)
--   * The pro's flat fee (Rs 15 / 30 / 50) deducted from the wallet when a job completes, the
--     fee-free launch period, and the "due" balance. Until that exists, applying THIS file alone
--     means HandyFix collects no fee at all (confirm_cash_collected posts platform_fee = 0).
--   * It keeps the existing wallet tables, payouts, disputes and guard triggers untouched.
--
-- Safe to re-run (idempotent). Rollback is at the bottom.
-- Before applying: run supabase/verify/04_pricing_state_READONLY.sql and read every row.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Price bands (NULL = no band) ────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS price_min numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_max numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_price_band_chk') THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_price_band_chk
      CHECK ((price_min IS NULL AND price_max IS NULL) OR (price_min > 0 AND price_max >= price_min));
  END IF;

  -- service_sub_items exists on the live project but is not in the migrations, so guard it.
  IF to_regclass('public.service_sub_items') IS NOT NULL THEN
    ALTER TABLE public.service_sub_items
      ADD COLUMN IF NOT EXISTS price_min numeric(10,2),
      ADD COLUMN IF NOT EXISTS price_max numeric(10,2);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_sub_items_price_band_chk') THEN
      ALTER TABLE public.service_sub_items
        ADD CONSTRAINT service_sub_items_price_band_chk
        CHECK ((price_min IS NULL AND price_max IS NULL) OR (price_min > 0 AND price_max >= price_min));
    END IF;
  END IF;
END $$;

-- ─── 2. A pro's rate must sit inside the service's band ─────────────────────
CREATE OR REPLACE FUNCTION public.enforce_provider_rate_band()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_min numeric;
  v_max numeric;
BEGIN
  IF NEW.custom_price IS NULL THEN RETURN NEW; END IF;
  IF NEW.custom_price <= 0 THEN
    RAISE EXCEPTION 'Rate must be above 0.' USING ERRCODE = '22023';
  END IF;

  SELECT price_min, price_max INTO v_min, v_max FROM public.services WHERE id = NEW.service_id;
  IF v_min IS NOT NULL AND v_max IS NOT NULL AND (NEW.custom_price < v_min OR NEW.custom_price > v_max) THEN
    RAISE EXCEPTION 'Rate % is outside the allowed range % to %.', NEW.custom_price, v_min, v_max
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_provider_rate_band ON public.provider_services;
CREATE TRIGGER enforce_provider_rate_band
  BEFORE INSERT OR UPDATE OF custom_price, service_id ON public.provider_services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_rate_band();

-- ─── 3. The booking price is decided by the database and locked at insert ───
CREATE OR REPLACE FUNCTION public.enforce_booking_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub_id   uuid;
  v_price    numeric;
  v_from_sub boolean := false;
  v_min      numeric;
  v_max      numeric;
BEGIN
  -- Sub-item chosen: its catalogue price is the same for every pro.
  BEGIN
    v_sub_id := NULLIF(to_jsonb(NEW) ->> 'sub_item_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_sub_id := NULL;
  END;

  IF v_sub_id IS NOT NULL AND to_regclass('public.service_sub_items') IS NOT NULL THEN
    SELECT NULLIF(to_jsonb(s) ->> 'base_price', '')::numeric INTO v_price
    FROM public.service_sub_items s WHERE s.id = v_sub_id;
    v_from_sub := v_price IS NOT NULL;
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

  -- The band applies to a pro's own rate (a catalogue sub-item price is set by HandyFix).
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

-- The old trigger function enforce_booking_fee() is left defined so rollback is one statement.
DROP TRIGGER IF EXISTS enforce_booking_fee ON public.bookings;
DROP TRIGGER IF EXISTS enforce_booking_price ON public.bookings;
CREATE TRIGGER enforce_booking_price
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_price();

-- ─── ROLLBACK (run only to go back to the 12% model) ────────────────────────
-- DROP TRIGGER IF EXISTS enforce_booking_price ON public.bookings;
-- CREATE TRIGGER enforce_booking_fee
--   BEFORE INSERT ON public.bookings
--   FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_fee();
-- DROP TRIGGER IF EXISTS enforce_provider_rate_band ON public.provider_services;
-- (The price_min / price_max columns are harmless and can stay.)
