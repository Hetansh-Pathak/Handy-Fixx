-- ============================================================
-- DOCUMENTATION ONLY — DO NOT RUN (snapshot of live schema)
-- ============================================================
-- This file documents the actual live schema for the four tables
-- that differ from the original migrations. It is kept here for
-- traceability. No ALTER or CREATE statements should be applied
-- from this file unless you are rebuilding from scratch.
-- ============================================================

-- TABLE: profiles
-- PK    : id (uuid, auto-generated)
-- FK    : user_id → auth.users.id  (unique, not null)
-- Notes : display_name has been removed; full_name used instead.
--         phone_verified + phone_verified_at added for OTP flow.
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           text,
  phone               text,
  avatar_url          text,
  address             text,
  city                text,
  pincode             text,
  phone_verified      boolean DEFAULT false,
  phone_verified_at   timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- TABLE: bookings
-- Notes : customer_id (not user_id) is the FK to auth.users.
--         platform_fee default has been dropped (see migration 20261002000001).
--         latitude/longitude added for GPS location tracking.
--         coupon_code / coupon_discount / final_amount added for coupon system.
CREATE TABLE IF NOT EXISTS public.bookings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid REFERENCES auth.users(id),
  provider_id               uuid REFERENCES public.service_providers(id),
  service_id                uuid NOT NULL REFERENCES public.services(id),
  status                    text NOT NULL DEFAULT 'pending',
  booking_date              date,
  booking_time              time,
  scheduled_date            date,
  scheduled_time            time,
  address                   text NOT NULL,
  city                      text,
  pincode                   text,
  description               text,
  special_instructions      text,
  total_amount              numeric NOT NULL DEFAULT 0,
  platform_fee              numeric NOT NULL,   -- default removed
  provider_amount           numeric NOT NULL DEFAULT 0,
  service_charge            numeric,
  latitude                  numeric,
  longitude                 numeric,
  sub_item_id               uuid,
  sub_item_name             text,
  customer_name             text,
  customer_phone            text,
  coupon_code               text,
  coupon_discount           numeric,
  final_amount              numeric,
  payment_status            text,
  user_id                   uuid,              -- legacy column, prefer customer_id
  tracking_active           boolean,
  provider_lat              numeric,
  provider_lng              numeric,
  provider_location_lat     numeric,
  provider_location_lng     numeric,
  provider_eta_minutes      integer,
  provider_departed_at      timestamptz,
  started_at                timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  cancellation_reason       text,
  last_location_update      timestamptz,
  unread_messages_customer  integer DEFAULT 0,
  unread_messages_provider  integer DEFAULT 0,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- TABLE: reviews
-- Notes : customer_id is NOT NULL (required for RLS insert policy).
--         user_id is nullable (also checked by some RLS policies — set both on insert).
CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL UNIQUE REFERENCES public.bookings(id),
  customer_id    uuid NOT NULL,
  provider_id    uuid NOT NULL REFERENCES public.service_providers(id),
  rating         integer NOT NULL,
  comment        text,
  reviewer_name  text,
  service_name   text,
  user_id        uuid,
  created_at     timestamptz DEFAULT now()
);

-- TABLE: customer_notifications
-- Notes : user_id → auth.users.id (consistent with customer_notifications RLS).
CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  message     text NOT NULL,
  booking_id  uuid REFERENCES public.bookings(id),
  is_read     boolean NOT NULL DEFAULT false,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);
