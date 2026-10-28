-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
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

SELECT 'STEP 3 wallet fee OK' AS result, to_regclass('public.booking_fees') IS NOT NULL AS booking_fees_table, public.fee_for_service_bill(400) AS fee_400, public.fee_for_service_bill(1000) AS fee_1000, public.fee_for_service_bill(2000) AS fee_2000;

ROLLBACK;
