-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Financial integrity + booking guard (idempotent, safe to re-run)
--
-- Holes this closes (found by reading the earlier migrations):
--  A. provider_earnings: INSERT policy WITH CHECK (true) let ANY role add earnings rows, and providers
--     could UPDATE any column (amount, status='paid') on their own rows.
--  B. payout_requests: providers had FOR ALL, so they could insert any amount, mark it 'paid', or delete it.
--  C. bookings: providers could UPDATE any column (total_amount, provider_id, status).
--  D. block_direct_completion() never blocked anything: it is SECURITY DEFINER, so
--     pg_has_role('postgres','MEMBER') is always true. A provider could set status='completed' directly
--     and skip the customer's completion code, then collect 80% of an amount they could also edit.
--
-- Apply AFTER all earlier migrations. Deploy the updated provider-app in the same release
-- (Earnings now calls request_payout()).
-- NOT TESTED against a live database: run on a staging project first (checklist in PHASE13-CHANGES.md).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Earnings & payouts: read-only for clients ───────────────────────────
DROP POLICY IF EXISTS "Providers update own earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "System can insert earnings"    ON public.provider_earnings;
REVOKE INSERT, UPDATE, DELETE ON public.provider_earnings FROM anon, authenticated;

DROP POLICY IF EXISTS "Providers manage own payouts" ON public.payout_requests;
DROP POLICY IF EXISTS "providers_own_payouts"        ON public.payout_requests;
DROP POLICY IF EXISTS "providers_read_own_payouts"   ON public.payout_requests;
CREATE POLICY "providers_read_own_payouts" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.payout_requests FROM anon, authenticated;
-- The earnings trigger, request_payout() and admin RPCs are SECURITY DEFINER, so they keep working.

-- ─── 2. request_payout(): the only way to withdraw ──────────────────────────
CREATE OR REPLACE FUNCTION public.request_payout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min     constant numeric := 1;          -- raise to set a minimum withdrawal
  v_p       record;
  v_amount  numeric;
  v_ids     uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- Lock the provider row so two taps / two devices serialize; the second one finds nothing pending.
  SELECT * INTO v_p FROM public.service_providers WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF v_p.kyc_status <> 'approved' OR v_p.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved');
  END IF;
  IF COALESCE(v_p.bank_account_number, '') = '' AND COALESCE(v_p.upi_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_destination');
  END IF;

  SELECT COALESCE(SUM(provider_amount), 0), COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_amount, v_ids
  FROM public.provider_earnings
  WHERE provider_id = v_p.id AND status = 'pending';

  IF v_amount < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_withdraw');
  END IF;

  INSERT INTO public.payout_requests
    (provider_id, amount, bank_account_name, bank_account_number, bank_ifsc, upi_id, status)
  VALUES
    (v_p.id, v_amount, v_p.bank_account_name, v_p.bank_account_number, v_p.bank_ifsc, v_p.upi_id, 'pending');

  UPDATE public.provider_earnings SET status = 'processing' WHERE id = ANY(v_ids);

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (v_p.id, 'payment', 'Withdrawal requested',
          '₹' || to_char(v_amount, 'FM99,99,999.00') || ' withdrawal submitted. Funds arrive in 1-2 business days.', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'amount', v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout() TO authenticated;

-- ─── 3. Booking guard: who may change what ──────────────────────────────────
-- SECURITY INVOKER on purpose: current_user is 'authenticated' for a direct client write, and the
-- function owner/service_role inside SECURITY DEFINER RPCs, triggers and Edge Functions (which pass).
DROP TRIGGER IF EXISTS trg_block_direct_completion ON public.bookings;
DROP TRIGGER IF EXISTS zz_guard_booking_update     ON public.bookings;

CREATE OR REPLACE FUNCTION public.guard_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_is_provider boolean;
  v_is_customer boolean;
  v_changed     text[];
  v_allowed     text[];
  v_chat        constant text[] := ARRAY['unread_messages_provider','unread_messages_customer','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(COALESCE(n.key, o.key)), ARRAY[]::text[]) INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n
  FULL JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
  WHERE n.value IS DISTINCT FROM o.value;

  IF cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  v_is_provider := v_uid IS NOT NULL AND OLD.provider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.service_providers sp WHERE sp.id = OLD.provider_id AND sp.user_id = v_uid);
  v_is_customer := v_uid IS NOT NULL AND v_uid::text IN (
    COALESCE(to_jsonb(OLD)->>'user_id', ''), COALESCE(to_jsonb(OLD)->>'customer_id', ''));

  -- Provider: trip + accept/decline columns only, valid transitions only, never 'completed'.
  IF v_is_provider THEN
    v_allowed := v_chat || ARRAY['status','started_at','provider_departed_at','provider_eta_minutes','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Providers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'pending'     AND NEW.status IN ('confirmed','cancelled'))
      OR (OLD.status = 'confirmed'   AND NEW.status IN ('on_the_way','in_progress','cancelled'))
      OR (OLD.status = 'on_the_way'  AND NEW.status IN ('in_progress','cancelled'))
      OR (OLD.status = 'in_progress' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid status change % -> % (completion requires the customer code)', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Customer: cancel while pending/confirmed, plus chat counters.
  IF v_is_customer THEN
    v_allowed := v_chat || ARRAY['status','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Customers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         OLD.status IN ('pending','confirmed') AND NEW.status = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Customers can only cancel a pending or confirmed booking' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to update this booking' USING ERRCODE = '42501';
END;
$$;

-- zz_ prefix: fires after other BEFORE triggers (e.g. updated_at) so it sees the final row.
CREATE TRIGGER zz_guard_booking_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_update();

-- ─── 4. Requests nobody answers ─────────────────────────────────────────────
-- Cancels pending bookings older than p_minutes. Called by pg_cron (below) and never by clients.
CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings(p_minutes int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled', cancelled_at = now(),
         cancellation_reason = 'No pro accepted in time', updated_at = now()
   WHERE status = 'pending' AND created_at < now() - make_interval(mins => p_minutes);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_stale_pending_bookings(int) FROM PUBLIC, anon, authenticated;

-- Fallback that needs no cron: the customer's own screen can expire its own stale request.
CREATE OR REPLACE FUNCTION public.expire_my_pending_booking(p_booking_id uuid, p_minutes int DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled', cancelled_at = now(),
         cancellation_reason = 'No pro accepted in time', updated_at = now()
   WHERE id = p_booking_id AND status = 'pending'
     AND created_at < now() - make_interval(mins => p_minutes)
     AND auth.uid()::text IN (COALESCE(to_jsonb(bookings)->>'user_id', ''), COALESCE(to_jsonb(bookings)->>'customer_id', ''));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_my_pending_booking(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_my_pending_booking(uuid, int) TO authenticated;

-- Schedule every minute when pg_cron is available (Supabase: Database > Extensions). Skipped otherwise.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-stale-bookings';
  PERFORM cron.schedule('expire-stale-bookings', '* * * * *', 'SELECT public.expire_stale_pending_bookings(30)');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%). The customer-side fallback still expires stale requests.', SQLERRM;
END $$;
