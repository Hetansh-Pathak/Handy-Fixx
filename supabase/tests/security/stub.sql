-- Live-like stub of the parts of the HandyFix database the security proposals touch (checked read-only 2026-10-31).
-- Objects marked LIVE copy the live definition (policies, grants, function bodies); the rest are minimal stand-ins.
-- Runs on a throwaway Postgres only (supabase/tests/security/test-security.mjs).

create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, confirmation_token text,
  confirmation_sent_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase gives anon/authenticated/service_role full table rights by default; RLS is the barrier (LIVE).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table public.user_roles (user_id uuid not null, role text not null, primary key (user_id, role));
alter table public.user_roles enable row level security;
create function public.has_role(p_user_id uuid, p_role text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.user_roles where user_id = p_user_id and role = p_role) $$;

create type provider_status as enum ('active','suspended','pending_approval','inactive');
create type booking_status as enum ('pending','confirmed','in_progress','completed','cancelled','on_the_way','arrived');
create type notification_type as enum ('new_booking','booking_cancelled','new_review','payment','system','kyc_submitted','kyc_approved','kyc_rejected');

create function public.update_updated_at_column() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- LIVE columns (subset that matters here) ----------------------------------------------------------------------------
create table public.service_providers (
  id uuid primary key default gen_random_uuid(), user_id uuid unique, full_name text, phone text, email text,
  status provider_status default 'active', is_online boolean default false, rating numeric, total_jobs int default 0,
  pincodes text[], service_ids uuid[], bank_account_name text, bank_account_number text, bank_ifsc text, upi_id text,
  experience_years int, bio text, is_verified boolean not null default false, is_email_verified boolean not null default false,
  verified_at timestamptz, phone_otp text, first_name text, last_name text, date_of_birth date,
  kyc_status text not null default 'not_submitted', kyc_rejection_reason text, kyc_submitted_at timestamptz,
  kyc_reviewed_at timestamptz, kyc_reviewed_by uuid, onboarding_step int default 1, city text,
  updated_at timestamptz default now());
alter table public.service_providers enable row level security;
-- LIVE policies
create policy "public_read_providers" on public.service_providers for select using (true);
create policy "Anyone can view active online providers" on public.service_providers for select using (status = 'active' and is_online = true);
create policy "Providers view own profile" on public.service_providers for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Providers update own profile" on public.service_providers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create view public.public_providers as
  select id, full_name, rating, is_online, kyc_status, status from public.service_providers sp
  where kyc_status = 'approved' and status = 'active';
grant select on public.public_providers to anon, authenticated;

-- LIVE: provider_kyc as created by 20261005000000 -------------------------------------------------------------------
create table public.provider_kyc (
  provider_id uuid primary key references public.service_providers(id) on delete cascade,
  aadhaar_last4 text, aadhaar_hash text unique, pan_number text, aadhaar_front_path text, aadhaar_back_path text,
  selfie_path text, pan_path text, certificate_path text, consent_accepted_at timestamptz, terms_version text default 'v1.0',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index provider_kyc_pan_unique on public.provider_kyc (pan_number) where pan_number is not null;
alter table public.provider_kyc enable row level security;
create policy "Providers view own KYC" on public.provider_kyc for select to authenticated
  using (provider_id in (select id from public.service_providers where user_id = auth.uid()));
create policy "Providers insert own KYC" on public.provider_kyc for insert to authenticated
  with check (provider_id in (select id from public.service_providers where user_id = auth.uid() and kyc_status in ('not_submitted','rejected')));
create policy "Providers update own KYC" on public.provider_kyc for update to authenticated
  using (provider_id in (select id from public.service_providers where user_id = auth.uid() and kyc_status in ('not_submitted','rejected')));
create policy "Admins view all KYC" on public.provider_kyc for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- LIVE: provider_otp_codes + its two client policies --------------------------------------------------------------------
create table public.provider_otp_codes (id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade, email text not null,
  otp_code text not null, expires_at timestamptz not null, verified boolean not null default false, created_at timestamptz not null default now());
alter table public.provider_otp_codes enable row level security;
create policy "providers can read their OTP codes" on public.provider_otp_codes for select to authenticated
  using (provider_id in (select id from public.service_providers where user_id = auth.uid()));
create policy "providers can create their OTP codes" on public.provider_otp_codes for insert to authenticated
  with check (provider_id in (select id from public.service_providers where user_id = auth.uid()));

create table public.customer_email_otps (id uuid primary key default gen_random_uuid(), user_id uuid, code_hash text);
alter table public.customer_email_otps enable row level security;
create table public.payout_requests (id uuid primary key default gen_random_uuid(), provider_id uuid, bank_account_number text);
alter table public.payout_requests enable row level security;

-- LIVE: notifications + the open insert policies ------------------------------------------------------------------------
create table public.provider_notifications (id uuid primary key default gen_random_uuid(), provider_id uuid not null,
  type notification_type not null, title text not null, message text not null, data jsonb, created_at timestamptz default now());
alter table public.provider_notifications enable row level security;
create policy "System can insert notifications" on public.provider_notifications for insert with check (true);
create policy "System inserts provider notifications" on public.provider_notifications for insert to authenticated with check (true);
create policy "allow_authenticated_insert_provider_notifications" on public.provider_notifications for insert to authenticated with check (true);
create policy "Providers can insert own notifications" on public.provider_notifications for insert
  with check (auth.uid() = (select user_id from public.service_providers where id = provider_notifications.provider_id));
create policy "Providers can view own notifications" on public.provider_notifications for select
  using (auth.uid() = (select user_id from public.service_providers where id = provider_notifications.provider_id));
create table public.customer_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text);
alter table public.customer_notifications enable row level security;
create policy "cust_notif_insert" on public.customer_notifications for insert to authenticated with check (true);
create policy "cust_notif_select" on public.customer_notifications for select to authenticated using (user_id = auth.uid());

-- LIVE: bookings with the trigger that inserted notifications as the caller -----------------------------------------------
create table public.bookings (id uuid primary key default gen_random_uuid(), customer_id uuid, user_id uuid,
  provider_id uuid references public.service_providers(id), status booking_status not null default 'pending',
  scheduled_date date, created_at timestamptz default now());
alter table public.bookings enable row level security;
create policy "bookings_customer_insert" on public.bookings for insert to authenticated with check (customer_id = auth.uid());
create policy "bookings_customer_select" on public.bookings for select to authenticated using (customer_id = auth.uid());
CREATE FUNCTION public.notify_provider_on_booking() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (NEW.provider_id, 'new_booking', 'New Booking Request',
            'You have a new booking request for ' || NEW.scheduled_date::text,
            jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$;
create trigger notify_provider_on_new_booking after insert on public.bookings for each row execute function public.notify_provider_on_booking();

-- LIVE: confirm_user_email (20260331000000) -----------------------------------------------------------------------------
CREATE FUNCTION public.confirm_user_email(user_email TEXT) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = auth, public AS $$
BEGIN
  UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()), confirmation_token = '',
    confirmation_sent_at = NULL, updated_at = now() WHERE email = user_email;
END;
$$;

-- Stand-ins with the live names/arguments --------------------------------------------------------------------------------
create function public.admin_approve_kyc(p_provider_id uuid) returns jsonb language plpgsql security definer set search_path = public as
  $$ begin if not public.has_role(auth.uid(), 'admin') then return jsonb_build_object('success', false); end if; return jsonb_build_object('success', true); end $$;
create function public.admin_reject_kyc(p_provider_id uuid, p_reason text) returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.admin_get_dashboard_counts() returns jsonb language sql security definer set search_path = public as $$ select '{}'::jsonb $$;
create function public.dispatch_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
  returns double precision language sql immutable as $$ select 0::double precision $$;
create function public.fee_for_service_bill(p_bill numeric) returns numeric language sql immutable as
  $$ select case when p_bill is null or p_bill <= 0 then 0 else least(50, greatest(5, round(p_bill * 0.03))) end $$;
create function public.wallet_tx_immutable() returns trigger language plpgsql as $$ begin return old; end $$;

-- Storage (enough of storage.objects / foldername for the KYC policies) --------------------------------------------------
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
  created_at timestamptz default now());
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
insert into storage.buckets values ('provider-kyc', 'provider-kyc', false);
-- LIVE storage policies for provider-kyc
create policy "Providers can upload KYC docs" on storage.objects for insert to authenticated with check (
  bucket_id = 'provider-kyc' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.service_providers where user_id = auth.uid() and kyc_status in ('not_submitted','rejected')));
create policy "Providers can read own KYC docs" on storage.objects for select to authenticated using (
  bucket_id = 'provider-kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Providers can delete own KYC docs" on storage.objects for delete to authenticated using (
  bucket_id = 'provider-kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Providers can update own KYC docs" on storage.objects for update to authenticated using (
  bucket_id = 'provider-kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Admins can read all KYC docs" on storage.objects for select to authenticated using (
  bucket_id = 'provider-kyc' and public.has_role(auth.uid(), 'admin'));
