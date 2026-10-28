-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Adds the `arrived` booking status from the PDF lifecycle:
--   pending > confirmed > on_the_way > ARRIVED > in_progress > completed
--
-- BEFORE running: run supabase/verify/05_booking_status_and_triggers_READONLY.sql.
--   * If bookings.status is an ENUM (booking_status): this file is needed.
--   * If it is plain text and no CHECK constraint lists statuses: you do not need this file at all.
--
-- Run this file ON ITS OWN, as its own query. PostgreSQL does not allow a newly added enum value
-- to be used in the same transaction that adds it.
--
-- Until it is applied the mobile app keeps working: it goes on_the_way > in_progress and shows
-- "STEP x OF 3" instead of "x OF 4" (EXPO_PUBLIC_ARRIVED_STATUS is not set to 1).
-- After applying, set EXPO_PUBLIC_ARRIVED_STATUS=1 in the app build.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'arrived' AFTER 'on_the_way';

-- If the verify script showed a CHECK constraint that lists statuses, it must also allow 'arrived'
-- (replace the constraint name and list below with what the check printed):
-- ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
-- ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
--   CHECK (status IN ('pending','confirmed','on_the_way','arrived','in_progress','completed','cancelled'));

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Read this header before running anything.
--
-- Goal (HandyFix-complete.pdf p.6-8, "Option A"): the provider pays a FLAT fee, only on a completed job,
-- from a prepaid wallet. The customer pays the pro directly (UPI or cash).
--     bill under Rs 500  -> Rs 15      Rs 500 to 1,500 -> Rs 30      above Rs 1,500 -> Rs 50
-- The first 3 months OR first 10 jobs after approval are fee-free (the fee is shown as "waived").
-- Accepting needs wallet >= the fee ("Top up Rs 100 to accept"); a job that completes on a short wallet
-- still completes and the fee becomes a due (the ledger goes negative); new accepts stay blocked until paid.
--
-- It builds on the live wallet ledger (wallet_transactions, wallet_post, get_wallet_summary): a signed
-- balance where money you owe is simply a negative balance. The flat fee is posted as type 'cash_fee'.
--
-- What this changes
--   1. fee_for_service_bill(): the flat slabs (must match packages/shared fee.ts; a test checks the numbers).
--   2. provider_launch_active(): fee-free launch, counted from service_providers.kyc_reviewed_at (approval).
--   3. booking_fees: one audit row per completed job (bill, slab, charged, waived).
--   4. settle_booking_fee(): posts the fee once per booking (idempotent) or records it as waived.
--   5. complete_booking_with_code(): the live function, unchanged except it now settles the fee.
--   6. enforce_wallet_before_accept(): replaces enforce_dues_before_accept (wallet must cover the fee,
--      unless the launch period is active).
--   7. provider_block_reason(): now always NULL. The old "dues limit" and "unsettled job" rules belong to the
--      Razorpay QR / cash-collection model. In particular "unsettled_job" would lock EVERY pro out 24 h after
--      their first job, because the new flow has no "record payment" step.
--
-- What this does NOT do
--   * Extra-work approvals: the fee base is the booking's provider_amount until extra work exists.
--   * Wallet top-up screens, payouts, Razorpay (slice 5). The existing wallet tables and edge functions stay.
--   * Customer-side price locking: that is 20261101000000_pdf_pricing_model (apply it FIRST).
--
-- Apply order: 20261101 pricing  ->  20261102000000 arrived status (if needed)  ->  this file.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The flat slabs ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fee_for_service_bill(p_bill numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_bill IS NULL OR p_bill <= 0 THEN 0
    WHEN p_bill < 500 THEN 15
    WHEN p_bill <= 1500 THEN 30
    ELSE 50
  END::numeric;
$$;

-- ─── 2. Fee-free launch: first 3 months OR first 10 jobs, whichever ends first ──
-- p_exclude_booking lets the completion step ask "how many jobs BEFORE this one".
CREATE OR REPLACE FUNCTION public.provider_launch_active(p_provider_id uuid, p_exclude_booking uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_approved timestamptz;
  v_done     integer;
BEGIN
  SELECT kyc_reviewed_at INTO v_approved FROM public.service_providers WHERE id = p_provider_id;
  IF v_approved IS NULL THEN RETURN false; END IF;                  -- not approved yet: the clock has not started
  IF now() >= v_approved + interval '3 months' THEN RETURN false; END IF;

  SELECT count(*) INTO v_done
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.status::text = 'completed'
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking);
  RETURN v_done < 10;
END;
$$;

-- ─── 3. One audit row per completed job (the "fee record" in the PDF) ───────
CREATE TABLE IF NOT EXISTS public.booking_fees (
  booking_id   uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id  uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE RESTRICT,
  service_bill numeric(12,2) NOT NULL,
  slab_fee     numeric(12,2) NOT NULL,
  charged      numeric(12,2) NOT NULL DEFAULT 0,
  waived       numeric(12,2) NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers read own fee records" ON public.booking_fees;
CREATE POLICY "Providers read own fee records" ON public.booking_fees
  FOR SELECT TO authenticated
  USING (
    provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
-- No INSERT/UPDATE/DELETE policies on purpose: rows are written only by settle_booking_fee().

-- ─── 4. Post the fee once, or record it as waived ───────────────────────────
CREATE OR REPLACE FUNCTION public.settle_booking_fee(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b       record;
  v_bill  numeric;
  v_slab  numeric;
  v_waive boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_fees WHERE booking_id = p_booking_id) THEN RETURN; END IF;

  SELECT id, provider_id, status, provider_amount INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.provider_id IS NULL OR b.status::text <> 'completed' THEN RETURN; END IF;

  v_bill := COALESCE(b.provider_amount, 0);              -- later: + approved service extras, never parts
  v_slab := public.fee_for_service_bill(v_bill);
  v_waive := public.provider_launch_active(b.provider_id, p_booking_id);

  IF v_slab > 0 AND NOT v_waive THEN
    -- Negative amount = the pro pays. If the wallet is short it simply goes negative: that is the "due".
    PERFORM public.wallet_post(b.provider_id, b.id, 'cash_fee', -v_slab, 'fee:' || b.id::text, NULL,
                               'Flat fee for completed job', NULL);
  END IF;

  INSERT INTO public.booking_fees (booking_id, provider_id, service_bill, slab_fee, charged, waived)
  VALUES (b.id, b.provider_id, v_bill, v_slab,
          CASE WHEN v_waive THEN 0 ELSE v_slab END,
          CASE WHEN v_waive THEN v_slab ELSE 0 END)
  ON CONFLICT (booking_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_booking_fee(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 5. The live completion function, plus fee settlement ───────────────────
CREATE OR REPLACE FUNCTION public.complete_booking_with_code(p_booking_id uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking        record;
  v_code_row       record;
  v_provider_uid   uuid;
  v_max_attempts   constant integer := 5;
  v_lock_minutes   constant integer := 15;
  v_new_attempts   integer;
  v_lock           timestamptz;
BEGIN
  SELECT sp.user_id INTO v_provider_uid
  FROM public.bookings b
  JOIN public.service_providers sp ON sp.id = b.provider_id
  WHERE b.id = p_booking_id;

  IF v_provider_uid IS NULL OR v_provider_uid <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking.status::text <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_booking.status::text);
  END IF;

  SELECT * INTO v_code_row FROM public.booking_completion_codes WHERE booking_id = p_booking_id;
  IF v_code_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;

  IF v_code_row.locked_until IS NOT NULL AND v_code_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_code_row.locked_until);
  END IF;

  IF v_code_row.code <> p_code THEN
    v_new_attempts := v_code_row.failed_attempts + 1;
    v_lock := NULL;
    IF v_new_attempts >= v_max_attempts THEN
      v_lock := now() + (v_lock_minutes || ' minutes')::interval;
    END IF;

    UPDATE public.booking_completion_codes
    SET failed_attempts = v_new_attempts, locked_until = v_lock
    WHERE booking_id = p_booking_id;

    RETURN jsonb_build_object(
      'ok', false, 'reason', 'wrong_code',
      'attempts_left', GREATEST(0, v_max_attempts - v_new_attempts),
      'locked', v_lock IS NOT NULL, 'locked_until', v_lock
    );
  END IF;

  PERFORM set_config('handyfix.completing', 'true', true);

  UPDATE public.bookings
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_booking_id;

  PERFORM set_config('handyfix.completing', 'false', true);

  UPDATE public.booking_completion_codes
  SET failed_attempts = 0, locked_until = NULL
  WHERE booking_id = p_booking_id;

  -- NEW: the flat fee (or its waiver) is settled only now, only after a successful code.
  PERFORM public.settle_booking_fee(p_booking_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_booking_with_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking_with_code(uuid, text) TO authenticated;

-- ─── 6. Accepting needs wallet >= the fee (unless in the launch period) ─────
CREATE OR REPLACE FUNCTION public.enforce_wallet_before_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fee     numeric;
  v_balance numeric;
  v_topup   numeric;
BEGIN
  IF NEW.provider_id IS NULL OR OLD.status::text <> 'pending' OR NEW.status::text <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF public.provider_launch_active(NEW.provider_id) THEN RETURN NEW; END IF;   -- launch: wallet check skipped

  v_fee     := public.fee_for_service_bill(COALESCE(NEW.provider_amount, 0));
  v_balance := public.wallet_balance(NEW.provider_id);                        -- negative = dues

  IF v_balance < v_fee OR v_balance < 0 THEN
    v_topup := GREATEST(100, CEIL(v_fee - v_balance));
    RAISE EXCEPTION 'Wallet below the fee. Top up Rs % to accept.', v_topup USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dues_before_accept ON public.bookings;
DROP TRIGGER IF EXISTS enforce_wallet_before_accept ON public.bookings;
CREATE TRIGGER enforce_wallet_before_accept
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_before_accept();

-- ─── 7. Retire the old QR / cash-collection blocks ──────────────────────────
-- Going online and declining stay free (PDF: "Rs 0 to join, go online, decline or miss a request").
-- enforce_dues_before_online, wallet_enforce_limit and get_wallet_summary still call this and become no-ops.
CREATE OR REPLACE FUNCTION public.provider_block_reason(p_provider_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::text;
$$;

-- ─── ROLLBACK (back to the 12% / dues-limit model) ──────────────────────────
-- 1. Re-run supabase/migrations/provider/20261015000000_wallet_ledger.sql sections 5, 6c and 7
--    (provider_block_reason, complete_booking_with_code, enforce_dues_before_accept trigger).
-- 2. DROP TRIGGER IF EXISTS enforce_wallet_before_accept ON public.bookings;
-- 3. The fee rows already posted stay in wallet_transactions (the ledger is append-only by design).

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Read this header before running anything.
--
-- Goal (HandyFix-complete.pdf p.3, 5, 10, 11): the three things the other proposals leave out.
--   A. EXTRA WORK: the pro adds an item (parts need a bill photo), the customer must tap Approve.
--      Only an approved item grows the bill. Parts are not part of the flat fee.
--   B. DISPUTES: 24 h window (48 h for repair quality), the pro replies, HandyFix attaches the job
--      timeline, an admin decides (dismissed / redo / partial refund / provider penalty), either
--      side can appeal once, safety reports suspend the pro at once, everything is audit-logged.
--   C. SMALL HELPERS: get_booking_provider() (customers cannot read service_providers; phone only
--      after confirmation) and the admin RPCs for the Price bands and Fees & disputes pages.
--
-- APPLY ORDER (this file builds on the other two, it does not repeat them):
--   1. 20261101000000_pdf_pricing_model      (price bands, locked price, platform_fee = 0)
--   2. 20261102000001_provider_wallet_fee    (flat fee, launch waiver, accept check, booking_fees)
--   3. THIS FILE
--
-- What this changes
--   * bookings: + extras_amount, parts_amount (both protected by the money-column guard).
--   * booking_extras table + add_booking_extra / withdraw_booking_extra / decide_booking_extra.
--   * Completion is refused while an extra is still waiting for the customer (P0001 message).
--   * settle_booking_fee(): same as the wallet-fee proposal, but the fee base EXCLUDES parts.
--   * booking_fees.refunded + dispute refunds (fee is returned through an 'adjustment' ledger row).
--   * booking_disputes + raise / reply / appeal RPCs; admin_decide_dispute.
--   * get_booking_provider, admin_set_price_band, admin_list_booking_disputes, admin_fee_overview.
--
-- What this does NOT do
--   * It does not touch the old payment_disputes (cash-payment reports); those stay as they are.
--   * No new ledger types: the existing wallet_transactions CHECK is left alone.
--
-- Tested on PostgreSQL 16 against a stub of the Supabase schema (extra approval, completion block,
-- fee excludes parts, dispute -> refund -> appeal, safety suspension). Not tested on the live project.
-- Dry run first: change the last line COMMIT; to ROLLBACK; and run. Safe to re-run. Rollback at bottom.
-- ═══════════════════════════════════════════════════════════════════════════


DO $$
BEGIN
  IF to_regclass('public.booking_fees') IS NULL OR to_regprocedure('public.settle_booking_fee(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261102000001_provider_wallet_fee first (booking_fees / settle_booking_fee missing)';
  END IF;
  IF to_regprocedure('public.enforce_booking_price()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261101000000_pdf_pricing_model first';
  END IF;
END $$;

-- ─── 1. Booking columns, protected like the other money columns ─────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS extras_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS parts_amount  numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.booking_fees ADD COLUMN IF NOT EXISTS refunded numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.guard_booking_money_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col text;
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('wallet.internal', true) = 'true' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  FOREACH v_col IN ARRAY ARRAY['total_amount','platform_fee','provider_amount','service_charge',
                               'final_amount','coupon_code','coupon_discount','payment_status',
                               'extras_amount','parts_amount']
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'Payment fields (%) cannot be changed directly.', v_col USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- New bookings always start with no extras (a client cannot insert them).
CREATE OR REPLACE FUNCTION public.reset_booking_extras_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.extras_amount := 0;
  NEW.parts_amount  := 0;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reset_booking_extras_on_insert ON public.bookings;
CREATE TRIGGER reset_booking_extras_on_insert
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.reset_booking_extras_on_insert();

-- ─── 2. Extra work (customer must approve) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_extras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  kind        text NOT NULL DEFAULT 'labour' CHECK (kind IN ('labour','parts')),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  photo_path  text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz
);
CREATE INDEX IF NOT EXISTS booking_extras_booking_idx ON public.booking_extras (booking_id, created_at);

ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_extras_read" ON public.booking_extras;
CREATE POLICY "booking_extras_read" ON public.booking_extras FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_extras.booking_id AND b.customer_id = auth.uid())
  OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
REVOKE INSERT, UPDATE, DELETE ON public.booking_extras FROM anon, authenticated;
GRANT SELECT ON public.booking_extras TO authenticated;

CREATE OR REPLACE FUNCTION public.add_booking_extra(
  p_booking_id uuid, p_title text, p_amount numeric, p_kind text DEFAULT 'labour', p_photo_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid;
  b     record;
  v_id  uuid;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF v_pid IS NULL OR NOT FOUND OR b.provider_id IS DISTINCT FROM v_pid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF b.status::text NOT IN ('on_the_way','arrived','in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  IF COALESCE(p_kind, 'labour') NOT IN ('labour','parts') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  IF char_length(TRIM(COALESCE(p_title, ''))) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_title');
  END IF;
  IF p_kind = 'parts' AND COALESCE(p_photo_path, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'photo_required');
  END IF;
  IF (SELECT COUNT(*) FROM public.booking_extras WHERE booking_id = p_booking_id AND status = 'pending') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_pending');
  END IF;

  INSERT INTO public.booking_extras (booking_id, provider_id, title, kind, amount, photo_path)
  VALUES (p_booking_id, v_pid, TRIM(p_title), COALESCE(p_kind, 'labour'), ROUND(p_amount), NULLIF(p_photo_path, ''))
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (b.customer_id, 'extra_work', 'Approve extra work: Rs ' || ROUND(p_amount)::text,
            TRIM(p_title) || '. Your price stays Rs ' || COALESCE(b.total_amount, 0)::text || ' unless you approve.',
            b.id, jsonb_build_object('extra_id', v_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_booking_extra(p_extra_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e record;
BEGIN
  SELECT x.* INTO e FROM public.booking_extras x
  JOIN public.service_providers sp ON sp.id = x.provider_id
  WHERE x.id = p_extra_id AND sp.user_id = auth.uid() FOR UPDATE OF x;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF e.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_decided'); END IF;
  UPDATE public.booking_extras SET status = 'withdrawn', decided_at = now() WHERE id = p_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_booking_extra(p_extra_id uuid, p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e record;
  b record;
BEGIN
  SELECT * INTO e FROM public.booking_extras WHERE id = p_extra_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  SELECT * INTO b FROM public.bookings WHERE id = e.booking_id FOR UPDATE;
  IF b.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF e.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_decided'); END IF;
  IF b.status::text NOT IN ('on_the_way','arrived','in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  UPDATE public.booking_extras
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, decided_at = now()
  WHERE id = p_extra_id;

  IF p_approve THEN
    PERFORM set_config('wallet.internal', 'true', true);
    UPDATE public.bookings SET
      extras_amount   = COALESCE(extras_amount, 0) + e.amount,
      parts_amount    = COALESCE(parts_amount, 0) + CASE WHEN e.kind = 'parts' THEN e.amount ELSE 0 END,
      total_amount    = COALESCE(total_amount, 0) + e.amount,
      provider_amount = COALESCE(provider_amount, 0) + e.amount,
      updated_at      = now()
    WHERE id = b.id;
    PERFORM set_config('wallet.internal', 'false', true);
  END IF;

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (e.provider_id, 'extra_work_' || CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
            CASE WHEN p_approve THEN 'Extra work approved: +Rs ' ELSE 'Extra work declined: Rs ' END || e.amount::text,
            e.title, jsonb_build_object('booking_id', b.id, 'extra_id', e.id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'approved', p_approve,
                            'total', (SELECT total_amount FROM public.bookings WHERE id = b.id));
END;
$$;

-- Completion is refused while an extra still waits for the customer.
CREATE OR REPLACE FUNCTION public.block_completion_with_pending_extras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'completed' AND OLD.status::text IS DISTINCT FROM 'completed'
     AND EXISTS (SELECT 1 FROM public.booking_extras WHERE booking_id = NEW.id AND status = 'pending') THEN
    RAISE EXCEPTION 'An extra-work item is still waiting for the customer. Ask them to approve or decline it, or withdraw it.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS block_completion_with_pending_extras ON public.bookings;
CREATE TRIGGER block_completion_with_pending_extras
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.block_completion_with_pending_extras();

-- Bill photos for parts: the pro uploads into <their auth uid>/..., the booking's customer and admins read.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('booking-extras', 'booking-extras', false)
    ON CONFLICT (id) DO NOTHING;

    EXECUTE 'DROP POLICY IF EXISTS "booking_extras_upload_own" ON storage.objects';
    EXECUTE $p$CREATE POLICY "booking_extras_upload_own" ON storage.objects FOR INSERT TO authenticated
             WITH CHECK (bucket_id = 'booking-extras' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
    EXECUTE 'DROP POLICY IF EXISTS "booking_extras_read_parties" ON storage.objects';
    EXECUTE $p$CREATE POLICY "booking_extras_read_parties" ON storage.objects FOR SELECT TO authenticated
             USING (bucket_id = 'booking-extras' AND (
               (storage.foldername(name))[1] = auth.uid()::text
               OR EXISTS (SELECT 1 FROM public.booking_extras x JOIN public.bookings b ON b.id = x.booking_id
                          WHERE x.photo_path = storage.objects.name
                            AND (b.customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))))$p$;
  END IF;
END $$;

-- ─── 3. The fee base excludes parts (everything else as in the wallet-fee proposal) ─
CREATE OR REPLACE FUNCTION public.settle_booking_fee(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b       record;
  v_bill  numeric;
  v_slab  numeric;
  v_waive boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_fees WHERE booking_id = p_booking_id) THEN RETURN; END IF;

  SELECT id, provider_id, status, provider_amount, parts_amount INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.provider_id IS NULL OR b.status::text <> 'completed' THEN RETURN; END IF;

  v_bill := GREATEST(0, COALESCE(b.provider_amount, 0) - COALESCE(b.parts_amount, 0));   -- service bill: parts excluded
  v_slab := public.fee_for_service_bill(v_bill);
  v_waive := public.provider_launch_active(b.provider_id, p_booking_id);

  IF v_slab > 0 AND NOT v_waive THEN
    PERFORM public.wallet_post(b.provider_id, b.id, 'cash_fee', -v_slab, 'fee:' || b.id::text, NULL,
                               'Flat fee for completed job', NULL);
  END IF;

  INSERT INTO public.booking_fees (booking_id, provider_id, service_bill, slab_fee, charged, waived)
  VALUES (b.id, b.provider_id, v_bill, v_slab,
          CASE WHEN v_waive THEN 0 ELSE v_slab END,
          CASE WHEN v_waive THEN v_slab ELSE 0 END)
  ON CONFLICT (booking_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_booking_fee(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 4. Disputes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.bookings(id),
  customer_id     uuid NOT NULL,
  provider_id     uuid NOT NULL REFERENCES public.service_providers(id),
  category        text NOT NULL CHECK (category IN ('poor_work','overcharged','no_show','damage','behaviour','safety')),
  details         text NOT NULL,
  provider_reply  text,
  replied_at      timestamptz,
  timeline        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','decided','appealed','closed')),
  outcome         text CHECK (outcome IN ('dismissed','redo','partial_refund','provider_penalty')),
  decision_note   text,
  decided_by      uuid,
  decided_at      timestamptz,
  appealed_by     text CHECK (appealed_by IN ('customer','provider')),
  appeal_note     text,
  appealed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_disputes_one_per_booking ON public.booking_disputes (booking_id);
CREATE INDEX IF NOT EXISTS booking_disputes_status_idx ON public.booking_disputes (status, created_at DESC);

ALTER TABLE public.booking_disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_disputes_parties_read" ON public.booking_disputes;
CREATE POLICY "booking_disputes_parties_read" ON public.booking_disputes FOR SELECT TO authenticated USING (
  customer_id = auth.uid()
  OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
REVOKE INSERT, UPDATE, DELETE ON public.booking_disputes FROM anon, authenticated;
GRANT SELECT ON public.booking_disputes TO authenticated;

CREATE OR REPLACE FUNCTION public.raise_booking_dispute(p_booking_id uuid, p_category text, p_details text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b         record;
  v_hours   integer;
  v_details text := TRIM(COALESCE(p_details, ''));
  v_id      uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF b.status::text <> 'completed' OR b.completed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completed');
  END IF;
  IF p_category NOT IN ('poor_work','overcharged','no_show','damage','behaviour','safety') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_category');
  END IF;
  IF char_length(v_details) < 10 OR char_length(v_details) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  v_hours := CASE WHEN p_category = 'poor_work' THEN 48 ELSE 24 END;   -- repair quality gets 48 h
  IF b.completed_at < now() - make_interval(hours => v_hours) AND p_category <> 'safety' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'window_closed', 'hours', v_hours);
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_disputes WHERE booking_id = p_booking_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reported');
  END IF;

  INSERT INTO public.booking_disputes (booking_id, customer_id, provider_id, category, details, timeline)
  VALUES (b.id, b.customer_id, b.provider_id, p_category, v_details, jsonb_build_object(
    'booked_at', b.created_at,
    'locked_price', COALESCE(b.total_amount, 0) - COALESCE(b.extras_amount, 0),
    'departed_at', to_jsonb(b) ->> 'provider_departed_at',
    'arrived_at', to_jsonb(b) ->> 'arrived_at',
    'started_at', b.started_at,
    'completed_at', b.completed_at,
    'final_bill', b.total_amount,
    'extras', COALESCE((SELECT jsonb_agg(jsonb_build_object('title', x.title, 'amount', x.amount, 'kind', x.kind,
                                                            'status', x.status, 'at', x.created_at) ORDER BY x.created_at)
                        FROM public.booking_extras x WHERE x.booking_id = b.id), '[]'::jsonb)))
  RETURNING id INTO v_id;

  -- Safety issues skip the queue: the pro is suspended at once and the case is escalated.
  IF p_category = 'safety' THEN
    PERFORM set_config('kyc.internal_update', 'true', true);
    UPDATE public.service_providers SET status = 'suspended', is_online = false WHERE id = b.provider_id;
    PERFORM set_config('kyc.internal_update', 'false', true);
  END IF;

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (b.provider_id, 'dispute_opened', 'A customer reported a problem',
            'Reply within 24 hours with your side, photos or notes. An admin decides within 48 hours.',
            jsonb_build_object('booking_id', b.id, 'dispute_id', v_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_booking_dispute(p_dispute_id uuid, p_reply text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
BEGIN
  SELECT x.* INTO d FROM public.booking_disputes x
  JOIN public.service_providers sp ON sp.id = x.provider_id
  WHERE x.id = p_dispute_id AND sp.user_id = auth.uid() FOR UPDATE OF x;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF d.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'closed'); END IF;
  IF d.provider_reply IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_replied'); END IF;
  IF char_length(TRIM(COALESCE(p_reply, ''))) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reply');
  END IF;
  UPDATE public.booking_disputes SET provider_reply = TRIM(p_reply), replied_at = now() WHERE id = p_dispute_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.appeal_booking_dispute(p_dispute_id uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d     record;
  v_who text;
BEGIN
  SELECT * INTO d FROM public.booking_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF d.customer_id = auth.uid() THEN
    v_who := 'customer';
  ELSIF EXISTS (SELECT 1 FROM public.service_providers WHERE id = d.provider_id AND user_id = auth.uid()) THEN
    v_who := 'provider';
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF d.status <> 'decided' OR d.appealed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_appeal');
  END IF;
  IF char_length(TRIM(COALESCE(p_note, ''))) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_note');
  END IF;
  UPDATE public.booking_disputes
  SET status = 'appealed', appealed_by = v_who, appeal_note = TRIM(p_note), appealed_at = now()
  WHERE id = p_dispute_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_dispute(p_dispute_id uuid, p_outcome text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  d       record;
  f       record;
  v_note  text := TRIM(COALESCE(p_note, ''));
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF p_outcome NOT IN ('dismissed','redo','partial_refund','provider_penalty') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown outcome');
  END IF;
  IF char_length(v_note) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please write a reason (min 5 characters)');
  END IF;

  SELECT * INTO d FROM public.booking_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Dispute not found'); END IF;
  IF d.status NOT IN ('open','appealed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute is already decided');
  END IF;

  UPDATE public.booking_disputes SET
    status        = CASE WHEN d.status = 'appealed' THEN 'closed' ELSE 'decided' END,
    outcome       = p_outcome,
    decision_note = v_note,
    decided_by    = v_admin,
    decided_at    = now()
  WHERE id = p_dispute_id;

  -- Disputed and refunded jobs never touch the wallet: give the fee back (once).
  IF p_outcome = 'partial_refund' THEN
    SELECT * INTO f FROM public.booking_fees WHERE booking_id = d.booking_id FOR UPDATE;
    IF FOUND AND f.charged > 0 AND f.refunded = 0 THEN
      PERFORM public.wallet_post(d.provider_id, d.booking_id, 'adjustment', f.charged,
                                 'feerefund:' || d.booking_id::text, NULL, 'Fee returned: dispute refunded', v_admin);
      UPDATE public.booking_fees SET refunded = f.charged WHERE booking_id = d.booking_id;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'booking_dispute_decided', 'booking_dispute', d.id,
          jsonb_build_object('outcome', p_outcome, 'note', v_note, 'booking_id', d.booking_id,
                             'provider_id', d.provider_id, 'appeal', d.status = 'appealed'));

  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (d.customer_id, 'dispute_decided', 'Your report was reviewed',
            'Outcome: ' || replace(p_outcome, '_', ' ') || '. ' || v_note, d.booking_id, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (d.provider_id, 'dispute_decided', 'A dispute was decided',
            'Outcome: ' || replace(p_outcome, '_', ' ') || '. ' || v_note, jsonb_build_object('booking_id', d.booking_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ─── 5. The customer's view of their pro (phone only once confirmed) ────────
CREATE OR REPLACE FUNCTION public.get_booking_provider(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b  record;
  sp record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.customer_id IS DISTINCT FROM auth.uid() OR b.provider_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO sp FROM public.service_providers WHERE id = b.provider_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', sp.id,
    'full_name', COALESCE(sp.full_name, sp.name),
    'avatar_url', to_jsonb(sp) ->> 'avatar_url',
    'rating', sp.rating,
    'total_jobs', sp.total_jobs,
    'phone', CASE WHEN b.status::text IN ('confirmed','on_the_way','arrived','in_progress') THEN to_jsonb(sp) ->> 'phone' END
  );
END;
$$;

-- ─── 6. Admin RPCs ──────────────────────────────────────────────────────────
-- Sets the band and the catalogue price of a service or sub-service (respects the CHECK constraints).
CREATE OR REPLACE FUNCTION public.admin_set_price_band(
  p_service_id uuid, p_sub_item_id uuid, p_base numeric, p_min numeric, p_max numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF p_min IS NULL OR p_max IS NULL OR p_base IS NULL OR p_min <= 0 OR p_min > p_max
     OR p_base < p_min OR p_base > p_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'Need 0 < min <= catalogue price <= max');
  END IF;

  IF p_sub_item_id IS NOT NULL THEN
    EXECUTE 'UPDATE public.service_sub_items SET base_price = $1, price_min = $2, price_max = $3 WHERE id = $4'
      USING p_base, p_min, p_max, p_sub_item_id;
  ELSE
    UPDATE public.services SET base_price = p_base, price_min = p_min, price_max = p_max WHERE id = p_service_id;
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'price_band_set', CASE WHEN p_sub_item_id IS NULL THEN 'service' ELSE 'service_sub_item' END,
          COALESCE(p_sub_item_id, p_service_id),
          jsonb_build_object('base', p_base, 'min', p_min, 'max', p_max));
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_booking_disputes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  RETURN jsonb_build_object('success', true, 'disputes', COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC) FROM (
      SELECT d.*, COALESCE(sp.full_name, sp.name) AS provider_name, b.customer_name,
             s.name AS service_name, b.total_amount
      FROM public.booking_disputes d
      JOIN public.bookings b ON b.id = d.booking_id
      LEFT JOIN public.service_providers sp ON sp.id = d.provider_id
      LEFT JOIN public.services s ON s.id = b.service_id
      ORDER BY d.created_at DESC LIMIT 300) t), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fee_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  RETURN jsonb_build_object('success', true,
    'charged_total',  (SELECT COALESCE(SUM(charged), 0) FROM public.booking_fees),
    'charged_month',  (SELECT COALESCE(SUM(charged), 0) FROM public.booking_fees WHERE created_at >= date_trunc('month', now())),
    'waived_total',   (SELECT COALESCE(SUM(waived), 0) FROM public.booking_fees),
    'refunded_total', (SELECT COALESCE(SUM(refunded), 0) FROM public.booking_fees),
    'jobs',           (SELECT COUNT(*) FROM public.booking_fees),
    'open_disputes',  (SELECT COUNT(*) FROM public.booking_disputes WHERE status IN ('open','appealed')),
    'recent', COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT f.*, COALESCE(sp.full_name, sp.name) AS provider_name
        FROM public.booking_fees f LEFT JOIN public.service_providers sp ON sp.id = f.provider_id
        ORDER BY f.created_at DESC LIMIT 50) t), '[]'::jsonb));
END;
$$;

-- ─── 7. Realtime and permissions ────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['booking_extras','booking_disputes'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.add_booking_extra(uuid,text,numeric,text,text)',
    'public.withdraw_booking_extra(uuid)',
    'public.decide_booking_extra(uuid,boolean)',
    'public.raise_booking_dispute(uuid,text,text)',
    'public.reply_booking_dispute(uuid,text)',
    'public.appeal_booking_dispute(uuid,text)',
    'public.get_booking_provider(uuid)',
    'public.admin_set_price_band(uuid,uuid,numeric,numeric,numeric)',
    'public.admin_decide_dispute(uuid,text,text)',
    'public.admin_list_booking_disputes()',
    'public.admin_fee_overview()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS block_completion_with_pending_extras ON public.bookings;
-- DROP TRIGGER IF EXISTS reset_booking_extras_on_insert ON public.bookings;
-- Re-run the settle_booking_fee() definition from 20261102000001 to put the fee base back to provider_amount.
-- The tables (booking_extras, booking_disputes) and columns are harmless and can stay.
-- ═══════════════════════════════════════════════════════════════════════════
-- DRY RUN: replace the next line with  ROLLBACK;  (nothing is saved)

SELECT 'STEP 1 pricing OK' AS result, (SELECT string_agg(tgname,',') FROM pg_trigger WHERE tgrelid='public.bookings'::regclass AND tgname IN ('enforce_booking_fee','enforce_booking_price')) AS fee_triggers, (SELECT count(*) FROM public.services WHERE base_price IS NULL OR base_price<=0) AS services_without_price, (SELECT count(*) FROM public.provider_services WHERE custom_price<=0) AS bad_pro_rates;

SELECT 'STEP 2 arrived OK' AS result, (SELECT string_agg(e.enumlabel,', ' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname='booking_status') AS statuses;

SELECT 'STEP 3 wallet fee OK' AS result, to_regclass('public.booking_fees') IS NOT NULL AS booking_fees_table, public.fee_for_service_bill(400) AS fee_400, public.fee_for_service_bill(1000) AS fee_1000, public.fee_for_service_bill(2000) AS fee_2000;

SELECT 'STEP 4 extra work + disputes OK' AS result, to_regclass('public.booking_extras') IS NOT NULL AS extras_table, to_regclass('public.booking_disputes') IS NOT NULL AS disputes_table;

ROLLBACK;
