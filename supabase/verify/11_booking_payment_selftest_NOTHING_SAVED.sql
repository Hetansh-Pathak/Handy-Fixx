-- ═══════════════════════════════════════════════════════════════════════════
-- PAYMENTS SECTION 2 SELF-TEST. Saves NOTHING.
-- Run after applying 20261122000000 and 20261123000000 (with or without 20261114000000).
-- Paste ALL of it in Supabase -> SQL Editor -> Run. It uses one real approved pro and a real customer id, creates
-- test bookings and fake Razorpay ids inside one transaction, then deliberately ends with an error so EVERYTHING
-- is rolled back. A RED error box at the end is EXPECTED: read the PASS / FAIL / SKIP lines in it.
-- ═══════════════════════════════════════════════════════════════════════════

-- A test booking for the pro, priced by the live triggers, then completed the way complete_booking_with_code does.
CREATE OR REPLACE FUNCTION pg_temp.st_booking(p_pro uuid, p_customer uuid, p_service uuid, p_complete boolean)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.bookings (customer_id, user_id, provider_id, service_id, status, booking_date, booking_time,
                               address, city, pincode, customer_name, customer_phone, provider_amount, total_amount,
                               special_instructions)
  VALUES (p_customer, p_customer, p_pro, p_service, 'in_progress', current_date, '10:00', 'SELFTEST', 'SELFTEST', '000000',
          'SELFTEST', '0000000000', 1, 1, 'SELFTEST: rolled back')
  RETURNING id INTO v_id;
  UPDATE public.bookings SET started_at = now() WHERE id = v_id;
  IF p_complete THEN PERFORM pg_temp.st_complete(v_id); END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.st_complete(p_booking uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('handyfix.completing', 'true', true);
  UPDATE public.bookings SET status = 'completed', completed_at = now() WHERE id = p_booking;
  PERFORM set_config('handyfix.completing', 'false', true);
  PERFORM public.settle_booking_fee(p_booking);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.st_order(p_booking uuid, p_order text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_amount bigint;
BEGIN
  SELECT round(total_amount * 100)::bigint INTO v_amount FROM public.bookings WHERE id = p_booking;
  INSERT INTO public.booking_payment_orders (booking_id, razorpay_order_id, amount_paise) VALUES (p_booking, p_order, v_amount);
  RETURN v_amount;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.st_fee_rows(p_booking uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.wallet_transactions WHERE idempotency_key = 'fee:' || p_booking::text;
$$;

DO $$
DECLARE
  r        text := '';
  v_pro    uuid;
  v_cust   uuid;
  v_svc    uuid;
  t        text := 'st' || substr(md5(random()::text), 1, 8);
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid;
  a1 bigint; a2 bigint; a3 bigint; a4 bigint; a5 bigint;
  v_res    jsonb;
  v_res2   jsonb;
  v_bal0   numeric;
  v_bal    numeric;
  v_fee    numeric;
  v_bill   numeric;
  v_n      bigint;
  v_ok     boolean;
  v_launch boolean;
BEGIN
  SELECT id INTO v_pro FROM public.service_providers WHERE kyc_status = 'approved' AND status = 'active' LIMIT 1;
  SELECT customer_id, service_id INTO v_cust, v_svc FROM public.bookings
   WHERE customer_id IS NOT NULL AND service_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF v_pro IS NULL OR v_cust IS NULL THEN
    RAISE EXCEPTION 'SELFTEST: needs one approved + active pro and one existing booking (nothing saved)';
  END IF;

  -- Fees on: launch period over for this test (rolled back at the end).
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET kyc_reviewed_at = now() - interval '6 months' WHERE id = v_pro;
  PERFORM set_config('kyc.internal_update', 'false', true);
  PERFORM public.wallet_post(v_pro, NULL, 'adjustment', 500, t || ':seed', NULL, 'SELFTEST seed', NULL);

  -- 1. Double webhook = one credit; fee correct and charged once (completion settled it before the payment).
  b1 := pg_temp.st_booking(v_pro, v_cust, v_svc, true);
  a1 := pg_temp.st_order(b1, t || '_o1');
  v_bal0 := public.wallet_balance(v_pro);
  v_res  := public.record_booking_payment(t || '_o1', t || '_p1', a1, 'upi');
  v_res2 := public.record_booking_payment(t || '_o1', t || '_p1', a1, 'upi');
  SELECT count(*) INTO v_n FROM public.wallet_transactions WHERE idempotency_key = 'bkpay:' || t || '_p1';
  r := r || format(E'%s  double webhook = one credit (%s then %s, %s credit row, balance +%s)\n',
    CASE WHEN v_res->>'result' = 'credited' AND v_res2->>'result' = 'duplicate' AND v_n = 1
              AND public.wallet_balance(v_pro) = v_bal0 + a1 / 100.0 THEN 'PASS' ELSE 'FAIL' END,
    v_res->>'result', v_res2->>'result', v_n, public.wallet_balance(v_pro) - v_bal0);
  SELECT GREATEST(0, provider_amount - COALESCE(parts_amount, 0)) INTO v_bill FROM public.bookings WHERE id = b1;
  v_fee := public.fee_for_service_bill(v_bill);
  r := r || format(E'%s  fee correct: %s on a %s service bill, charged once (fee rows %s, booking_fees.charged %s)\n',
    CASE WHEN pg_temp.st_fee_rows(b1) = 1 AND (SELECT charged FROM public.booking_fees WHERE booking_id = b1) = v_fee THEN 'PASS' ELSE 'FAIL' END,
    v_fee, v_bill, pg_temp.st_fee_rows(b1), (SELECT charged FROM public.booking_fees WHERE booking_id = b1));
  r := r || format(E'%s  booking and order marked paid by the server (booking %s / %s, order %s)\n',
    CASE WHEN (SELECT payment_status = 'paid' AND payment_method = 'online' FROM public.bookings WHERE id = b1)
              AND (SELECT status = 'paid' FROM public.booking_payment_orders WHERE razorpay_order_id = t || '_o1') THEN 'PASS' ELSE 'FAIL' END,
    (SELECT payment_status FROM public.bookings WHERE id = b1), (SELECT payment_method FROM public.bookings WHERE id = b1),
    (SELECT status FROM public.booking_payment_orders WHERE razorpay_order_id = t || '_o1'));
  r := r || format(E'%s  earning on hold until completion + %s h (cannot be withdrawn yet: on hold %s)\n',
    CASE WHEN (SELECT available_at > now() FROM public.wallet_transactions WHERE idempotency_key = 'bkpay:' || t || '_p1')
              AND public.wallet_on_hold(v_pro) >= a1 / 100.0 THEN 'PASS' ELSE 'FAIL' END,
    (SELECT earning_hold_hours FROM public.wallet_settings WHERE id = true), public.wallet_on_hold(v_pro));

  -- 2. Wrong amount = no credit.
  b2 := pg_temp.st_booking(v_pro, v_cust, v_svc, true);
  a2 := pg_temp.st_order(b2, t || '_o2');
  v_bal0 := public.wallet_balance(v_pro);
  v_res := public.record_booking_payment(t || '_o2', t || '_p2', a2 + 100, 'card');
  r := r || format(E'%s  wrong amount = no credit (%s, balance change %s, booking %s)\n',
    CASE WHEN v_res->>'result' = 'amount_mismatch' AND public.wallet_balance(v_pro) = v_bal0
              AND (SELECT COALESCE(payment_status, 'unpaid') FROM public.bookings WHERE id = b2) = 'unpaid' THEN 'PASS' ELSE 'FAIL' END,
    v_res->>'result', public.wallet_balance(v_pro) - v_bal0, (SELECT COALESCE(payment_status, 'unpaid') FROM public.bookings WHERE id = b2));

  -- 3. Paid before completion: fee taken from the payment, hold released, no second fee at completion.
  b3 := pg_temp.st_booking(v_pro, v_cust, v_svc, false);
  IF to_regclass('public.wallet_holds') IS NOT NULL THEN
    SELECT GREATEST(0, provider_amount - COALESCE(parts_amount, 0)) INTO v_bill FROM public.bookings WHERE id = b3;
    EXECUTE 'INSERT INTO public.wallet_holds (booking_id, provider_id, amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING'
      USING b3, v_pro, GREATEST(public.fee_for_service_bill(v_bill), 1);
  END IF;
  a3 := pg_temp.st_order(b3, t || '_o3');
  v_res := public.record_booking_payment(t || '_o3', t || '_p3', a3, 'upi');
  IF to_regclass('public.wallet_holds') IS NOT NULL THEN
    EXECUTE 'SELECT status = ''released'' FROM public.wallet_holds WHERE booking_id = $1' INTO v_ok USING b3;
    r := r || format(E'%s  paid before completion: the fee hold is released\n', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);
  ELSE
    r := r || E'SKIP  hold released (wallet_holds does not exist: 20261114000000 not applied)\n';
  END IF;
  PERFORM pg_temp.st_complete(b3);
  r := r || format(E'%s  no double fee at completion (fee rows %s, fee from payment %s)\n',
    CASE WHEN pg_temp.st_fee_rows(b3) <= 1 AND (SELECT count(*) FROM public.booking_fees WHERE booking_id = b3) = 1 THEN 'PASS' ELSE 'FAIL' END,
    pg_temp.st_fee_rows(b3), v_res->>'fee_from_payment');

  -- 4. Launch job: fee ₹0.
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET kyc_reviewed_at = now() - interval '1 day' WHERE id = v_pro;
  PERFORM set_config('kyc.internal_update', 'false', true);
  b4 := pg_temp.st_booking(v_pro, v_cust, v_svc, false);
  v_launch := public.provider_launch_active(v_pro, b4);
  IF v_launch THEN
    a4 := pg_temp.st_order(b4, t || '_o4');
    v_res := public.record_booking_payment(t || '_o4', t || '_p4', a4, 'upi');
    r := r || format(E'%s  launch job: fee 0 (fee rows %s, booking_fees.charged %s, waived %s)\n',
      CASE WHEN pg_temp.st_fee_rows(b4) = 0 AND (SELECT charged FROM public.booking_fees WHERE booking_id = b4) = 0 THEN 'PASS' ELSE 'FAIL' END,
      pg_temp.st_fee_rows(b4), (SELECT charged FROM public.booking_fees WHERE booking_id = b4), (SELECT waived FROM public.booking_fees WHERE booking_id = b4));
  ELSE
    r := r || E'SKIP  launch fee 0 (this pro already has 10+ completed jobs, so the launch cannot be simulated)\n';
  END IF;
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET kyc_reviewed_at = now() - interval '6 months' WHERE id = v_pro;
  PERFORM set_config('kyc.internal_update', 'false', true);

  -- 5. Full refund (booking 1): earning minus fee comes back out; duplicate refund id ignored.
  v_bal0 := public.wallet_balance(v_pro);
  SELECT charged INTO v_fee FROM public.booking_fees WHERE booking_id = b1;
  v_res  := public.record_booking_refund(t || '_p1', t || '_r1', a1);
  v_res2 := public.record_booking_refund(t || '_p1', t || '_r1', a1);
  r := r || format(E'%s  full refund reverses earning minus fee (%s; wallet %s, expected %s; duplicate %s; booking %s)\n',
    CASE WHEN v_res->>'result' = 'reversed' AND v_res2->>'result' = 'duplicate'
              AND public.wallet_balance(v_pro) = v_bal0 - (a1 / 100.0 - v_fee)
              AND (SELECT payment_status FROM public.bookings WHERE id = b1) = 'refunded' THEN 'PASS' ELSE 'FAIL' END,
    v_res->>'result', public.wallet_balance(v_pro) - v_bal0, -(a1 / 100.0 - v_fee), v_res2->>'result',
    (SELECT payment_status FROM public.bookings WHERE id = b1));

  -- 6. Partial refund (booking 3, half): pro-rata.
  v_bal0 := public.wallet_balance(v_pro);
  SELECT charged INTO v_fee FROM public.booking_fees WHERE booking_id = b3;
  v_res := public.record_booking_refund(t || '_p3', t || '_r3', a3 / 2);
  r := r || format(E'%s  partial refund is pro-rata (wallet %s, expected about %s; booking %s)\n',
    CASE WHEN v_res->>'result' = 'reversed'
              AND abs((public.wallet_balance(v_pro) - v_bal0) + ((a3 / 2) / 100.0 - round(v_fee * ((a3 / 2)::numeric / a3), 2))) <= 0.02
              AND (SELECT payment_status FROM public.bookings WHERE id = b3) = 'partially_refunded' THEN 'PASS' ELSE 'FAIL' END,
    public.wallet_balance(v_pro) - v_bal0, -((a3 / 2) / 100.0 - round(v_fee * ((a3 / 2)::numeric / a3), 2)),
    (SELECT payment_status FROM public.bookings WHERE id = b3));

  -- 7. Refund after the money was spent: the wallet goes negative, the refund is not blocked.
  b5 := pg_temp.st_booking(v_pro, v_cust, v_svc, true);
  a5 := pg_temp.st_order(b5, t || '_o5');
  PERFORM public.record_booking_payment(t || '_o5', t || '_p5', a5, 'upi');
  v_bal := public.wallet_balance(v_pro);
  PERFORM public.wallet_post(v_pro, NULL, 'adjustment', -(v_bal + 1), t || ':spent', NULL, 'SELFTEST spend everything', NULL);
  v_res := public.record_booking_refund(t || '_p5', t || '_r5', a5);
  r := r || format(E'%s  refund after the money was spent leaves a negative balance (%s, balance %s)\n',
    CASE WHEN v_res->>'result' = 'reversed' AND public.wallet_balance(v_pro) < 0 THEN 'PASS' ELSE 'FAIL' END,
    v_res->>'result', public.wallet_balance(v_pro));

  RAISE EXCEPTION E'SELFTEST RESULTS (nothing was saved):\n%', r;
END $$;
