-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Provider account, review, notification and profile integrity (idempotent)
--
-- Holes this closes (found by reading the earlier migrations):
--  1. service_providers INSERT: the "privileged column" trigger only ran on UPDATE, and the INSERT policy only
--     checks user_id. A new provider could insert their own row with kyc_status='approved', status='active',
--     is_verified=true, rating=5 and skip KYC + admin review entirely.
--  2. prevent_privileged_column_update() is SECURITY DEFINER and trusts a session flag; rewritten as an
--     INVOKER trigger that only polices direct client writes (current_user), and now also covers
--     this_month_earnings.
--  3. reviews: INSERT only checked user_id = auth.uid(), so anyone could rate ANY provider/booking.
--  4. provider_notifications: WITH CHECK (true) let any signed-in user write notifications to any provider.
--  5. profiles: "Users can view all profiles" exposed every customer's phone/address to every signed-in user.
--  6. Admin payout handling: payouts could only be created, never settled. Adds admin_process_payout().
--
-- Apply AFTER 20261008000000_financial_integrity.sql. NOT TESTED against a live database: use staging first.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1+2. service_providers guard ───────────────────────────────────────────
DROP TRIGGER IF EXISTS prevent_privileged_column_update ON public.service_providers;
DROP TRIGGER IF EXISTS zz_guard_provider_insert         ON public.service_providers;

CREATE OR REPLACE FUNCTION public.prevent_privileged_column_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only direct client writes are policed. SECURITY DEFINER RPCs, triggers and service_role run as another role.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A client may only create a blank, unapproved provider that belongs to them.
    NEW.status               := 'pending_approval';
    NEW.kyc_status           := 'not_submitted';
    NEW.is_verified          := false;
    NEW.kyc_rejection_reason := NULL;
    NEW.kyc_reviewed_at      := NULL;
    NEW.kyc_reviewed_by      := NULL;
    NEW.rating               := 0;
    NEW.total_reviews        := 0;
    NEW.total_jobs           := 0;
    NEW.total_earnings       := 0;
    NEW.this_month_earnings  := 0;
    NEW.is_online            := false;
    RETURN NEW;
  END IF;

  IF NEW.user_id             IS DISTINCT FROM OLD.user_id             THEN RAISE EXCEPTION 'Cannot change user_id' USING ERRCODE = '42501'; END IF;
  IF NEW.status              IS DISTINCT FROM OLD.status              THEN RAISE EXCEPTION 'Cannot change status directly. Use admin RPC.' USING ERRCODE = '42501'; END IF;
  IF NEW.kyc_status          IS DISTINCT FROM OLD.kyc_status          THEN RAISE EXCEPTION 'Cannot change kyc_status directly. Use submit_kyc() RPC.' USING ERRCODE = '42501'; END IF;
  IF NEW.kyc_rejection_reason IS DISTINCT FROM OLD.kyc_rejection_reason THEN RAISE EXCEPTION 'Cannot change kyc_rejection_reason.' USING ERRCODE = '42501'; END IF;
  IF NEW.kyc_reviewed_at     IS DISTINCT FROM OLD.kyc_reviewed_at     THEN RAISE EXCEPTION 'Cannot change kyc_reviewed_at.' USING ERRCODE = '42501'; END IF;
  IF NEW.kyc_reviewed_by     IS DISTINCT FROM OLD.kyc_reviewed_by     THEN RAISE EXCEPTION 'Cannot change kyc_reviewed_by.' USING ERRCODE = '42501'; END IF;
  IF NEW.is_verified         IS DISTINCT FROM OLD.is_verified         THEN RAISE EXCEPTION 'Cannot change is_verified.' USING ERRCODE = '42501'; END IF;
  IF NEW.rating              IS DISTINCT FROM OLD.rating              THEN RAISE EXCEPTION 'Cannot change rating directly.' USING ERRCODE = '42501'; END IF;
  IF NEW.total_jobs          IS DISTINCT FROM OLD.total_jobs          THEN RAISE EXCEPTION 'Cannot change total_jobs directly.' USING ERRCODE = '42501'; END IF;
  IF NEW.total_reviews       IS DISTINCT FROM OLD.total_reviews       THEN RAISE EXCEPTION 'Cannot change total_reviews directly.' USING ERRCODE = '42501'; END IF;
  IF NEW.total_earnings      IS DISTINCT FROM OLD.total_earnings      THEN RAISE EXCEPTION 'Cannot change total_earnings directly.' USING ERRCODE = '42501'; END IF;
  IF NEW.this_month_earnings IS DISTINCT FROM OLD.this_month_earnings THEN RAISE EXCEPTION 'Cannot change this_month_earnings directly.' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_privileged_column_update
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_column_update();

-- ─── 3. reviews: only the customer of a completed booking, for that booking's provider ──────────
DROP POLICY IF EXISTS "reviews_only_for_own_completed_booking" ON public.reviews;
CREATE POLICY "reviews_only_for_own_completed_booking" ON public.reviews
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    rating BETWEEN 1 AND 5
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id
        AND b.status = 'completed'
        AND b.provider_id = reviews.provider_id
        AND auth.uid()::text IN (COALESCE(to_jsonb(b)->>'user_id', ''), COALESCE(to_jsonb(b)->>'customer_id', ''))
    )
  );

-- ─── 4. provider_notifications: no more "anyone can notify any provider" ────────────────────────
-- Triggers and RPCs that write notifications are SECURITY DEFINER and are unaffected.
DROP POLICY IF EXISTS "System inserts provider notifications" ON public.provider_notifications;

-- ─── 5. profiles: owner (and admin) only ────────────────────────────────────────────────────────
-- The apps only ever read the signed-in user's own profile (customer-app: .eq("user_id", user.id)).
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"         ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─── 6. Admin payouts ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_earnings
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.payout_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_provider_earnings_payout_id ON public.provider_earnings(payout_id);

-- request_payout() now links the earnings it claims to the payout, so settling is exact.
CREATE OR REPLACE FUNCTION public.request_payout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min     constant numeric := 1;
  v_p       record;
  v_amount  numeric;
  v_ids     uuid[];
  v_payout  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;

  SELECT * INTO v_p FROM public.service_providers WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_p.kyc_status <> 'approved' OR v_p.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_approved'); END IF;
  IF COALESCE(v_p.bank_account_number, '') = '' AND COALESCE(v_p.upi_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_destination');
  END IF;

  SELECT COALESCE(SUM(provider_amount), 0), COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_amount, v_ids
  FROM public.provider_earnings WHERE provider_id = v_p.id AND status = 'pending';

  IF v_amount < v_min THEN RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_withdraw'); END IF;

  INSERT INTO public.payout_requests
    (provider_id, amount, bank_account_name, bank_account_number, bank_ifsc, upi_id, status)
  VALUES
    (v_p.id, v_amount, v_p.bank_account_name, v_p.bank_account_number, v_p.bank_ifsc, v_p.upi_id, 'pending')
  RETURNING id INTO v_payout;

  UPDATE public.provider_earnings SET status = 'processing', payout_id = v_payout WHERE id = ANY(v_ids);

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (v_p.id, 'payment', 'Withdrawal requested',
          '₹' || to_char(v_amount, 'FM99,99,999.00') || ' withdrawal submitted. Funds arrive in 1-2 business days.',
          jsonb_build_object('payout_id', v_payout));

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'payout_id', v_payout);
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout() TO authenticated;

-- Admin settles a payout: pending -> processing -> paid, or -> failed (earnings return to the provider's balance).
CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_action text, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin  uuid := auth.uid();
  v_row    record;
  v_new    text;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;
  IF p_action NOT IN ('processing', 'paid', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Payout not found'); END IF;

  IF NOT (
       (v_row.status = 'pending'    AND p_action IN ('processing', 'paid', 'failed'))
    OR (v_row.status = 'processing' AND p_action IN ('paid', 'failed'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout is already ' || v_row.status);
  END IF;

  v_new := p_action;
  UPDATE public.payout_requests
     SET status = v_new, notes = COALESCE(p_notes, notes),
         processed_at = CASE WHEN v_new IN ('paid', 'failed') THEN now() ELSE processed_at END
   WHERE id = p_payout_id;

  IF v_new = 'paid' THEN
    UPDATE public.provider_earnings SET status = 'paid' WHERE payout_id = p_payout_id;
  ELSIF v_new = 'failed' THEN
    UPDATE public.provider_earnings SET status = 'pending', payout_id = NULL WHERE payout_id = p_payout_id;
  END IF;

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (v_row.provider_id, 'payment',
          CASE v_new WHEN 'paid' THEN 'Payout sent' WHEN 'failed' THEN 'Payout failed' ELSE 'Payout in progress' END,
          CASE v_new WHEN 'paid' THEN '₹' || to_char(v_row.amount, 'FM99,99,999.00') || ' has been sent to you.'
                     WHEN 'failed' THEN 'Your withdrawal could not be completed. The money is back in your balance.' || COALESCE(' Reason: ' || p_notes, '')
                     ELSE 'We are processing your withdrawal.' END,
          jsonb_build_object('payout_id', p_payout_id));

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'payout_' || v_new, 'payout_request', p_payout_id,
          jsonb_build_object('amount', v_row.amount, 'notes', p_notes));

  RETURN jsonb_build_object('success', true, 'status', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;

-- Admins need to read payouts to settle them.
DROP POLICY IF EXISTS "admin_select_payouts" ON public.payout_requests;
CREATE POLICY "admin_select_payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
