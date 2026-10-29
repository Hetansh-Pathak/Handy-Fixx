-- APPLY: BOOKING PAYMENT ORDERS FOR REAL. Ends with COMMIT. Run the dry run first.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Payments Section 1 (owner decision 2026-10-30): a customer may pay for a booking IN THE APP through Razorpay, or pay
-- the pro directly (cash/UPI) as today. Customer platform fee stays ₹0; the pro's 3% fee rules do not change.
-- This proposal only lets an order be CREATED. Marking a booking paid and crediting the pro is Section 2 (webhook);
-- nothing here credits anyone.
--
-- What this does
--   1. New table booking_payment_orders: one row per Razorpay order (a booking can have several: abandoned orders,
--      or a new order after the amount changed). razorpay_order_id and razorpay_payment_id are UNIQUE.
--      The existing booking_payments table (old QR/cash flow, one row per booking, read by get_wallet_summary) is NOT
--      touched (owner decision).
--   2. RLS: the booking's customer and the booking's pro can READ their rows. No client can insert, update or delete:
--      only the create-booking-payment-order Edge Function (service role) and, in Section 2, the webhook write here.
--   3. bookings.payment_method (online / cash / qr, NULL until paid) and a CHECK on the existing bookings.payment_status
--      (unpaid / pending / paid / refunded / partially_refunded; live rows are only 'unpaid' and 'paid').
--      Clients still cannot change either column: guard_booking_update allows neither for customers or pros.
--   4. booking_payable_paise(booking_id): the amount to charge, from the database, or NULL when the booking cannot be
--      paid online. Same rule as packages/shared booking/payment.ts onlinePaymentBlock:
--      completed, payment_status unpaid, no extra work waiting for approval, total_amount > 0.
--      A signed-in caller gets NULL for a booking that is not theirs; the Edge Function calls it as service role.
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Orders --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payment_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  razorpay_order_id   text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  amount_paise        bigint NOT NULL CHECK (amount_paise > 0),
  status              text NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed', 'refunded', 'partially_refunded')),
  method              text,                       -- upi / card / netbanking / wallet, from Razorpay (Section 2)
  created_by          uuid,                       -- the customer's auth user id (rate limit, audit)
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);
CREATE INDEX IF NOT EXISTS booking_payment_orders_booking_idx ON public.booking_payment_orders (booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_payment_orders_creator_idx ON public.booking_payment_orders (created_by, created_at DESC);

ALTER TABLE public.booking_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_payment_orders_customer_read ON public.booking_payment_orders;
CREATE POLICY booking_payment_orders_customer_read ON public.booking_payment_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b
                 WHERE b.id = booking_id AND auth.uid() IN (b.customer_id, b.user_id)));

DROP POLICY IF EXISTS booking_payment_orders_provider_read ON public.booking_payment_orders;
CREATE POLICY booking_payment_orders_provider_read ON public.booking_payment_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b JOIN public.service_providers sp ON sp.id = b.provider_id
                 WHERE b.id = booking_id AND sp.user_id = auth.uid()));

REVOKE ALL ON public.booking_payment_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_payment_orders TO authenticated;

-- 3. Booking columns ---------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method text;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_method_check') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('online', 'cash', 'qr'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_status_check') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
      CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'partially_refunded'));
  END IF;
END
$do$;

-- 4. The amount, from the database ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_payable_paise(p_booking_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  SELECT id, customer_id, user_id, status, payment_status, total_amount INTO b
  FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- A signed-in caller only learns the amount of their own booking. Service role (auth.uid() NULL) sees any.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM b.customer_id AND auth.uid() IS DISTINCT FROM b.user_id THEN
    RETURN NULL;
  END IF;
  IF b.status::text <> 'completed' THEN RETURN NULL; END IF;
  IF COALESCE(b.payment_status, 'unpaid') <> 'unpaid' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_extras e WHERE e.booking_id = b.id AND e.status = 'pending') THEN RETURN NULL; END IF;
  IF COALESCE(b.total_amount, 0) <= 0 THEN RETURN NULL; END IF;
  RETURN round(b.total_amount * 100)::bigint;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.booking_payable_paise(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_payable_paise(uuid) TO authenticated;

-- ─── ROLLBACK ───
-- DROP FUNCTION IF EXISTS public.booking_payable_paise(uuid);
-- ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
-- ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
-- ALTER TABLE public.bookings DROP COLUMN IF EXISTS payment_method;   -- only while no row has a value
-- DROP TABLE IF EXISTS public.booking_payment_orders;               -- only while it holds no real orders

-- ─── CHECK ───
SELECT to_regclass('public.booking_payment_orders') AS orders_table,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'booking_payment_orders') AS read_policies_should_be_2,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'booking_payable_paise') AS payable_function,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'payment_method') AS payment_method_column;
COMMIT;
