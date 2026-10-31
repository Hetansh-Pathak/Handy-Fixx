-- Live-like stub of the parts of the HandyFix database that instant dispatch touches (checked read-only 2026-10-31).
-- Function bodies marked LIVE are copied from the live project; the rest are minimal stand-ins.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table admin_users (user_id uuid primary key);
create function public.has_role(p_user_id uuid, p_role text) returns boolean language sql stable security definer as
  $$ select p_role = 'admin' and exists (select 1 from admin_users where user_id = p_user_id) $$;
create publication supabase_realtime;

create type booking_status as enum ('pending','confirmed','in_progress','completed','cancelled','on_the_way','arrived');
create type provider_status as enum ('active','suspended','pending_approval','inactive');
create type notification_type as enum ('new_booking','booking_cancelled','new_review','payment','system','kyc_submitted','kyc_approved','kyc_rejected');

create table services (id uuid primary key, name text, base_price numeric, price_min numeric, price_max numeric);
create table service_sub_items (id uuid primary key, service_id uuid, name text, base_price numeric, price_min numeric, price_max numeric);
create table provider_services (provider_id uuid, service_id uuid, custom_price numeric);
create table service_providers (id uuid primary key, user_id uuid unique, full_name text, name text, status provider_status default 'active',
  is_online boolean default false, rating numeric, total_jobs int default 0, service_ids uuid[], pincodes text[], city text,
  kyc_status text, kyc_reviewed_at timestamptz, updated_at timestamptz default now());
create table bookings (id uuid primary key default gen_random_uuid(), customer_id uuid, user_id uuid, provider_id uuid references service_providers(id),
  service_id uuid not null, status booking_status not null default 'pending', scheduled_date date, scheduled_time time,
  booking_date date, booking_time time, address text not null default '', city text, pincode text, special_instructions text,
  sub_item_id uuid, sub_item_name text, customer_name text, customer_phone text,
  total_amount numeric not null default 0, platform_fee numeric not null default 0, provider_amount numeric not null default 0,
  service_charge numeric, extras_amount numeric not null default 0, parts_amount numeric not null default 0,
  latitude double precision, longitude double precision, cancelled_at timestamptz, cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table provider_notifications (id uuid primary key default gen_random_uuid(), provider_id uuid not null, type notification_type not null,
  title text not null, message text not null, is_read boolean not null default false, data jsonb, created_at timestamptz not null default now());
create table customer_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text, booking_id uuid, data jsonb);
create table booking_completion_codes (booking_id uuid primary key, code text);
create table provider_response_log (booking_id uuid primary key, provider_id uuid, seconds int);
create table wallet_transactions (id uuid primary key default gen_random_uuid(), provider_id uuid, amount numeric);

create function public.wallet_balance(p uuid) returns numeric language sql stable security definer set search_path to 'public' as
  $$ select coalesce(sum(amount), 0) from public.wallet_transactions where provider_id = p $$;
create function public.fee_for_service_bill(p_bill numeric) returns numeric language sql immutable as
  $$ select case when p_bill is null or p_bill <= 0 then 0 when p_bill < 500 then 15 when p_bill <= 1500 then 30 else 50 end::numeric $$;
create function public.provider_launch_active(p_provider_id uuid, p_exclude_booking uuid default null) returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v timestamptz; n int;
begin
  select kyc_reviewed_at into v from public.service_providers where id = p_provider_id;
  if v is null or now() >= v + interval '1 months' then return false; end if;
  select count(*) into n from public.bookings where provider_id = p_provider_id and status::text = 'completed';
  return n < 10;
end $$;

-- LIVE trigger functions -------------------------------------------------------------------------------------------
CREATE FUNCTION public.sync_booking_owner() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.customer_id := COALESCE(NEW.customer_id, NEW.user_id); NEW.user_id := COALESCE(NEW.user_id, NEW.customer_id); RETURN NEW; END; $$;

CREATE FUNCTION public.enforce_booking_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_sub_id uuid; v_price numeric; v_from_sub boolean := false; v_min numeric; v_max numeric;
BEGIN
  BEGIN v_sub_id := NULLIF(to_jsonb(NEW) ->> 'sub_item_id', '')::uuid; EXCEPTION WHEN OTHERS THEN v_sub_id := NULL; END;
  IF v_sub_id IS NOT NULL AND to_regclass('public.service_sub_items') IS NOT NULL THEN
    SELECT NULLIF(to_jsonb(s) ->> 'base_price', '')::numeric INTO v_price FROM public.service_sub_items s WHERE s.id = v_sub_id;
    v_from_sub := v_price IS NOT NULL;
  END IF;
  IF v_price IS NULL AND NEW.provider_id IS NOT NULL AND NEW.service_id IS NOT NULL THEN
    SELECT custom_price INTO v_price FROM public.provider_services WHERE provider_id = NEW.provider_id AND service_id = NEW.service_id;
  END IF;
  IF v_price IS NULL AND NEW.service_id IS NOT NULL THEN SELECT base_price INTO v_price FROM public.services WHERE id = NEW.service_id; END IF;
  IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'No valid price is available for this booking.' USING ERRCODE = '22023'; END IF;
  IF NOT v_from_sub AND NEW.service_id IS NOT NULL THEN
    SELECT price_min, price_max INTO v_min, v_max FROM public.services WHERE id = NEW.service_id;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND (v_price < v_min OR v_price > v_max) THEN
      RAISE EXCEPTION 'Price % is outside the allowed range % to %.', v_price, v_min, v_max USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.provider_amount := v_price; NEW.service_charge := v_price; NEW.platform_fee := 0; NEW.total_amount := v_price;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.enforce_provider_kyc_for_bookings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_kyc_status TEXT; v_status TEXT;
BEGIN
  IF NEW.provider_id IS NULL THEN RETURN NEW; END IF;
  SELECT kyc_status, status INTO v_kyc_status, v_status FROM public.service_providers WHERE id = NEW.provider_id;
  IF v_kyc_status IS DISTINCT FROM 'approved' OR v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Provider is not yet approved to accept bookings.'; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.enforce_wallet_before_accept() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_fee numeric; v_balance numeric; v_topup numeric;
BEGIN
  IF NEW.provider_id IS NULL OR OLD.status::text <> 'pending' OR NEW.status::text <> 'confirmed' THEN RETURN NEW; END IF;
  IF public.provider_launch_active(NEW.provider_id) THEN RETURN NEW; END IF;
  v_fee := public.fee_for_service_bill(COALESCE(NEW.provider_amount, 0));
  v_balance := public.wallet_balance(NEW.provider_id);
  IF v_balance < v_fee OR v_balance < 0 THEN
    v_topup := GREATEST(100, CEIL(v_fee - v_balance));
    RAISE EXCEPTION 'Wallet below the fee. Top up Rs % to accept.', v_topup USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.guard_booking_update() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_is_provider boolean; v_is_customer boolean; v_changed text[]; v_allowed text[];
  v_chat constant text[] := ARRAY['unread_messages_provider','unread_messages_customer','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  SELECT COALESCE(array_agg(COALESCE(n.key, o.key)), ARRAY[]::text[]) INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n FULL JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key WHERE n.value IS DISTINCT FROM o.value;
  IF cardinality(v_changed) = 0 THEN RETURN NEW; END IF;
  v_is_provider := v_uid IS NOT NULL AND OLD.provider_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = OLD.provider_id AND sp.user_id = v_uid);
  v_is_customer := v_uid IS NOT NULL AND v_uid::text IN (COALESCE(to_jsonb(OLD)->>'user_id', ''), COALESCE(to_jsonb(OLD)->>'customer_id', ''));
  IF v_is_provider THEN
    v_allowed := v_chat || ARRAY['status','started_at','provider_departed_at','provider_eta_minutes','tracking_active','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN RAISE EXCEPTION 'Providers cannot change these booking fields' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  IF v_is_customer THEN
    v_allowed := v_chat || ARRAY['status','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN RAISE EXCEPTION 'Customers cannot change these booking fields' USING ERRCODE = '42501'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status IN ('pending','confirmed') AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Customers can only cancel a pending or confirmed booking' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Not allowed to update this booking' USING ERRCODE = '42501';
END; $$;

CREATE FUNCTION public.notify_provider_on_new_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.provider_id IS NULL OR OLD.provider_id <> NEW.provider_id)) THEN
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (NEW.provider_id, 'new_booking', 'New Booking Request 📋', 'You have a new booking. Accept or decline it now.', jsonb_build_object('booking_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE FUNCTION public.notify_customer_on_booking_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_customer uuid := COALESCE(NEW.customer_id, NEW.user_id); v_actor uuid := auth.uid();
BEGIN
  IF v_customer IS NULL OR NEW.status::text IS NOT DISTINCT FROM OLD.status::text THEN RETURN NEW; END IF;
  IF v_actor IS NOT NULL AND v_actor = v_customer THEN RETURN NEW; END IF;
  IF NEW.status::text = 'confirmed' THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id) VALUES (v_customer, 'booking_confirmed', 'Booking confirmed', 'Your pro accepted the request.', NEW.id);
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.notify_provider_on_cancellation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data) VALUES (NEW.provider_id, 'booking_cancelled', 'Booking Cancelled', 'cancelled', jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.generate_booking_completion_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN INSERT INTO public.booking_completion_codes (booking_id, code) VALUES (NEW.id, lpad(floor(random() * 10000)::int::text, 4, '0')) ON CONFLICT (booking_id) DO NOTHING; RETURN NEW; END; $$;

CREATE FUNCTION public.log_provider_response() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status::text = 'pending' AND NEW.status::text = 'confirmed' AND NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_response_log VALUES (NEW.id, NEW.provider_id, 1) ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;

create trigger aa_sync_booking_owner before insert on bookings for each row execute function sync_booking_owner();
create trigger enforce_booking_price before insert on bookings for each row execute function enforce_booking_price();
create trigger enforce_provider_kyc_on_booking before insert or update on bookings for each row execute function enforce_provider_kyc_for_bookings();
create trigger enforce_wallet_before_accept before update on bookings for each row execute function enforce_wallet_before_accept();
create trigger notify_on_cancellation after update on bookings for each row execute function notify_provider_on_cancellation();
create trigger notify_on_new_booking after insert or update on bookings for each row execute function notify_provider_on_new_booking();
create trigger trg_generate_completion_code after insert on bookings for each row execute function generate_booking_completion_code();
create trigger trg_notify_customer_on_booking_change after update on bookings for each row execute function notify_customer_on_booking_change();
create trigger zz_guard_booking_update before update on bookings for each row execute function guard_booking_update();
create trigger zz_log_provider_response after update on bookings for each row when (old.status is distinct from new.status) execute function log_provider_response();

-- LIVE access rules on bookings (the ones that matter here)
alter table bookings enable row level security;
create policy bookings_customer_insert on bookings for insert to authenticated with check (customer_id = auth.uid());
create policy bookings_customer_select on bookings for select to authenticated using (customer_id = auth.uid() or user_id = auth.uid());
create policy bookings_provider_select on bookings for select to authenticated using (provider_id in (select id from service_providers where user_id = auth.uid()));
create policy bookings_customer_update on bookings for update to authenticated using (customer_id = auth.uid() or user_id = auth.uid()) with check (customer_id = auth.uid() or user_id = auth.uid());
create policy bookings_provider_update on bookings for update to authenticated using (provider_id in (select id from service_providers where user_id = auth.uid()));
grant select, insert, update on bookings to authenticated;
grant select on services, service_sub_items, service_providers to authenticated;
