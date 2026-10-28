-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (HandyFix-complete.pdf p.4-5): customers can sort pros by "Nearest".
--
-- Today there is no pro position a customer may read: provider_locations only exists for a booking in
-- progress, and only the customer of that booking can read it. Customers must not see an exact position
-- of a pro who is not on their job.
--
-- What this does
--   1. Adds approx_latitude / approx_longitude to service_providers. The Pro app writes the pro's area
--      ROUNDED TO 2 DECIMALS (about 1 km) while the pro is online, and clears it when the pro goes offline.
--      A check constraint keeps the numbers inside real latitude/longitude ranges.
--   2. Adds the two columns at the END of the public_providers view (the view customers already read), so
--      nothing that reads it today changes. The view still shows only approved, active pros.
--
-- What it does NOT do: change any policy. A pro already updates their own row; customers already read the view.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS approx_latitude  numeric(7,4),
  ADD COLUMN IF NOT EXISTS approx_longitude numeric(8,4);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_providers_approx_location_chk') THEN
    ALTER TABLE public.service_providers
      ADD CONSTRAINT service_providers_approx_location_chk CHECK (
        (approx_latitude IS NULL AND approx_longitude IS NULL)
        OR (approx_latitude BETWEEN -90 AND 90 AND approx_longitude BETWEEN -180 AND 180)
      );
  END IF;
END $$;

CREATE OR REPLACE VIEW public.public_providers AS
 SELECT id,
    full_name,
    full_name AS name,
    avatar_url,
    bio,
    rating,
    total_reviews,
    total_jobs,
    experience_years,
    pincodes,
    service_ids,
    is_online,
    is_verified,
    is_email_verified,
    status,
    kyc_status,
    city,
    created_at,
    updated_at,
    approx_latitude,
    approx_longitude
   FROM public.service_providers sp
  WHERE kyc_status = 'approved'::text AND status = 'active'::provider_status;

-- ─── ROLLBACK ───
-- CREATE OR REPLACE VIEW cannot drop columns, so drop and recreate the view without the two columns:
-- DROP VIEW public.public_providers;
-- CREATE VIEW public.public_providers AS SELECT id, full_name, full_name AS name, avatar_url, bio, rating, total_reviews,
--   total_jobs, experience_years, pincodes, service_ids, is_online, is_verified, is_email_verified, status, kyc_status, city,
--   created_at, updated_at FROM public.service_providers sp WHERE kyc_status = 'approved'::text AND status = 'active'::provider_status;
-- (then re-grant select on it to anon and authenticated exactly as before)
-- ALTER TABLE public.service_providers DROP COLUMN approx_latitude, DROP COLUMN approx_longitude;

-- ─── CHECK (dry run only; rolled back) ───
SELECT 'view has the new columns' AS check_name,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='public_providers' AND column_name IN ('approx_latitude','approx_longitude')) AS found, 2 AS expected;

ROLLBACK;
