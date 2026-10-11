-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Wallet ledger, cash dues, QR payments, payouts, disputes
-- Migration: 20261015000000_wallet_ledger.sql
--
-- HOW TO RUN
--   1. DRY RUN FIRST: change the very last line (COMMIT;) to ROLLBACK; and run.
--      If it finishes without an error, the SQL is valid for your database and
--      NOTHING was saved. Then change it back to COMMIT; and run it for real.
--   2. The whole file is ONE transaction: if anything fails, nothing is applied.
--   3. Safe to run more than once (idempotent).
--
-- MONEY MODEL
--   service charge (provider_amount)  e.g. ₹500
--   platform fee   (platform_fee)     = ROUND(service charge × fee_rate)  e.g. ₹60
--   customer pays  (total_amount)     = service charge + platform fee     e.g. ₹560
--   QR  : customer pays online -> wallet +₹500 (platform keeps ₹60)
--   CASH: provider keeps the ₹560 cash -> wallet -₹60 (dues)
--   wallet balance = SUM(wallet_transactions.amount). Negative = provider owes us.
--   Dues limit reached (balance <= -₹300) -> forced offline, cannot accept jobs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. Preconditions ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.bookings') IS NULL OR to_regclass('public.service_providers') IS NULL THEN
    RAISE EXCEPTION 'bookings / service_providers tables not found - wrong database?';
  END IF;
  IF to_regprocedure('public.has_role(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'has_role() is missing - run the KYC onboarding migration (20261005000000) first';
  END IF;
  IF to_regclass('public.admin_audit_log') IS NULL THEN
    RAISE EXCEPTION 'admin_audit_log is missing - run the admin phase 1 migration (20261006000000) first';
  END IF;
  IF to_regclass('public.booking_completion_codes') IS NULL THEN
    RAISE EXCEPTION 'booking_completion_codes is missing - run the completion codes migration (20261004000001) first';
  END IF;
  IF to_regclass('public.provider_earnings') IS NULL OR to_regclass('public.payout_requests') IS NULL THEN
    RAISE EXCEPTION 'provider_earnings / payout_requests missing - run the provider panel migrations first';
  END IF;
END $$;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status text;

-- ─── 1. Settings (one row; change values with a plain UPDATE) ───────────────
CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  dues_limit            numeric(10,2) NOT NULL DEFAULT 300 CHECK (dues_limit > 0),
  fee_rate              numeric(6,4)  NOT NULL DEFAULT 0.12 CHECK (fee_rate >= 0 AND fee_rate <= 0.5),
  min_payout            numeric(10,2) NOT NULL DEFAULT 100 CHECK (min_payout > 0),
  unsettled_grace_hours integer       NOT NULL DEFAULT 24 CHECK (unsettled_grace_hours >= 0),
  live_since            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);
INSERT INTO public.wallet_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─── 2. The ledger (append-only) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE RESTRICT,
  booking_id          uuid REFERENCES public.bookings(id),
  type                text NOT NULL CHECK (type IN
                        ('online_credit','cash_fee','topup','payout','payout_reversal','refund_reversal','adjustment')),
  amount              numeric(12,2) NOT NULL CHECK (amount <> 0),
  idempotency_key     text NOT NULL UNIQUE,
  razorpay_payment_id text,
  note                text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_provider_created ON public.wallet_transactions (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payment ON public.wallet_transactions (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.wallet_tx_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions is append-only (no UPDATE / DELETE / TRUNCATE)';
END;
$$;

DROP TRIGGER IF EXISTS wallet_tx_no_update ON public.wallet_transactions;
CREATE TRIGGER wallet_tx_no_update
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_tx_immutable();

DROP TRIGGER IF EXISTS wallet_tx_no_truncate ON public.wallet_transactions;
CREATE TRIGGER wallet_tx_no_truncate
  BEFORE TRUNCATE ON public.wallet_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.wallet_tx_immutable();

-- ─── 3. Payment records ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_payments (
  booking_id          uuid PRIMARY KEY REFERENCES public.bookings(id),
  provider_id         uuid NOT NULL REFERENCES public.service_providers(id),
  status              text NOT NULL DEFAULT 'qr_open' CHECK (status IN ('qr_open','paid')),
  method              text CHECK (method IN ('cash','qr')),
  total_amount        numeric(12,2) NOT NULL,
  provider_amount     numeric(12,2) NOT NULL,
  platform_fee        numeric(12,2) NOT NULL,
  qr_id               text,
  qr_image_url        text,
  qr_expires_at       timestamptz,
  razorpay_payment_id text,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_payments_paid_has_method CHECK (status <> 'paid' OR method IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_rzp_payment_uniq
  ON public.booking_payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS booking_payments_qr_idx ON public.booking_payments (qr_id);
CREATE INDEX IF NOT EXISTS booking_payments_provider_idx ON public.booking_payments (provider_id);

CREATE TABLE IF NOT EXISTS public.wallet_topup_orders (
  order_id            text PRIMARY KEY,
  provider_id         uuid NOT NULL REFERENCES public.service_providers(id),
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  status              text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid')),
  razorpay_payment_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);
CREATE INDEX IF NOT EXISTS wallet_topup_orders_provider_idx ON public.wallet_topup_orders (provider_id);

CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES public.bookings(id),
  customer_id     uuid NOT NULL,
  provider_id     uuid NOT NULL REFERENCES public.service_providers(id),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','rejected')),
  resolution_note text,
  resolved_by     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_disputes_one_open
  ON public.payment_disputes (booking_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS payment_disputes_status_idx ON public.payment_disputes (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            text UNIQUE,
  event_type          text NOT NULL,
  result              text NOT NULL,
  booking_id          uuid,
  provider_id         uuid,
  razorpay_payment_id text,
  amount              numeric(12,2),
  note                text,
  payload             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_created_idx ON public.payment_events (created_at DESC);

-- payout_requests already exists: add admin bookkeeping columns
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS notes        text;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS admin_note   text;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS processed_by uuid;

-- ─── 4. Row level security: READ-ONLY for clients, no client writes at all ──
ALTER TABLE public.wallet_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topup_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_disputes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_settings_read" ON public.wallet_settings;
CREATE POLICY "wallet_settings_read" ON public.wallet_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wallet_tx_provider_read" ON public.wallet_transactions;
CREATE POLICY "wallet_tx_provider_read" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "wallet_tx_admin_read" ON public.wallet_transactions;
CREATE POLICY "wallet_tx_admin_read" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "booking_payments_provider_read" ON public.booking_payments;
CREATE POLICY "booking_payments_provider_read" ON public.booking_payments
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "booking_payments_customer_read" ON public.booking_payments;
CREATE POLICY "booking_payments_customer_read" ON public.booking_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND b.customer_id = auth.uid()));

DROP POLICY IF EXISTS "booking_payments_admin_read" ON public.booking_payments;
CREATE POLICY "booking_payments_admin_read" ON public.booking_payments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "topup_orders_provider_read" ON public.wallet_topup_orders;
CREATE POLICY "topup_orders_provider_read" ON public.wallet_topup_orders
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "disputes_customer_read" ON public.payment_disputes;
CREATE POLICY "disputes_customer_read" ON public.payment_disputes
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "disputes_provider_read" ON public.payment_disputes;
CREATE POLICY "disputes_provider_read" ON public.payment_disputes
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "disputes_admin_read" ON public.payment_disputes;
CREATE POLICY "disputes_admin_read" ON public.payment_disputes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "payment_events_admin_read" ON public.payment_events;
CREATE POLICY "payment_events_admin_read" ON public.payment_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Belt and braces: remove write privileges as well (policies already deny them)
REVOKE ALL ON public.wallet_settings, public.wallet_transactions, public.booking_payments,
              public.wallet_topup_orders, public.payment_disputes, public.payment_events
  FROM anon, authenticated;
GRANT SELECT ON public.wallet_settings, public.wallet_transactions, public.booking_payments,
                public.wallet_topup_orders, public.payment_disputes, public.payment_events
  TO authenticated;

-- payout_requests: providers may only READ. Requests go through request_payout().
DROP POLICY IF EXISTS "providers_own_payouts"        ON public.payout_requests;
DROP POLICY IF EXISTS "Providers manage own payouts" ON public.payout_requests;
DROP POLICY IF EXISTS "payout_requests_provider_read" ON public.payout_requests;
CREATE POLICY "payout_requests_provider_read" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "payout_requests_admin_read" ON public.payout_requests;
CREATE POLICY "payout_requests_admin_read" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.payout_requests FROM anon, authenticated;

-- provider_earnings: providers could UPDATE their own rows and anyone could INSERT. Lock it.
DROP POLICY IF EXISTS "Providers update own earnings" ON public.provider_earnings;
DROP POLICY IF EXISTS "System can insert earnings"    ON public.provider_earnings;
REVOKE INSERT, UPDATE, DELETE ON public.provider_earnings FROM anon, authenticated;

-- Realtime (RLS still applies to what each user receives)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public' AND tablename = 'wallet_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                 AND schemaname = 'public' AND tablename = 'booking_payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_payments;
  END IF;
END $$;

-- ─── 5. Core helpers (internal: not callable by app users) ──────────────────
CREATE OR REPLACE FUNCTION public.wallet_balance(p_provider_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.wallet_transactions WHERE provider_id = p_provider_id;
$$;

-- NULL = fine. 'dues_limit' = owes >= limit. 'unsettled_job' = finished a job
-- (after this wallet went live) more than the grace period ago and never recorded payment.
CREATE OR REPLACE FUNCTION public.provider_block_reason(p_provider_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.wallet_settings WHERE id = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF public.wallet_balance(p_provider_id) <= -s.dues_limit THEN
    RETURN 'dues_limit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.provider_id = p_provider_id
      AND b.status::text = 'completed'
      AND COALESCE(b.total_amount, 0) > 0
      AND b.completed_at IS NOT NULL
      AND b.completed_at >= s.live_since
      AND b.completed_at < now() - make_interval(hours => s.unsettled_grace_hours)
      AND NOT EXISTS (SELECT 1 FROM public.booking_payments bp
                      WHERE bp.booking_id = b.id AND bp.status = 'paid')
  ) THEN
    RETURN 'unsettled_job';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_enforce_limit(p_provider_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed integer;
BEGIN
  IF public.provider_block_reason(p_provider_id) IS DISTINCT FROM 'dues_limit' THEN
    RETURN;
  END IF;

  UPDATE public.service_providers SET is_online = false
  WHERE id = p_provider_id AND is_online IS TRUE;
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  IF v_changed > 0 THEN
    BEGIN
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (p_provider_id, 'dues_limit', 'You are offline: dues limit reached',
              'Pay your dues in Wallet to receive new jobs again.', '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$$;

-- The ONLY way money rows are written. Returns true if inserted, false if this
-- idempotency_key was already posted (so replays are harmless).
CREATE OR REPLACE FUNCTION public.wallet_post(
  p_provider_id uuid,
  p_booking_id  uuid,
  p_type        text,
  p_amount      numeric,
  p_key         text,
  p_payment_id  text DEFAULT NULL,
  p_note        text DEFAULT NULL,
  p_by          uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || p_provider_id::text));

  INSERT INTO public.wallet_transactions
    (provider_id, booking_id, type, amount, idempotency_key, razorpay_payment_id, note, created_by)
  VALUES
    (p_provider_id, p_booking_id, p_type, ROUND(p_amount, 2), p_key, p_payment_id, p_note, p_by)
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  PERFORM public.wallet_enforce_limit(p_provider_id);
  RETURN true;
END;
$$;

-- ─── 6. Fee rule + money-column protection on bookings ──────────────────────
-- 6a. Server decides the price and the fee (client values are ignored).
CREATE OR REPLACE FUNCTION public.enforce_booking_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate     numeric;
  v_price    numeric;
  v_sub_id   uuid;
BEGIN
  SELECT fee_rate INTO v_rate FROM public.wallet_settings WHERE id = true;
  v_rate := COALESCE(v_rate, 0.12);

  -- Price: sub-item price if a sub-item was chosen, else the service base price.
  -- If a sub-item was chosen but its price cannot be read, keep the price the app sent
  -- (never silently switch to a different price than the customer saw).
  v_price := NULL;
  BEGIN
    v_sub_id := NULLIF(to_jsonb(NEW) ->> 'sub_item_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_sub_id := NULL;
  END;

  IF v_sub_id IS NOT NULL THEN
    BEGIN
      SELECT NULLIF(to_jsonb(s) ->> 'base_price', '')::numeric INTO v_price
      FROM public.service_sub_items s WHERE s.id = v_sub_id;
    EXCEPTION WHEN OTHERS THEN
      v_price := NULL;
    END;
    IF v_price IS NULL THEN
      v_price := COALESCE(NEW.provider_amount, 0);
    END IF;
  ELSIF NEW.service_id IS NOT NULL THEN
    SELECT base_price INTO v_price FROM public.services WHERE id = NEW.service_id;
  END IF;

  IF v_price IS NULL THEN
    v_price := COALESCE(NEW.provider_amount, 0);
  END IF;

  IF v_price < 0 THEN v_price := 0; END IF;

  NEW.provider_amount := v_price;
  NEW.platform_fee    := ROUND(v_price * v_rate);
  NEW.total_amount    := NEW.provider_amount + NEW.platform_fee;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_fee ON public.bookings;
CREATE TRIGGER enforce_booking_fee
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_fee();

-- 6b. Providers / customers cannot edit money columns on a booking after creation.
CREATE OR REPLACE FUNCTION public.guard_booking_money_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_col text;
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('wallet.internal', true) = 'true' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;                       -- service role / SQL editor
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;

  FOREACH v_col IN ARRAY ARRAY['total_amount','platform_fee','provider_amount','service_charge',
                               'final_amount','coupon_code','coupon_discount','payment_status']
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'Payment fields (%) cannot be changed directly.', v_col USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_booking_money_columns ON public.bookings;
CREATE TRIGGER guard_booking_money_columns
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_money_columns();

-- 6c. Fix: the old completion guard could never block anyone (its role check was always true).
--     Now a booking can only become 'completed' through complete_booking_with_code() (or an admin).
CREATE OR REPLACE FUNCTION public.block_direct_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF OLD.status::text = 'completed' THEN RETURN NEW; END IF;
  IF current_setting('handyfix.completing', true) = 'true' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;                       -- service role / SQL editor
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Direct completion not allowed. Use complete_booking_with_code().' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_direct_completion ON public.bookings;
CREATE TRIGGER trg_block_direct_completion
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_completion();

-- Same function as before, plus the session flag that lets the completion through.
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

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_booking_with_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking_with_code(uuid, text) TO authenticated;

-- 6d. Earnings rows now use the REAL split (service charge to provider, fee to platform).
CREATE OR REPLACE FUNCTION public.auto_create_provider_earnings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rate      numeric;
  v_provider  numeric;
  v_fee       numeric;
BEGIN
  IF NEW.status::text = 'completed' AND OLD.status::text <> 'completed' AND NEW.provider_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.provider_earnings WHERE booking_id = NEW.id) THEN
      IF COALESCE(NEW.provider_amount, 0) > 0 THEN
        v_provider := NEW.provider_amount;
        v_fee      := COALESCE(NEW.platform_fee, 0);
      ELSE
        SELECT fee_rate INTO v_rate FROM public.wallet_settings WHERE id = true;
        v_rate     := COALESCE(v_rate, 0.12);
        v_provider := ROUND(COALESCE(NEW.total_amount, 0) / (1 + v_rate), 2);
        v_fee      := COALESCE(NEW.total_amount, 0) - v_provider;
      END IF;

      INSERT INTO public.provider_earnings (provider_id, booking_id, provider_amount, platform_fee, status)
      VALUES (NEW.provider_id, NEW.id, v_provider, v_fee, 'pending');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6e. Fix (existing bug): these two triggers update service_providers columns that the KYC
--     "privileged column" guard rejects for non-admins, which would make job completion and
--     reviews fail. They now set the internal flag the guard already understands.
CREATE OR REPLACE FUNCTION public.update_provider_earnings_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET
    total_earnings = (SELECT COALESCE(SUM(provider_amount), 0) FROM public.provider_earnings WHERE provider_id = NEW.provider_id),
    this_month_earnings = (SELECT COALESCE(SUM(provider_amount), 0) FROM public.provider_earnings
                           WHERE provider_id = NEW.provider_id AND created_at >= date_trunc('month', now())),
    total_jobs = (SELECT COUNT(*) FROM public.bookings WHERE provider_id = NEW.provider_id AND status::text = 'completed')
  WHERE id = NEW.provider_id;
  PERFORM set_config('kyc.internal_update', 'false', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_provider_rating_on_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET
    rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;
  PERFORM set_config('kyc.internal_update', 'false', true);
  RETURN NEW;
END;
$$;

-- ─── 7. Dues enforcement in the DATABASE (the app cannot bypass it) ─────────
-- 7a. Cannot go online while blocked (silently stays offline, like the KYC rule;
--     the provider app also sends an online heartbeat, so we must not raise errors here).
CREATE OR REPLACE FUNCTION public.enforce_dues_before_online()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_online IS TRUE AND OLD.is_online IS DISTINCT FROM TRUE THEN
    IF public.provider_block_reason(NEW.id) IS NOT NULL THEN
      NEW.is_online := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dues_before_online ON public.service_providers;
CREATE TRIGGER enforce_dues_before_online
  BEFORE UPDATE OF is_online ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dues_before_online();

-- 7b. Cannot accept a new job while blocked.
CREATE OR REPLACE FUNCTION public.enforce_dues_before_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.provider_id IS NOT NULL
     AND OLD.status::text = 'pending'
     AND NEW.status::text = 'confirmed' THEN
    v_reason := public.provider_block_reason(NEW.provider_id);
    IF v_reason = 'dues_limit' THEN
      RAISE EXCEPTION 'Dues limit reached. Pay your dues in Wallet to accept new jobs.' USING ERRCODE = 'P0001';
    ELSIF v_reason = 'unsettled_job' THEN
      RAISE EXCEPTION 'Record the payment for your previous completed job to accept new jobs.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dues_before_accept ON public.bookings;
CREATE TRIGGER enforce_dues_before_accept
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_dues_before_accept();

-- ─── 8. Provider RPCs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid       uuid;
  s           record;
  v_bal       numeric;
  v_reason    text;
  v_unsettled integer;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_provider');
  END IF;

  SELECT * INTO s FROM public.wallet_settings WHERE id = true;
  v_bal    := public.wallet_balance(v_pid);
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
    'dues', GREATEST(0, -v_bal),
    'available', GREATEST(0, v_bal),
    'dues_limit', s.dues_limit,
    'min_payout', s.min_payout,
    'fee_rate', s.fee_rate,
    'live_since', s.live_since,
    'blocked', v_reason IS NOT NULL,
    'block_reason', v_reason,
    'unsettled_jobs', v_unsettled
  );
END;
$$;

-- Provider taps "I collected ₹560 cash".
CREATE OR REPLACE FUNCTION public.confirm_cash_collected(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid  uuid;
  b      record;
  bp     record;
  v_fee  numeric;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.provider_id IS DISTINCT FROM v_pid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF b.status::text <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completed');
  END IF;

  SELECT * INTO bp FROM public.booking_payments WHERE booking_id = p_booking_id FOR UPDATE;
  IF FOUND AND bp.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'method', bp.method);
  END IF;

  v_fee := COALESCE(b.platform_fee, 0);

  PERFORM set_config('wallet.internal', 'true', true);

  INSERT INTO public.booking_payments
    (booking_id, provider_id, status, method, total_amount, provider_amount, platform_fee, paid_at)
  VALUES
    (b.id, v_pid, 'paid', 'cash', COALESCE(b.total_amount, 0), COALESCE(b.provider_amount, 0), v_fee, now())
  ON CONFLICT (booking_id) DO UPDATE
    SET status = 'paid', method = 'cash', paid_at = now(), updated_at = now();

  IF v_fee > 0 THEN
    PERFORM public.wallet_post(v_pid, b.id, 'cash_fee', -v_fee, 'cash:' || b.id::text, NULL,
                               'Cash collected: platform fee added to dues');
  END IF;

  UPDATE public.bookings SET payment_status = 'paid' WHERE id = b.id;

  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (b.customer_id, 'payment_cash',
            'Paid ₹' || COALESCE(b.total_amount, 0)::text || ' by cash',
            'Your provider recorded a cash payment of ₹' || COALESCE(b.total_amount, 0)::text ||
            '. If this is not correct, open the booking and tap "Report a problem".',
            b.id,
            jsonb_build_object('method', 'cash', 'amount', b.total_amount));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'method', 'cash', 'fee', v_fee);
END;
$$;

-- Provider requests a withdrawal of their positive wallet balance.
CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sp     record;
  s      record;
  v_amt  numeric;
  v_id   uuid;
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
  IF v_amt > public.wallet_balance(sp.id) THEN
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

-- ─── 9. Customer RPC: dispute a cash payment ────────────────────────────────
CREATE OR REPLACE FUNCTION public.raise_payment_dispute(p_booking_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b        record;
  bp       record;
  v_reason text := TRIM(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.customer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  IF LENGTH(v_reason) < 10 OR LENGTH(v_reason) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  END IF;

  SELECT * INTO bp FROM public.booking_payments WHERE booking_id = p_booking_id;
  IF NOT FOUND OR bp.status <> 'paid' OR bp.method IS DISTINCT FROM 'cash' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cash_payment');
  END IF;
  IF bp.paid_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'window_closed');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_disputes WHERE booking_id = p_booking_id AND status = 'open') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_disputed');
  END IF;

  INSERT INTO public.payment_disputes (booking_id, customer_id, provider_id, reason)
  VALUES (p_booking_id, auth.uid(), b.provider_id, v_reason);

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (b.provider_id, 'payment_dispute', 'Customer reported a cash payment issue',
            'A customer reported a problem with the cash payment on one of your jobs. Support will review it.',
            jsonb_build_object('booking_id', b.id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── 10. Webhook-side functions (service_role only; called by Edge Functions) ─
CREATE OR REPLACE FUNCTION public.record_qr_payment(
  p_qr_id        text,
  p_booking_id   uuid,
  p_payment_id   text,
  p_amount_paise bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bp       record;
  b        record;
  v_amount numeric;
BEGIN
  IF p_payment_id IS NULL OR p_payment_id = '' THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  v_amount := ROUND(COALESCE(p_amount_paise, 0) / 100.0, 2);

  SELECT * INTO bp FROM public.booking_payments
  WHERE (p_booking_id IS NOT NULL AND booking_id = p_booking_id)
     OR (p_qr_id IS NOT NULL AND qr_id = p_qr_id)
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'unknown_qr');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || bp.provider_id::text));

  IF bp.razorpay_payment_id = p_payment_id THEN
    RETURN jsonb_build_object('result', 'duplicate', 'booking_id', bp.booking_id, 'provider_id', bp.provider_id);
  END IF;

  IF bp.status = 'paid' THEN
    RETURN jsonb_build_object('result', 'already_paid', 'booking_id', bp.booking_id,
                              'provider_id', bp.provider_id, 'method', bp.method);
  END IF;

  IF v_amount <> bp.total_amount THEN
    RETURN jsonb_build_object('result', 'amount_mismatch', 'booking_id', bp.booking_id,
                              'provider_id', bp.provider_id, 'expected', bp.total_amount, 'received', v_amount);
  END IF;

  PERFORM set_config('wallet.internal', 'true', true);

  UPDATE public.booking_payments
  SET status = 'paid', method = 'qr', razorpay_payment_id = p_payment_id, paid_at = now(), updated_at = now()
  WHERE booking_id = bp.booking_id;

  IF bp.provider_amount <> 0 THEN
    PERFORM public.wallet_post(bp.provider_id, bp.booking_id, 'online_credit', bp.provider_amount,
                               'pay:' || p_payment_id, p_payment_id, 'Online payment (QR)');
  END IF;

  UPDATE public.bookings SET payment_status = 'paid' WHERE id = bp.booking_id;

  SELECT * INTO b FROM public.bookings WHERE id = bp.booking_id;

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (bp.provider_id, 'payment', 'Payment received',
            '₹' || bp.provider_amount::text || ' was added to your wallet.',
            jsonb_build_object('booking_id', bp.booking_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (b.customer_id, 'payment_online', 'Payment received',
            'We received your online payment of ₹' || bp.total_amount::text || '. Thank you!',
            bp.booking_id, jsonb_build_object('method', 'qr', 'amount', bp.total_amount));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('result', 'credited', 'booking_id', bp.booking_id, 'provider_id', bp.provider_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wallet_topup(
  p_order_id     text,
  p_payment_id   text,
  p_amount_paise bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o        record;
  v_amount numeric;
BEGIN
  IF p_order_id IS NULL OR p_payment_id IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  v_amount := ROUND(COALESCE(p_amount_paise, 0) / 100.0, 2);

  SELECT * INTO o FROM public.wallet_topup_orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'unknown_order');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || o.provider_id::text));

  IF o.status = 'paid' THEN
    RETURN jsonb_build_object('result', 'duplicate', 'provider_id', o.provider_id);
  END IF;
  IF v_amount <> o.amount THEN
    RETURN jsonb_build_object('result', 'amount_mismatch', 'provider_id', o.provider_id,
                              'expected', o.amount, 'received', v_amount);
  END IF;

  UPDATE public.wallet_topup_orders
  SET status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
  WHERE order_id = p_order_id;

  PERFORM public.wallet_post(o.provider_id, NULL, 'topup', o.amount, 'topup:' || p_payment_id,
                             p_payment_id, 'Wallet top-up (UPI)');

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (o.provider_id, 'payment', 'Wallet top-up received',
            '₹' || o.amount::text || ' was added to your wallet. Switch online when you are ready.',
            '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('result', 'credited', 'provider_id', o.provider_id);
END;
$$;

-- A refund of a payment we credited reverses that credit (proportionally for part refunds).
CREATE OR REPLACE FUNCTION public.record_refund(
  p_payment_id   text,
  p_refund_id    text,
  p_amount_paise bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t        record;
  bp       record;
  v_refund numeric;
  v_amount numeric;
BEGIN
  IF p_payment_id IS NULL OR p_refund_id IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;
  v_refund := ROUND(COALESCE(p_amount_paise, 0) / 100.0, 2);

  SELECT * INTO t FROM public.wallet_transactions
  WHERE razorpay_payment_id = p_payment_id AND type IN ('online_credit', 'topup') AND amount > 0
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'no_credit');
  END IF;

  IF t.type = 'online_credit' THEN
    SELECT * INTO bp FROM public.booking_payments WHERE razorpay_payment_id = p_payment_id;
    IF FOUND AND bp.total_amount > 0 THEN
      v_amount := ROUND(t.amount * LEAST(v_refund, bp.total_amount) / bp.total_amount, 2);
    ELSE
      v_amount := t.amount;
    END IF;
  ELSE
    v_amount := LEAST(v_refund, t.amount);
  END IF;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('result', 'no_credit');
  END IF;

  IF public.wallet_post(t.provider_id, t.booking_id, 'refund_reversal', -v_amount,
                        'refund:' || p_refund_id, p_payment_id, 'Customer refund reversed') THEN
    RETURN jsonb_build_object('result', 'reversed', 'provider_id', t.provider_id, 'amount', v_amount);
  END IF;
  RETURN jsonb_build_object('result', 'duplicate', 'provider_id', t.provider_id);
END;
$$;

-- ─── 11. Admin RPCs ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_wallet_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.balance ASC)
    FROM (
      SELECT sp.id AS provider_id,
             sp.full_name,
             sp.phone,
             sp.status,
             sp.is_online,
             public.wallet_balance(sp.id) AS balance,
             GREATEST(0, -public.wallet_balance(sp.id)) AS dues,
             public.provider_block_reason(sp.id) AS block_reason,
             (SELECT MAX(created_at) FROM public.wallet_transactions w WHERE w.provider_id = sp.id) AS last_activity
      FROM public.service_providers sp
      WHERE sp.kyc_status = 'approved'
         OR EXISTS (SELECT 1 FROM public.wallet_transactions w WHERE w.provider_id = sp.id)
      LIMIT 500
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_disputes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY (x.status = 'open') DESC, x.created_at DESC)
    FROM (
      SELECT d.id, d.booking_id, d.status, d.reason, d.resolution_note, d.created_at, d.resolved_at,
             sp.full_name AS provider_name, sp.phone AS provider_phone,
             b.customer_name, b.customer_phone, b.total_amount, b.platform_fee,
             bp.paid_at
      FROM public.payment_disputes d
      JOIN public.service_providers sp ON sp.id = d.provider_id
      JOIN public.bookings b ON b.id = d.booking_id
      LEFT JOIN public.booking_payments bp ON bp.booking_id = d.booking_id
      ORDER BY d.created_at DESC
      LIMIT 200
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payouts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY (x.status IN ('pending','processing')) DESC, x.requested_at DESC)
    FROM (
      SELECT p.id, p.provider_id, p.amount, p.status, p.requested_at, p.processed_at, p.admin_note,
             p.bank_account_name, p.bank_account_number, p.bank_ifsc, p.upi_id,
             sp.full_name AS provider_name, sp.phone AS provider_phone
      FROM public.payout_requests p
      JOIN public.service_providers sp ON sp.id = p.provider_id
      ORDER BY p.requested_at DESC
      LIMIT 200
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payment_issues()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
    FROM (
      SELECT e.id, e.event_type, e.result, e.booking_id, e.provider_id, e.razorpay_payment_id,
             e.amount, e.note, e.created_at
      FROM public.payment_events e
      WHERE e.result NOT IN ('credited', 'duplicate', 'ignored', 'reversed', 'no_credit')
      ORDER BY e.created_at DESC
      LIMIT 100
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_dispute_id uuid,
  p_outcome    text,
  p_note       text,
  p_adjustment numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  d       record;
  v_note  text := TRIM(COALESCE(p_note, ''));
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF p_outcome NOT IN ('upheld', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Outcome must be upheld or rejected');
  END IF;
  IF LENGTH(v_note) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please write a resolution note (min 5 characters)');
  END IF;
  IF ABS(COALESCE(p_adjustment, 0)) > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment too large');
  END IF;

  SELECT * INTO d FROM public.payment_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute not found');
  END IF;
  IF d.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute is already resolved');
  END IF;

  UPDATE public.payment_disputes
  SET status = p_outcome, resolution_note = v_note, resolved_by = v_admin, resolved_at = now()
  WHERE id = p_dispute_id;

  IF COALESCE(p_adjustment, 0) <> 0 THEN
    PERFORM public.wallet_post(d.provider_id, d.booking_id, 'adjustment', ROUND(p_adjustment, 2),
                               'dispute-adj:' || d.id::text, NULL, 'Dispute resolution: ' || v_note, v_admin);
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'dispute_resolved', 'payment_dispute', d.id,
          jsonb_build_object('outcome', p_outcome, 'note', v_note, 'adjustment', COALESCE(p_adjustment, 0),
                             'booking_id', d.booking_id, 'provider_id', d.provider_id));

  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (d.customer_id, 'payment_dispute_resolved', 'Your payment report was reviewed',
            'Outcome: ' || p_outcome || '. ' || v_note, d.booking_id, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (d.provider_id, 'payment_dispute_resolved', 'A payment dispute was resolved',
            'Outcome: ' || p_outcome || '. ' || v_note, jsonb_build_object('booking_id', d.booking_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_wallet_adjustment(
  p_provider_id uuid,
  p_amount      numeric,
  p_note        text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_note  text := TRIM(COALESCE(p_note, ''));
  v_key   text := 'adj:' || gen_random_uuid()::text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR ABS(p_amount) > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be non-zero and at most 1,00,000');
  END IF;
  IF LENGTH(v_note) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please write a note (min 5 characters)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_providers WHERE id = p_provider_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found');
  END IF;

  PERFORM public.wallet_post(p_provider_id, NULL, 'adjustment', ROUND(p_amount, 2), v_key, NULL, v_note, v_admin);

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'wallet_adjustment', 'service_provider', p_provider_id,
          jsonb_build_object('amount', ROUND(p_amount, 2), 'note', v_note));

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_payout(
  p_payout_id uuid,
  p_status    text,
  p_note      text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid();
  p       record;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: admin role required');
  END IF;
  IF p_status NOT IN ('processing', 'paid', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be processing, paid or failed');
  END IF;

  SELECT * INTO p FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout not found');
  END IF;
  IF p.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout is already ' || p.status);
  END IF;

  UPDATE public.payout_requests
  SET status = p_status,
      admin_note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
      processed_by = v_admin,
      processed_at = CASE WHEN p_status IN ('paid', 'failed') THEN now() ELSE processed_at END
  WHERE id = p_payout_id;

  IF p_status = 'failed' THEN
    PERFORM public.wallet_post(p.provider_id, NULL, 'payout_reversal', p.amount,
                               'payout-rev:' || p.id::text, NULL, 'Payout failed: money returned to wallet', v_admin);
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'payout_' || p_status, 'payout_request', p.id,
          jsonb_build_object('amount', p.amount, 'provider_id', p.provider_id, 'note', p_note));

  BEGIN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (p.provider_id, 'payment',
            CASE p_status WHEN 'paid' THEN 'Withdrawal paid'
                          WHEN 'failed' THEN 'Withdrawal failed'
                          ELSE 'Withdrawal is being processed' END,
            CASE p_status WHEN 'paid' THEN '₹' || p.amount::text || ' was sent to your account.'
                          WHEN 'failed' THEN '₹' || p.amount::text || ' was returned to your wallet.'
                          ELSE 'We are processing your ₹' || p.amount::text || ' withdrawal.' END,
            '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ─── 12. Function permissions ───────────────────────────────────────────────
-- Internal helpers + webhook functions: nobody but the server (service_role) may call them.
REVOKE ALL ON FUNCTION public.wallet_balance(uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_block_reason(uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_enforce_limit(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_post(uuid,uuid,text,numeric,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_qr_payment(text,uuid,text,bigint)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_wallet_topup(text,text,bigint)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_refund(text,text,bigint)                   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_qr_payment(text,uuid,text,bigint)       TO service_role;
GRANT EXECUTE ON FUNCTION public.record_wallet_topup(text,text,bigint)          TO service_role;
GRANT EXECUTE ON FUNCTION public.record_refund(text,text,bigint)                TO service_role;

-- App-user RPCs
REVOKE ALL ON FUNCTION public.get_wallet_summary()                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_cash_collected(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_payout(numeric)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.raise_payment_dispute(uuid,text)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cash_collected(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.raise_payment_dispute(uuid,text)   TO authenticated;

-- Admin RPCs (each one also checks has_role(...,'admin') inside)
REVOKE ALL ON FUNCTION public.admin_get_wallet_overview()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_disputes()                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_payouts()                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_payment_issues()                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid,text,text,numeric)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_wallet_adjustment(uuid,numeric,text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_process_payout(uuid,text,text)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet_overview()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_disputes()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payouts()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_issues()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid,text,text,numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_wallet_adjustment(uuid,numeric,text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid,text,text)           TO authenticated;

-- ─── END ────────────────────────────────────────────────────────────────────
-- DRY RUN: replace the next line with  ROLLBACK;  (nothing is saved)
-- REAL RUN: keep it as  COMMIT;
COMMIT;
