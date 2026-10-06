-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Razorpay payments (idempotent, safe to re-run)
--
-- What this does
--  1. Server-side pricing. bookings.total_amount / platform_fee / provider_amount used to come from the
--     browser (even from a ?sub_price= URL parameter). Anyone could book a ₹2000 job for ₹1 and the
--     provider would be paid 80% of that ₹1. A BEFORE INSERT trigger now recomputes the price from
--     services / service_sub_items and forces payment_status = 'unpaid'.
--  2. payments table: one row per Razorpay order. Clients can READ their own rows, never write.
--  3. razorpay_events: audit log of webhook deliveries.
--  4. record_payment_captured / record_payment_refunded: the ONLY way a booking becomes 'paid'.
--     Callable by service_role (the Edge Functions) only. Idempotent: replays are harmless.
--  5. provider_earnings.payable: a provider can only withdraw money the customer has actually paid.
--     Rows that existed before this migration are marked payable (they pre-date online payment).
--  6. Earnings now use provider_amount / platform_fee from the booking (what the provider app already
--     displays) instead of a hard-coded 80/20 of the total, which paid providers 89.6% of what the app
--     promised them. BUSINESS DECISION: provider gets 100% of the service charge; the platform keeps the
--     12% fee the customer pays on top. Edit the CASE below if you want something else.
--
-- Apply AFTER 20261010000000_provider_self_service.sql. Run on staging first.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Server-side pricing ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge numeric;
  v_fee    numeric;
BEGIN
  IF NEW.sub_item_id IS NOT NULL THEN
    SELECT base_price INTO v_charge
      FROM public.service_sub_items
     WHERE id = NEW.sub_item_id AND service_id = NEW.service_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown service option' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT base_price INTO v_charge FROM public.services WHERE id = NEW.service_id;
  END IF;

  IF v_charge IS NULL OR v_charge <= 0 THEN
    RAISE EXCEPTION 'This service has no price set' USING ERRCODE = '22023';
  END IF;

  v_fee := ROUND(v_charge * 0.12);
  NEW.provider_amount := v_charge;
  NEW.platform_fee    := v_fee;
  NEW.total_amount    := v_charge + v_fee;
  NEW.final_amount    := NEW.total_amount;
  NEW.coupon_code     := NULL;      -- no coupon feature yet: never trust a client-sent discount
  NEW.coupon_discount := 0;
  NEW.payment_status  := 'unpaid';  -- a client can never insert an already-paid booking
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_price ON public.bookings;
CREATE TRIGGER trg_enforce_booking_price
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_price();

-- ─── 2. payments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  customer_id         uuid NOT NULL,   -- no FK on purpose: financial records outlive a deleted account
  provider_id         uuid,
  razorpay_order_id   text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount_paise        integer NOT NULL CHECK (amount_paise > 0),
  currency            text NOT NULL DEFAULT 'INR',
  status              text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'refunded')),
  method              text,
  failure_reason      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz,
  refunded_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
-- At most ONE successful payment per booking, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paid_per_booking
  ON public.payments(booking_id) WHERE status = 'paid';

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_read_own_payments" ON public.payments;
CREATE POLICY "customers_read_own_payments" ON public.payments
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
REVOKE ALL ON public.payments FROM anon, authenticated;
GRANT SELECT ON public.payments TO authenticated;

-- ─── 3. webhook audit log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.razorpay_events (
  event_id    text PRIMARY KEY,
  event       text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.razorpay_events ENABLE ROW LEVEL SECURITY;   -- no policies: service_role only
REVOKE ALL ON public.razorpay_events FROM anon, authenticated;

-- ─── 4. provider_earnings.payable ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'provider_earnings' AND column_name = 'payable') THEN
    ALTER TABLE public.provider_earnings ADD COLUMN payable boolean NOT NULL DEFAULT false;
    UPDATE public.provider_earnings SET payable = true;  -- earned before online payment existed
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_create_provider_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_split boolean;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' AND NEW.provider_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.provider_earnings WHERE booking_id = NEW.id) THEN
      v_has_split := COALESCE(NEW.provider_amount, 0) > 0;
      INSERT INTO public.provider_earnings (provider_id, booking_id, provider_amount, platform_fee, status, payable)
      VALUES (
        NEW.provider_id,
        NEW.id,
        CASE WHEN v_has_split THEN NEW.provider_amount ELSE ROUND(COALESCE(NEW.total_amount, 0) * 0.80, 2) END,
        CASE WHEN v_has_split THEN COALESCE(NEW.platform_fee, 0) ELSE ROUND(COALESCE(NEW.total_amount, 0) * 0.20, 2) END,
        'pending',
        COALESCE(NEW.payment_status, 'unpaid') = 'paid'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 5. Payment state changes (service_role only) ──────────────────────────
CREATE OR REPLACE FUNCTION public.record_payment_captured(
  p_order_id text, p_payment_id text, p_amount_paise integer, p_method text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments%ROWTYPE;
  v_prov uuid;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE razorpay_order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_order');
  END IF;

  IF v_pay.status = 'paid' THEN
    IF v_pay.razorpay_payment_id = p_payment_id THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
    -- A second, different payment landed on an already-paid order: the customer was charged twice.
    RETURN jsonb_build_object('ok', false, 'reason', 'double_payment');
  END IF;
  IF v_pay.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_refunded');
  END IF;

  IF p_amount_paise IS DISTINCT FROM v_pay.amount_paise THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_pay.booking_id AND status = 'paid') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'booking_already_paid');
  END IF;

  UPDATE public.payments
     SET status = 'paid', razorpay_payment_id = p_payment_id, method = p_method,
         paid_at = now(), failure_reason = NULL, updated_at = now()
   WHERE id = v_pay.id;

  UPDATE public.bookings SET payment_status = 'paid', updated_at = now() WHERE id = v_pay.booking_id;
  UPDATE public.provider_earnings SET payable = true WHERE booking_id = v_pay.booking_id;

  v_prov := v_pay.provider_id;
  IF v_prov IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (v_prov, 'payment', 'Payment received',
            'The customer has paid for a completed job. Your earnings are ready to withdraw.',
            jsonb_build_object('booking_id', v_pay.booking_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_pay.booking_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_failed(p_order_id text, p_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- The order stays open so the customer can retry; we only remember why the last attempt failed.
  UPDATE public.payments
     SET failure_reason = LEFT(COALESCE(p_reason, 'failed'), 300), updated_at = now()
   WHERE razorpay_order_id = p_order_id AND status = 'created';
$$;

CREATE OR REPLACE FUNCTION public.record_payment_refunded(p_payment_id text, p_refund_paise integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay    public.payments%ROWTYPE;
  v_locked integer;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE razorpay_payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_payment');
  END IF;
  IF v_pay.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  IF p_refund_paise < v_pay.amount_paise THEN
    RETURN jsonb_build_object('ok', true, 'partial', true);   -- partial refunds are handled by hand
  END IF;

  UPDATE public.payments SET status = 'refunded', refunded_at = now(), updated_at = now() WHERE id = v_pay.id;
  UPDATE public.bookings SET payment_status = 'refunded', updated_at = now() WHERE id = v_pay.booking_id;

  -- Pull the money back out of the provider's withdrawable balance if it has not been claimed yet.
  UPDATE public.provider_earnings SET payable = false
   WHERE booking_id = v_pay.booking_id AND status = 'pending';
  SELECT COUNT(*) INTO v_locked FROM public.provider_earnings
   WHERE booking_id = v_pay.booking_id AND status <> 'pending';

  RETURN jsonb_build_object('ok', true, 'needs_manual_review', v_locked > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_captured(text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_failed(text, text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_refunded(text, integer)              FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_captured(text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_failed(text, text)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_refunded(text, integer)              TO service_role;

-- ─── 6. Withdraw only what the customer has paid ───────────────────────────
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
  FROM public.provider_earnings
  WHERE provider_id = v_p.id AND status = 'pending' AND payable;

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
