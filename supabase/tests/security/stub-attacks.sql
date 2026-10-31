-- Attack walkthrough stub: the live bookings table, triggers, policies and money / completion functions, copied from the
-- live project (read-only catalog queries, 2026-11-01). Loaded after stub.sql. Objects marked LIVE are verbatim bodies.

-- bookings: every live column (stub.sql only has the few other suites need)
alter table public.bookings
  add column if not exists service_id uuid, add column if not exists scheduled_time time, add column if not exists address text,
  add column if not exists city text, add column if not exists pincode text, add column if not exists description text,
  add column if not exists total_amount numeric not null default 0, add column if not exists platform_fee numeric not null default 0,
  add column if not exists provider_amount numeric not null default 0, add column if not exists service_charge numeric,
  add column if not exists started_at timestamptz, add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz, add column if not exists cancellation_reason text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists provider_eta_minutes integer, add column if not exists provider_location_lat numeric,
  add column if not exists provider_location_lng numeric, add column if not exists provider_departed_at timestamptz,
  add column if not exists unread_messages_customer integer default 0, add column if not exists unread_messages_provider integer default 0,
  add column if not exists customer_name text, add column if not exists customer_phone text,
  add column if not exists booking_date date, add column if not exists booking_time time, add column if not exists special_instructions text,
  add column if not exists sub_item_id uuid, add column if not exists sub_item_name text, add column if not exists tracking_active boolean default false,
  add column if not exists provider_lat double precision, add column if not exists provider_lng double precision,
  add column if not exists last_location_update timestamptz, add column if not exists payment_status text default 'unpaid',
  add column if not exists latitude double precision, add column if not exists longitude double precision,
  add column if not exists coupon_code text, add column if not exists coupon_discount numeric default 0, add column if not exists final_amount numeric,
  add column if not exists extras_amount numeric not null default 0, add column if not exists parts_amount numeric not null default 0,
  add column if not exists arrived_at timestamptz, add column if not exists arrived_lat double precision, add column if not exists arrived_lng double precision,
  add column if not exists dispatch_state text, add column if not exists current_ring smallint, add column if not exists ring_deadline timestamptz,
  add column if not exists searched_since timestamptz, add column if not exists search_ends_at timestamptz, add column if not exists dispatch_accepted_at timestamptz;

alter table public.services add column if not exists price_min numeric, add column if not exists price_max numeric;
create table public.provider_services (provider_id uuid, service_id uuid, custom_price numeric);
create table public.service_sub_items (id uuid primary key default gen_random_uuid(), service_id uuid, name text, base_price numeric);
alter table public.customer_notifications add column if not exists booking_id uuid, add column if not exists data jsonb;
alter table public.reviews add column if not exists booking_id uuid;

-- LIVE bookings policies (the ones not already in stub.sql)
create policy "bookings_provider_select" on public.bookings for select to authenticated
  using (provider_id in (select id from public.service_providers where user_id = auth.uid()));
create policy "bookings_provider_update" on public.bookings for update to authenticated
  using (provider_id in (select id from public.service_providers where user_id = auth.uid()))
  with check (provider_id in (select id from public.service_providers where user_id = auth.uid()));
create policy "bookings_customer_update" on public.bookings for update to authenticated
  using ((customer_id = auth.uid()) or (user_id = auth.uid())) with check ((customer_id = auth.uid()) or (user_id = auth.uid()));
create policy "users_own_bookings_update" on public.bookings for update to authenticated using (auth.uid() = user_id);
create policy "admin_select_all_bookings" on public.bookings for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- LIVE insert-time triggers
CREATE FUNCTION public.enforce_booking_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sub_id   uuid;
  v_price    numeric;
  v_from_sub boolean := false;
  v_min      numeric;
  v_max      numeric;
BEGIN
  BEGIN
    v_sub_id := NULLIF(to_jsonb(NEW) ->> 'sub_item_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_sub_id := NULL;
  END;
  IF v_sub_id IS NOT NULL AND to_regclass('public.service_sub_items') IS NOT NULL THEN
    SELECT NULLIF(to_jsonb(s) ->> 'base_price', '')::numeric INTO v_price FROM public.service_sub_items s WHERE s.id = v_sub_id;
    v_from_sub := v_price IS NOT NULL;
  END IF;
  IF v_price IS NULL AND NEW.provider_id IS NOT NULL AND NEW.service_id IS NOT NULL THEN
    SELECT custom_price INTO v_price FROM public.provider_services WHERE provider_id = NEW.provider_id AND service_id = NEW.service_id;
  END IF;
  IF v_price IS NULL AND NEW.service_id IS NOT NULL THEN
    SELECT base_price INTO v_price FROM public.services WHERE id = NEW.service_id;
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'No valid price is available for this booking.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_from_sub AND NEW.service_id IS NOT NULL THEN
    SELECT price_min, price_max INTO v_min, v_max FROM public.services WHERE id = NEW.service_id;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND (v_price < v_min OR v_price > v_max) THEN
      RAISE EXCEPTION 'Price % is outside the allowed range % to %.', v_price, v_min, v_max USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.provider_amount := v_price;
  NEW.service_charge  := v_price;
  NEW.platform_fee    := 0;
  NEW.total_amount    := v_price;
  RETURN NEW;
END;
$function$;
create trigger enforce_booking_price before insert on public.bookings for each row execute function public.enforce_booking_price();

CREATE FUNCTION public.reset_booking_extras_on_insert() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.extras_amount := 0; NEW.parts_amount := 0; RETURN NEW; END;
$function$;
create trigger reset_booking_extras_on_insert before insert on public.bookings for each row execute function public.reset_booking_extras_on_insert();

CREATE FUNCTION public.enforce_provider_kyc_for_bookings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_kyc_status TEXT; v_status TEXT;
BEGIN
  IF NEW.provider_id IS NULL THEN RETURN NEW; END IF;
  SELECT kyc_status, status INTO v_kyc_status, v_status FROM public.service_providers WHERE id = NEW.provider_id;
  IF v_kyc_status IS DISTINCT FROM 'approved' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Provider is not yet approved to accept bookings.';
  END IF;
  RETURN NEW;
END;
$function$;
create trigger enforce_provider_kyc_on_booking before insert or update of provider_id, status on public.bookings for each row execute function public.enforce_provider_kyc_for_bookings();

-- LIVE update-time guards
CREATE FUNCTION public.guard_booking_update() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_is_provider boolean;
  v_is_customer boolean;
  v_changed     text[];
  v_allowed     text[];
  v_chat        constant text[] := ARRAY['unread_messages_provider','unread_messages_customer','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT COALESCE(array_agg(COALESCE(n.key, o.key)), ARRAY[]::text[]) INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n FULL JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
  WHERE n.value IS DISTINCT FROM o.value;
  IF cardinality(v_changed) = 0 THEN RETURN NEW; END IF;
  v_is_provider := v_uid IS NOT NULL AND OLD.provider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.service_providers sp WHERE sp.id = OLD.provider_id AND sp.user_id = v_uid);
  v_is_customer := v_uid IS NOT NULL AND v_uid::text IN (COALESCE(to_jsonb(OLD)->>'user_id', ''), COALESCE(to_jsonb(OLD)->>'customer_id', ''));
  IF v_is_provider THEN
    v_allowed := v_chat || ARRAY['status','started_at','provider_departed_at','provider_eta_minutes','tracking_active','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Providers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'pending'     AND NEW.status IN ('confirmed','cancelled'))
      OR (OLD.status = 'confirmed'   AND NEW.status IN ('on_the_way','in_progress','cancelled'))
      OR (OLD.status = 'on_the_way'  AND NEW.status IN ('arrived','in_progress','cancelled'))
      OR (OLD.status = 'arrived'     AND NEW.status IN ('in_progress','cancelled'))
      OR (OLD.status = 'in_progress' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid status change % -> % (completion requires the customer code)', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF v_is_customer THEN
    v_allowed := v_chat || ARRAY['status','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Customers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status IN ('pending','confirmed') AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Customers can only cancel a pending or confirmed booking' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Not allowed to update this booking' USING ERRCODE = '42501';
END;
$function$;
create trigger zz_guard_booking_update before update on public.bookings for each row execute function public.guard_booking_update();

CREATE FUNCTION public.guard_booking_money_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_col text; v_new jsonb := to_jsonb(NEW); v_old jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('wallet.internal', true) = 'true' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  FOREACH v_col IN ARRAY ARRAY['total_amount','platform_fee','provider_amount','service_charge','final_amount','coupon_code','coupon_discount','payment_status','extras_amount','parts_amount']
  LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      RAISE EXCEPTION 'Payment fields (%) cannot be changed directly.', v_col USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;
create trigger guard_booking_money_columns before update on public.bookings for each row execute function public.guard_booking_money_columns();

CREATE FUNCTION public.block_direct_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status::text IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF OLD.status::text = 'completed' THEN RETURN NEW; END IF;
  IF current_setting('handyfix.completing', true) = 'true' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Direct completion not allowed. Use complete_booking_with_code().' USING ERRCODE = '42501';
END;
$function$;
create trigger trg_block_direct_completion before update on public.bookings for each row execute function public.block_direct_completion();

-- completion codes
create table public.booking_completion_codes (booking_id uuid primary key references public.bookings(id) on delete cascade, code text not null,
  failed_attempts integer not null default 0, locked_until timestamptz);
alter table public.booking_completion_codes enable row level security;
create policy "customer_select_own_code" on public.booking_completion_codes for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_completion_codes.booking_id and b.customer_id = auth.uid()));
CREATE FUNCTION public.generate_booking_completion_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.booking_completion_codes (booking_id, code) VALUES (NEW.id, lpad(floor(random() * 10000)::int::text, 4, '0'))
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
create trigger trg_generate_completion_code after insert on public.bookings for each row execute function public.generate_booking_completion_code();
create function public.settle_booking_fee(p_booking_id uuid) returns void language sql security definer set search_path = public as $$ select $$;

CREATE FUNCTION public.complete_booking_with_code(p_booking_id uuid, p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_booking        record;
  v_code_row       record;
  v_provider_uid   uuid;
  v_max_attempts   constant integer := 5;
  v_lock_minutes   constant integer := 15;
  v_new_attempts   integer;
  v_lock           timestamptz;
BEGIN
  SELECT sp.user_id INTO v_provider_uid FROM public.bookings b JOIN public.service_providers sp ON sp.id = b.provider_id WHERE b.id = p_booking_id;
  IF v_provider_uid IS NULL OR v_provider_uid <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.status::text <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_booking.status::text);
  END IF;
  SELECT * INTO v_code_row FROM public.booking_completion_codes WHERE booking_id = p_booking_id;
  IF v_code_row IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_code'); END IF;
  IF v_code_row.locked_until IS NOT NULL AND v_code_row.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_code_row.locked_until);
  END IF;
  IF v_code_row.code <> p_code THEN
    v_new_attempts := v_code_row.failed_attempts + 1;
    v_lock := NULL;
    IF v_new_attempts >= v_max_attempts THEN v_lock := now() + (v_lock_minutes || ' minutes')::interval; END IF;
    UPDATE public.booking_completion_codes SET failed_attempts = v_new_attempts, locked_until = v_lock WHERE booking_id = p_booking_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_code', 'attempts_left', GREATEST(0, v_max_attempts - v_new_attempts),
                              'locked', v_lock IS NOT NULL, 'locked_until', v_lock);
  END IF;
  PERFORM set_config('handyfix.completing', 'true', true);
  UPDATE public.bookings SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_booking_id;
  PERFORM set_config('handyfix.completing', 'false', true);
  UPDATE public.booking_completion_codes SET failed_attempts = 0, locked_until = NULL WHERE booking_id = p_booking_id;
  PERFORM public.settle_booking_fee(p_booking_id);
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- extra work
create table public.booking_extras (id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_id uuid not null, title text, kind text, amount numeric, photo_path text, status text not null default 'pending', decided_at timestamptz,
  created_at timestamptz default now());
alter table public.booking_extras enable row level security;
create policy "booking_extras_read" on public.booking_extras for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_extras.booking_id and b.customer_id = auth.uid())
         or provider_id in (select id from public.service_providers where user_id = auth.uid()) or public.has_role(auth.uid(), 'admin'));
CREATE FUNCTION public.add_booking_extra(p_booking_id uuid, p_title text, p_amount numeric, p_kind text DEFAULT 'labour'::text, p_photo_path text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_pid uuid; b record; v_id uuid;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF v_pid IS NULL OR NOT FOUND OR b.provider_id IS DISTINCT FROM v_pid THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF b.status::text NOT IN ('on_the_way','arrived','in_progress') THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status'); END IF;
  IF COALESCE(p_kind, 'labour') NOT IN ('labour','parts') THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount'); END IF;
  IF char_length(TRIM(COALESCE(p_title, ''))) < 2 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_title'); END IF;
  IF p_kind = 'parts' AND COALESCE(p_photo_path, '') = '' THEN RETURN jsonb_build_object('ok', false, 'reason', 'photo_required'); END IF;
  IF (SELECT COUNT(*) FROM public.booking_extras WHERE booking_id = p_booking_id AND status = 'pending') >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'too_many_pending'); END IF;
  INSERT INTO public.booking_extras (booking_id, provider_id, title, kind, amount, photo_path)
  VALUES (p_booking_id, v_pid, TRIM(p_title), COALESCE(p_kind, 'labour'), ROUND(p_amount), NULLIF(p_photo_path, '')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
CREATE FUNCTION public.decide_booking_extra(p_extra_id uuid, p_approve boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE e record; b record;
BEGIN
  SELECT * INTO e FROM public.booking_extras WHERE id = p_extra_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  SELECT * INTO b FROM public.bookings WHERE id = e.booking_id FOR UPDATE;
  IF b.customer_id IS DISTINCT FROM auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF e.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_decided'); END IF;
  IF b.status::text NOT IN ('on_the_way','arrived','in_progress') THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status'); END IF;
  UPDATE public.booking_extras SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, decided_at = now() WHERE id = p_extra_id;
  IF p_approve THEN
    PERFORM set_config('wallet.internal', 'true', true);
    UPDATE public.bookings SET extras_amount = COALESCE(extras_amount, 0) + e.amount,
      parts_amount = COALESCE(parts_amount, 0) + CASE WHEN e.kind = 'parts' THEN e.amount ELSE 0 END,
      total_amount = COALESCE(total_amount, 0) + e.amount, provider_amount = COALESCE(provider_amount, 0) + e.amount, updated_at = now() WHERE id = b.id;
    PERFORM set_config('wallet.internal', 'false', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'approved', p_approve, 'total', (SELECT total_amount FROM public.bookings WHERE id = b.id));
END;
$function$;
CREATE FUNCTION public.get_booking_provider(p_booking_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b record; sp record;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.customer_id IS DISTINCT FROM auth.uid() OR b.provider_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO sp FROM public.service_providers WHERE id = b.provider_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', sp.id, 'full_name', sp.full_name,
    'phone', CASE WHEN b.status::text IN ('confirmed','on_the_way','arrived','in_progress') THEN to_jsonb(sp) ->> 'phone' END);
END;
$function$;
CREATE FUNCTION public.record_arrival(p_booking_id uuid, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_status text; v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in first'); END IF;
  SELECT b.status::text, b.arrived_at INTO v_status, v_at FROM public.bookings b JOIN public.service_providers sp ON sp.id = b.provider_id WHERE b.id = p_booking_id AND sp.user_id = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'This is not your booking'); END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- reviews: the state AFTER the existing reviews proposal 20261108 (the loose policies dropped, reviews_insert stays)
drop policy if exists "Customers can create reviews" on public.reviews;
create policy "reviews_insert" on public.reviews for insert to authenticated
  with check (booking_id in (select id from public.bookings where customer_id = auth.uid() and status = 'completed'));

-- wallet top-up (LIVE bodies) for the payment replay tests
create table public.wallet_topup_orders (order_id text primary key, provider_id uuid not null references public.service_providers(id), amount numeric not null check (amount > 0),
  status text not null default 'created' check (status in ('created','paid')), razorpay_payment_id text, paid_at timestamptz, created_at timestamptz not null default now());
create table public.wallet_transactions (id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.service_providers(id), booking_id uuid,
  type text not null check (type in ('online_credit','cash_fee','topup','payout','payout_reversal','refund_reversal','adjustment')), amount numeric not null check (amount <> 0),
  idempotency_key text not null unique, razorpay_payment_id text, note text, created_by uuid, created_at timestamptz not null default now());
create function public.wallet_enforce_limit(p_provider_id uuid) returns void language sql as $$ select $$;
CREATE FUNCTION public.wallet_post(p_provider_id uuid, p_booking_id uuid, p_type text, p_amount numeric, p_key text, p_payment_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_by uuid DEFAULT NULL::uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || p_provider_id::text));
  INSERT INTO public.wallet_transactions (provider_id, booking_id, type, amount, idempotency_key, razorpay_payment_id, note, created_by)
  VALUES (p_provider_id, p_booking_id, p_type, ROUND(p_amount, 2), p_key, p_payment_id, p_note, p_by) ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN false; END IF;
  PERFORM public.wallet_enforce_limit(p_provider_id);
  RETURN true;
END;
$function$;
CREATE FUNCTION public.record_wallet_topup(p_order_id text, p_payment_id text, p_amount_paise bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o record; v_amount numeric;
BEGIN
  IF p_order_id IS NULL OR p_payment_id IS NULL THEN RETURN jsonb_build_object('result', 'invalid'); END IF;
  v_amount := ROUND(COALESCE(p_amount_paise, 0) / 100.0, 2);
  SELECT * INTO o FROM public.wallet_topup_orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'unknown_order'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || o.provider_id::text));
  IF o.status = 'paid' THEN RETURN jsonb_build_object('result', 'duplicate', 'provider_id', o.provider_id); END IF;
  IF v_amount <> o.amount THEN
    RETURN jsonb_build_object('result', 'amount_mismatch', 'provider_id', o.provider_id, 'expected', o.amount, 'received', v_amount);
  END IF;
  UPDATE public.wallet_topup_orders SET status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now() WHERE order_id = p_order_id;
  PERFORM public.wallet_post(o.provider_id, NULL, 'topup', o.amount, 'topup:' || p_payment_id, p_payment_id, 'Wallet top-up (UPI)');
  RETURN jsonb_build_object('result', 'credited', 'provider_id', o.provider_id);
END;
$function$;
revoke all on function public.record_wallet_topup(text, text, bigint) from public, anon, authenticated;
revoke all on function public.wallet_post(uuid, uuid, text, numeric, text, text, text, uuid) from public, anon, authenticated;

-- live: notification message is nullable (the new-booking notice builds it from scheduled_date, which can be empty)
alter table public.provider_notifications alter column message drop not null;
