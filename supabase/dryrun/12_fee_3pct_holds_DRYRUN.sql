-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
-- Note: cron.schedule inside a rolled-back transaction is rolled back too.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
-- SUPERSEDES the fee part of 20261102000001_provider_wallet_fee (applied 2026-10-28; never edit it).
--
-- Owner decision 2026-10-29:
--   * Pro fee per COMPLETED job = 3% of the service bill (parts excluded), rounded to the nearest rupee,
--     minimum ₹5, maximum ₹50 (replaces ₹15/₹30/₹50). Launch waiver unchanged (3 months or 10 jobs).
--   * No dues: accepting HOLDS the fee from the spendable balance; accept is refused when it cannot be held.
--   * Cancelled, declined, missed or no-show jobs cost ₹0 (the hold is released).
--   * A job left in progress for 24 h with no dispute is completed automatically and the fee is charged.
--
-- What this does
--   1. fee_for_service_bill(): 3%, min 5, max 50 (same rounding as packages/shared feeForServiceBill;
--      packages/shared/src/money/fee-sql.test.ts keeps them equal).
--   2. New table wallet_holds (one row per booking = idempotency key "hold:<booking>"). The ledger stays
--      untouched: a hold is not money moved, it only lowers what can be spent or withdrawn.
--   3. enforce_wallet_before_accept (existing trigger, pending -> confirmed): refuses with a readable P0001
--      message when old dues exist or spendable < fee, otherwise records the hold. Launch period: no hold.
--   4. release_wallet_hold (new AFTER trigger): cancel/decline/expiry or a pro change releases the hold; any
--      completion (code, admin or auto-close) settles the fee through settle_booking_fee.
--   5. settle_booking_fee: fee on the FINAL bill, taken from the hold first, then the spendable balance; the
--      rest of the hold is released. With a hold it never creates dues: anything left over is recorded as
--      booking_fees.uncollected (at most ₹45: only when approved extras raised the fee past hold + balance).
--      Bookings accepted before this proposal (no hold) are charged as before.
--   6. get_wallet_summary: adds "held"; "available" = balance - held. request_payout cannot withdraw held money.
--   7. auto_complete_stale_jobs() every 15 minutes via pg_cron: in_progress for 24 h, started AFTER this
--      proposal (wallet_settings.auto_close_since), no dispute, no extra work waiting. The 7 bookings already
--      stuck in progress are NOT touched (owner decision); verify/09 lists them for the admin.
--   8. Old dues stay (owner decision): a pro who owes money must recharge before accepting.
--   9. Drops the unused 12% enforce_booking_fee function; provider_block_reason stays NULL (no dues limit).
--
-- Safe to re-run. Rollback is at the bottom. Check afterwards with supabase/verify/09_wallet_holds_READONLY.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. The fee ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_for_service_bill(p_bill numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_bill IS NULL OR p_bill <= 0 THEN 0
    ELSE LEAST(50, GREATEST(5, round(p_bill * 0.03)))
  END::numeric;
$$;

-- Smallest recharge pack (₹49 / ₹99 / ₹199) that covers p_need, else the biggest. Same as packFor() in the app.
CREATE OR REPLACE FUNCTION public.recharge_pack_for(p_need numeric)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_need <= 49 THEN 49 WHEN p_need <= 99 THEN 99 ELSE 199 END;
$$;

-- 2. Holds --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_holds (
  booking_id  uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  status      text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'charged', 'released')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  settled_at  timestamptz
);
CREATE INDEX IF NOT EXISTS wallet_holds_open_idx ON public.wallet_holds (provider_id) WHERE status = 'held';

ALTER TABLE public.wallet_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_holds_own_read ON public.wallet_holds;
CREATE POLICY wallet_holds_own_read ON public.wallet_holds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_id AND sp.user_id = auth.uid()));
GRANT SELECT ON public.wallet_holds TO authenticated;   -- writes only through the functions below

CREATE OR REPLACE FUNCTION public.wallet_held(p_provider_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.wallet_holds WHERE provider_id = p_provider_id AND status = 'held';
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_held(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.booking_fees ADD COLUMN IF NOT EXISTS uncollected numeric NOT NULL DEFAULT 0;
ALTER TABLE public.booking_fees ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;
ALTER TABLE public.wallet_settings ADD COLUMN IF NOT EXISTS auto_close_since timestamptz;
UPDATE public.wallet_settings SET auto_close_since = now() WHERE auto_close_since IS NULL;

-- 3. Accept: check and hold ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_wallet_before_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fee       numeric;
  v_balance   numeric;
  v_spendable numeric;
BEGIN
  IF NEW.provider_id IS NULL OR OLD.status::text <> 'pending' OR NEW.status::text <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF public.provider_launch_active(NEW.provider_id) THEN RETURN NEW; END IF;   -- launch: no check, no hold

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || NEW.provider_id::text));
  v_fee := public.fee_for_service_bill(GREATEST(0, COALESCE(NEW.provider_amount, 0) - COALESCE(NEW.parts_amount, 0)));
  IF v_fee <= 0 THEN RETURN NEW; END IF;

  v_balance   := public.wallet_balance(NEW.provider_id);                  -- negative = old dues
  v_spendable := v_balance - public.wallet_held(NEW.provider_id);

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Recharge ₹% to clear ₹% you owe and accept new jobs.',
      public.recharge_pack_for(v_fee - v_balance), round(-v_balance) USING ERRCODE = 'P0001';
  END IF;
  IF v_spendable < v_fee THEN
    RAISE EXCEPTION 'Recharge ₹% to accept. Your wallet is below the ₹% fee.',
      public.recharge_pack_for(v_fee - v_spendable), round(v_fee) USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.wallet_holds (booking_id, provider_id, amount)
  VALUES (NEW.id, NEW.provider_id, v_fee)
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$$;
-- The trigger itself already exists (BEFORE UPDATE OF status); recreate it in case it was dropped.
DROP TRIGGER IF EXISTS enforce_wallet_before_accept ON public.bookings;
CREATE TRIGGER enforce_wallet_before_accept
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_before_accept();

-- 5. Completion: charge the final fee ------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_booking_fee(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b           record;
  v_bill      numeric;
  v_fee       numeric;
  v_waive     boolean;
  v_hold      numeric;
  v_from_hold numeric := 0;
  v_from_bal  numeric := 0;
  v_charged   numeric := 0;
  v_unc       numeric := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_fees WHERE booking_id = p_booking_id) THEN RETURN; END IF;

  SELECT id, provider_id, status, provider_amount, parts_amount INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.provider_id IS NULL OR b.status::text <> 'completed' THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || b.provider_id::text));
  v_bill  := GREATEST(0, COALESCE(b.provider_amount, 0) - COALESCE(b.parts_amount, 0));   -- parts excluded
  v_fee   := public.fee_for_service_bill(v_bill);
  v_waive := public.provider_launch_active(b.provider_id, p_booking_id);
  SELECT amount INTO v_hold FROM public.wallet_holds WHERE booking_id = p_booking_id AND status = 'held' FOR UPDATE;
  v_hold := COALESCE(v_hold, 0);

  IF v_fee > 0 AND NOT v_waive THEN
    IF v_hold > 0 THEN
      v_from_hold := LEAST(v_fee, v_hold);
      -- What else can be spent: the whole balance minus every hold (this one included).
      v_from_bal  := LEAST(v_fee - v_from_hold,
                           GREATEST(0, public.wallet_balance(b.provider_id) - public.wallet_held(b.provider_id)));
      v_charged   := v_from_hold + v_from_bal;
      v_unc       := v_fee - v_charged;
    ELSE
      v_charged := v_fee;     -- accepted before holds existed: charged as before (may go below zero)
    END IF;
    IF v_charged > 0 THEN
      PERFORM public.wallet_post(b.provider_id, b.id, 'cash_fee', -v_charged, 'fee:' || b.id::text, NULL,
                                 'HandyFix fee (3%) for completed job', NULL);
    END IF;
  END IF;

  UPDATE public.wallet_holds
  SET status = CASE WHEN v_from_hold > 0 THEN 'charged' ELSE 'released' END, settled_at = now()
  WHERE booking_id = p_booking_id AND status = 'held';

  INSERT INTO public.booking_fees (booking_id, provider_id, service_bill, slab_fee, charged, waived, uncollected)
  VALUES (b.id, b.provider_id, v_bill, v_fee, v_charged, CASE WHEN v_waive THEN v_fee ELSE 0 END, v_unc)
  ON CONFLICT (booking_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.settle_booking_fee(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Release on cancel / decline / expiry; settle on any completion -------------
CREATE OR REPLACE FUNCTION public.release_wallet_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'completed' AND OLD.status::text <> 'completed' THEN
    PERFORM public.settle_booking_fee(NEW.id);     -- idempotent: complete_booking_with_code calls it again
    RETURN NULL;
  END IF;
  IF NEW.status::text IN ('confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed')
     AND NEW.provider_id IS NOT DISTINCT FROM OLD.provider_id THEN
    RETURN NULL;
  END IF;
  UPDATE public.wallet_holds SET status = 'released', settled_at = now()
  WHERE booking_id = NEW.id AND status = 'held';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS release_wallet_hold ON public.bookings;
CREATE TRIGGER release_wallet_hold
  AFTER UPDATE OF status, provider_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_wallet_hold();

-- 6. Wallet summary and payouts respect holds ----------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid       uuid;
  s           record;
  v_bal       numeric;
  v_held      numeric;
  v_reason    text;
  v_unsettled integer;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_provider');
  END IF;

  SELECT * INTO s FROM public.wallet_settings WHERE id = true;
  v_bal    := public.wallet_balance(v_pid);
  v_held   := public.wallet_held(v_pid);
  v_reason := public.provider_block_reason(v_pid);

  SELECT COUNT(*) INTO v_unsettled
  FROM public.bookings b
  WHERE b.provider_id = v_pid
    AND b.status::text = 'completed'
    AND COALESCE(b.total_amount, 0) > 0
    AND b.completed_at >= s.live_since
    AND NOT EXISTS (SELECT 1 FROM public.booking_payments bp WHERE bp.booking_id = b.id AND bp.status = 'paid');

  RETURN jsonb_build_object(
    'ok', true,
    'provider_id', v_pid,
    'balance', v_bal,
    'held', v_held,
    'dues', GREATEST(0, -v_bal),
    'available', GREATEST(0, v_bal - v_held),
    'dues_limit', s.dues_limit,
    'min_payout', s.min_payout,
    'fee_rate', 0.03,
    'live_since', s.live_since,
    'blocked', v_reason IS NOT NULL,
    'block_reason', v_reason,
    'unsettled_jobs', v_unsettled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sp     record;
  s      record;
  v_amt  numeric;
  v_id   uuid;
  v_on_hold numeric := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  v_amt := ROUND(p_amount, 2);

  SELECT * INTO sp FROM public.service_providers WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF sp.kyc_status IS DISTINCT FROM 'approved' OR sp.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved');
  END IF;
  IF COALESCE(sp.bank_account_number, '') = '' AND COALESCE(sp.upi_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_payout_details');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || sp.id::text));

  SELECT * INTO s FROM public.wallet_settings WHERE id = true;
  IF v_amt < s.min_payout THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum', 'min_payout', s.min_payout);
  END IF;
  -- Money held for accepted jobs cannot be withdrawn, nor online earnings still on hold (20261123, if applied).
  IF to_regprocedure('public.wallet_on_hold(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.wallet_on_hold($1)' INTO v_on_hold USING sp.id;
  END IF;
  IF v_amt > public.wallet_balance(sp.id) - public.wallet_held(sp.id) - COALESCE(v_on_hold, 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance');
  END IF;

  INSERT INTO public.payout_requests
    (provider_id, amount, bank_account_name, bank_account_number, bank_ifsc, upi_id, status)
  VALUES
    (sp.id, v_amt, sp.bank_account_name, sp.bank_account_number, sp.bank_ifsc, sp.upi_id, 'pending')
  RETURNING id INTO v_id;

  PERFORM public.wallet_post(sp.id, NULL, 'payout', -v_amt, 'payout:' || v_id::text, NULL,
                             'Withdrawal request');

  RETURN jsonb_build_object('ok', true, 'payout_id', v_id, 'amount', v_amt);
END;
$$;

-- 7. Auto-close after 24 h in progress -----------------------------------------
CREATE OR REPLACE FUNCTION public.auto_complete_stale_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r     record;
  v_n   integer := 0;
BEGIN
  FOR r IN
    SELECT b.id
    FROM public.bookings b
    JOIN public.wallet_settings s ON s.id = true
    WHERE b.status::text = 'in_progress'
      AND b.started_at IS NOT NULL
      AND b.started_at >= s.auto_close_since                -- only jobs started after this proposal
      AND b.started_at < now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.booking_disputes d WHERE d.booking_id = b.id)
      AND NOT EXISTS (SELECT 1 FROM public.booking_extras e WHERE e.booking_id = b.id AND e.status = 'pending')
  LOOP
    BEGIN
      PERFORM set_config('handyfix.completing', 'true', true);
      UPDATE public.bookings SET status = 'completed', completed_at = now(), updated_at = now()
      WHERE id = r.id AND status::text = 'in_progress';
      PERFORM set_config('handyfix.completing', 'false', true);
      PERFORM public.settle_booking_fee(r.id);
      UPDATE public.booking_fees SET auto_closed = true WHERE booking_id = r.id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('handyfix.completing', 'false', true);
      RAISE WARNING 'auto_complete_stale_jobs: booking % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.auto_complete_stale_jobs() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('auto-complete-stale-jobs', '*/15 * * * *', 'SELECT public.auto_complete_stale_jobs()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed: schedule SELECT public.auto_complete_stale_jobs() every 15 minutes another way.';
  END IF;
END
$cron$;

-- 9. Old pieces -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_block_reason(p_provider_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::text;   -- no dues limit: the accept trigger is the only gate
$$;
DROP TRIGGER IF EXISTS enforce_booking_fee ON public.bookings;
DROP FUNCTION IF EXISTS public.enforce_booking_fee();   -- the 12% customer fee; no trigger uses it any more

-- ─── ROLLBACK ───
-- SELECT cron.unschedule('auto-complete-stale-jobs');
-- DROP TRIGGER IF EXISTS release_wallet_hold ON public.bookings;
-- DROP FUNCTION IF EXISTS public.release_wallet_hold();
-- DROP FUNCTION IF EXISTS public.auto_complete_stale_jobs();
-- Re-run the fee_for_service_bill, enforce_wallet_before_accept, settle_booking_fee, get_wallet_summary and
-- request_payout definitions from 20261102000001_provider_wallet_fee (applied 2026-10-28) to restore the slabs.
-- Then: DROP FUNCTION IF EXISTS public.wallet_held(uuid); DROP FUNCTION IF EXISTS public.recharge_pack_for(numeric);
--       DROP TABLE IF EXISTS public.wallet_holds;
-- The added columns (booking_fees.uncollected/auto_closed, wallet_settings.auto_close_since) are harmless to keep.
-- enforce_booking_fee (12%) is intentionally not restored.

-- ─── CHECK ───
SELECT fee_for_service_bill(400) AS fee_on_400_should_be_12, to_regclass('public.wallet_holds') AS holds_table,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass AND tgname IN ('enforce_wallet_before_accept','release_wallet_hold')) AS triggers_should_be_2;
ROLLBACK;
