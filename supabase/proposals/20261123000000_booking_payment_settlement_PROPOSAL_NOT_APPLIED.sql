-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Payments Section 2 (owner decision 2026-10-30): when a customer's online booking payment succeeds, record it exactly
-- once and credit the pro's wallet; reverse the right share on a refund.
--
-- NEEDS 20261122000000 (booking_payment_orders, bookings.payment_method) applied first.
-- Works WITHOUT 20261114000000 (3% fee, holds): it uses whatever fee_for_service_bill and provider_launch_active are
-- live, and releases a wallet_hold only if that table exists. Applying 20261114000000 later is safe in either order
-- (both request_payout versions subtract the on-hold earnings and the holds when they exist).
--
-- Rules (packages/shared booking/payment-ledger.ts, same numbers):
--   * One credit per razorpay_payment_id, only when the paid amount equals booking_payment_orders.amount_paise.
--     A mismatch is returned as 'amount_mismatch' (the webhook logs it) and never credited.
--   * In one transaction, booking and order rows locked: order + booking marked paid (payment_method 'online');
--     earning credit to the pro = everything the customer paid (type online_credit, key 'bkpay:<payment>'), ON HOLD
--     until completion + wallet_settings.earning_hold_hours (new, default 48 = longest dispute window).
--   * Fee: normally completion has already charged it (booking_fees row exists, Section 1 only allows paying after
--     completion), so nothing more is charged. If no booking_fees row exists yet (paid before completion), the fee is
--     taken from this payment with the SAME key 'fee:<booking>' and a booking_fees row is written, so the normal
--     completion path (settle_booking_fee returns early when booking_fees exists) never charges it again; the
--     booking's wallet_hold (if any) is released. Launch period: fee waived (₹0), recorded as waived.
--   * The booking was already paid another way (cash/QR/second order): the order is recorded paid but NOTHING is
--     credited ('booking_already_paid'); the admin refunds it in Razorpay (owner decision: manual refund).
--   * Refund (record_booking_refund): once per refund id; reverses (earning - fee) pro-rata, returning the fee share
--     to the pro but never more fee than is left (a dispute decision may have returned it already). May leave a
--     negative wallet balance; a refund is never blocked.
--   * Payouts (request_payout) cannot withdraw earnings that are still on hold.
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Columns -----------------------------------------------------------------------
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS available_at timestamptz;   -- NULL = available now
ALTER TABLE public.wallet_settings ADD COLUMN IF NOT EXISTS earning_hold_hours integer NOT NULL DEFAULT 48 CHECK (earning_hold_hours >= 0);
ALTER TABLE public.booking_payment_orders ADD COLUMN IF NOT EXISTS refunded_paise bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.booking_payment_refunds (
  razorpay_refund_id  text PRIMARY KEY,
  razorpay_payment_id text NOT NULL,
  booking_id          uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount_paise        bigint NOT NULL CHECK (amount_paise >= 0),
  reversed            numeric NOT NULL DEFAULT 0,
  fee_returned        numeric NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_payment_refunds FROM PUBLIC, anon, authenticated;   -- server only

-- 2. On-hold earnings ------------------------------------------------------------------
-- Online credits not yet available, minus refunds of the same payment (same as onHoldTotal in the app).
CREATE OR REPLACE FUNCTION public.wallet_on_hold(p_provider_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(GREATEST(0, c.amount + COALESCE((
           SELECT SUM(r.amount) FROM public.wallet_transactions r
           WHERE r.provider_id = c.provider_id AND r.type = 'refund_reversal' AND r.razorpay_payment_id = c.razorpay_payment_id), 0))), 0)
  FROM public.wallet_transactions c
  WHERE c.provider_id = p_provider_id AND c.type = 'online_credit' AND c.available_at > now();
$$;
REVOKE EXECUTE ON FUNCTION public.wallet_on_hold(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Record a successful payment --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_booking_payment(p_order_id text, p_payment_id text, p_amount_paise bigint, p_method text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o        record;
  b        record;
  v_hours  integer;
  v_earn   numeric;
  v_bill   numeric;
  v_fee    numeric := 0;
  v_charge numeric := 0;
  v_waive  boolean := false;
BEGIN
  IF p_order_id IS NULL OR p_payment_id IS NULL OR p_amount_paise IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  SELECT * INTO o FROM public.booking_payment_orders WHERE razorpay_order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'unknown_order'); END IF;

  IF o.razorpay_payment_id = p_payment_id
     OR EXISTS (SELECT 1 FROM public.booking_payment_orders x WHERE x.razorpay_payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('result', 'duplicate', 'booking_id', o.booking_id);
  END IF;
  IF o.status IN ('paid', 'refunded', 'partially_refunded') THEN
    -- A second successful payment on an order that is already paid: never credited, refund it in Razorpay.
    RETURN jsonb_build_object('result', 'order_already_paid', 'booking_id', o.booking_id);
  END IF;
  IF p_amount_paise <> o.amount_paise THEN
    RETURN jsonb_build_object('result', 'amount_mismatch', 'booking_id', o.booking_id,
                              'expected', o.amount_paise, 'received', p_amount_paise);
  END IF;

  SELECT id, provider_id, status, payment_status, provider_amount, parts_amount, completed_at
    INTO b FROM public.bookings WHERE id = o.booking_id FOR UPDATE;

  UPDATE public.booking_payment_orders
     SET status = 'paid', razorpay_payment_id = p_payment_id, method = p_method, paid_at = now()
   WHERE id = o.id;

  IF COALESCE(b.payment_status, 'unpaid') = 'paid' OR b.provider_id IS NULL THEN
    RETURN jsonb_build_object('result', 'booking_already_paid', 'booking_id', b.id, 'provider_id', b.provider_id);
  END IF;

  PERFORM set_config('wallet.internal', 'true', true);   -- guard_booking_money_columns lets the server set payment_status
  UPDATE public.bookings SET payment_status = 'paid', payment_method = 'online', updated_at = now() WHERE id = b.id;
  PERFORM set_config('wallet.internal', 'false', true);

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || b.provider_id::text));
  SELECT earning_hold_hours INTO v_hours FROM public.wallet_settings WHERE id = true;
  v_earn := round(p_amount_paise / 100.0, 2);

  INSERT INTO public.wallet_transactions
    (provider_id, booking_id, type, amount, idempotency_key, razorpay_payment_id, note, available_at)
  VALUES
    (b.provider_id, b.id, 'online_credit', v_earn, 'bkpay:' || p_payment_id, p_payment_id, 'Customer paid online',
     COALESCE(b.completed_at, now()) + make_interval(hours => COALESCE(v_hours, 48)))
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- The fee comes from this payment only if completion has not settled it yet.
  IF NOT EXISTS (SELECT 1 FROM public.booking_fees WHERE booking_id = b.id) THEN
    v_bill  := GREATEST(0, COALESCE(b.provider_amount, 0) - COALESCE(b.parts_amount, 0));
    v_fee   := public.fee_for_service_bill(v_bill);
    v_waive := public.provider_launch_active(b.provider_id, b.id);
    IF to_regclass('public.wallet_holds') IS NOT NULL THEN
      EXECUTE 'UPDATE public.wallet_holds SET status = ''released'', settled_at = now() WHERE booking_id = $1 AND status = ''held'''
        USING b.id;
    END IF;
    IF v_fee > 0 AND NOT v_waive THEN
      v_charge := v_fee;
      INSERT INTO public.wallet_transactions (provider_id, booking_id, type, amount, idempotency_key, razorpay_payment_id, note)
      VALUES (b.provider_id, b.id, 'cash_fee', -v_charge, 'fee:' || b.id::text, p_payment_id, 'HandyFix fee taken from the online payment')
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    INSERT INTO public.booking_fees (booking_id, provider_id, service_bill, slab_fee, charged, waived)
    VALUES (b.id, b.provider_id, v_bill, v_fee, v_charge, CASE WHEN v_waive THEN v_fee ELSE 0 END)
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (b.provider_id, 'payment', 'Customer paid online',
            '₹' || v_earn::text || ' was paid in the app. It is on hold for the dispute window, then you can withdraw it.',
            jsonb_build_object('booking_id', b.id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('result', 'credited', 'booking_id', b.id, 'provider_id', b.provider_id,
                            'earning', v_earn, 'fee_from_payment', v_charge);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_booking_payment(text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_payment(text, text, bigint, text) TO service_role;

-- 4. A failed attempt (no money moves; a later successful attempt on the same order is still accepted) ----------
CREATE OR REPLACE FUNCTION public.mark_booking_payment_failed(p_order_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  UPDATE public.booking_payment_orders SET status = 'failed'
   WHERE razorpay_order_id = p_order_id AND status = 'created'
  RETURNING booking_id INTO v_booking;
  RETURN jsonb_build_object('result', CASE WHEN v_booking IS NULL THEN 'unknown_or_settled' ELSE 'marked_failed' END,
                            'booking_id', v_booking);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_booking_payment_failed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_payment_failed(text) TO service_role;

-- 5. Refund ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_booking_refund(p_payment_id text, p_refund_id text, p_amount_paise bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o          record;
  b          record;
  f          record;
  v_applied  bigint;
  v_frac     numeric;
  v_credit   numeric;
  v_earn_rev numeric;
  v_fee_ret  numeric := 0;
  v_net      numeric;
BEGIN
  IF p_payment_id IS NULL OR p_refund_id IS NULL OR p_amount_paise IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  SELECT * INTO o FROM public.booking_payment_orders WHERE razorpay_payment_id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'unknown_payment'); END IF;   -- not a booking payment (or not recorded yet)
  IF EXISTS (SELECT 1 FROM public.booking_payment_refunds WHERE razorpay_refund_id = p_refund_id) THEN
    RETURN jsonb_build_object('result', 'duplicate', 'booking_id', o.booking_id);
  END IF;

  SELECT id, provider_id INTO b FROM public.bookings WHERE id = o.booking_id FOR UPDATE;
  v_applied := LEAST(GREATEST(p_amount_paise, 0), GREATEST(o.amount_paise - o.refunded_paise, 0));
  v_frac    := CASE WHEN o.amount_paise > 0 THEN v_applied::numeric / o.amount_paise ELSE 0 END;
  SELECT COALESCE(SUM(amount), 0) INTO v_credit FROM public.wallet_transactions
   WHERE idempotency_key = 'bkpay:' || p_payment_id;
  v_earn_rev := round(v_credit * v_frac, 2);

  SELECT * INTO f FROM public.booking_fees WHERE booking_id = o.booking_id FOR UPDATE;
  IF v_credit > 0 AND FOUND THEN
    v_fee_ret := LEAST(round(COALESCE(f.charged, 0) * v_frac, 2), GREATEST(0, COALESCE(f.charged, 0) - COALESCE(f.refunded, 0)));
    IF v_fee_ret > 0 THEN
      UPDATE public.booking_fees SET refunded = COALESCE(refunded, 0) + v_fee_ret WHERE booking_id = o.booking_id;
    END IF;
  END IF;
  v_net := v_earn_rev - v_fee_ret;

  IF v_net <> 0 AND b.provider_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('wallet:' || b.provider_id::text));
    -- No balance check: a refund may leave the pro's wallet negative; it is never blocked.
    INSERT INTO public.wallet_transactions (provider_id, booking_id, type, amount, idempotency_key, razorpay_payment_id, note)
    VALUES (b.provider_id, b.id, 'refund_reversal', -v_net, 'bkrefund:' || p_refund_id, p_payment_id,
            'Customer refund (earning minus fee)')
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO public.booking_payment_refunds (razorpay_refund_id, razorpay_payment_id, booking_id, amount_paise, reversed, fee_returned)
  VALUES (p_refund_id, p_payment_id, o.booking_id, v_applied, v_net, v_fee_ret);

  UPDATE public.booking_payment_orders
     SET refunded_paise = refunded_paise + v_applied,
         status = CASE WHEN refunded_paise + v_applied >= amount_paise THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = o.id;
  IF v_credit > 0 THEN
    PERFORM set_config('wallet.internal', 'true', true);
    UPDATE public.bookings
       SET payment_status = CASE WHEN o.refunded_paise + v_applied >= o.amount_paise THEN 'refunded' ELSE 'partially_refunded' END
     WHERE id = o.booking_id;
    PERFORM set_config('wallet.internal', 'false', true);
  END IF;

  RETURN jsonb_build_object('result', 'reversed', 'booking_id', o.booking_id, 'provider_id', b.provider_id,
                            'reversed', v_net, 'fee_returned', v_fee_ret);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_booking_refund(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_refund(text, text, bigint) TO service_role;

-- 6. Payouts cannot withdraw on-hold earnings (nor held fees, when 20261114 is applied) ----------
CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sp     record;
  s      record;
  v_amt  numeric;
  v_id   uuid;
  v_held numeric := 0;
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
  IF to_regprocedure('public.wallet_held(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.wallet_held($1)' INTO v_held USING sp.id;
  END IF;
  -- Money held for accepted jobs and online earnings still in the dispute window cannot be withdrawn.
  IF v_amt > public.wallet_balance(sp.id) - COALESCE(v_held, 0) - public.wallet_on_hold(sp.id) THEN
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

-- ─── ROLLBACK ───
-- Restore request_payout from 20261102000001 (or 20261114000000 if applied), then:
-- DROP FUNCTION IF EXISTS public.record_booking_refund(text, text, bigint);
-- DROP FUNCTION IF EXISTS public.mark_booking_payment_failed(text);
-- DROP FUNCTION IF EXISTS public.record_booking_payment(text, text, bigint, text);
-- DROP FUNCTION IF EXISTS public.wallet_on_hold(uuid);
-- DROP TABLE IF EXISTS public.booking_payment_refunds;      -- only while it holds no real refunds
-- The added columns (wallet_transactions.available_at, wallet_settings.earning_hold_hours,
-- booking_payment_orders.refunded_paise) are harmless to keep. Money already moved stays in the append-only ledger.
