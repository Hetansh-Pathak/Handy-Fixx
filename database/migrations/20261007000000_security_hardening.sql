-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Security hardening (idempotent, safe to re-run)
--   1. OTP tables: no client access, hashed codes, attempt counter
--   2. public_providers view: add columns the customer app needs
--   3. Drop leftover "read everything" policies on service_providers
--   4. Pin search_path on every SECURITY DEFINER function in public
--   5. customer_notifications: enable RLS + owner-only policies
-- Apply AFTER all earlier migrations. Deploy the updated edge functions
-- (send-provider-otp / verify-provider-otp) in the same release: old versions
-- of those two functions will stop working once otp_code is dropped.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. provider_otp_codes: server-only table ───────────────────────────────
-- Previously providers could SELECT their own plaintext code and INSERT rows,
-- which let them bypass email verification entirely.
DROP POLICY IF EXISTS "providers can read their OTP codes"   ON public.provider_otp_codes;
DROP POLICY IF EXISTS "providers can create their OTP codes" ON public.provider_otp_codes;

-- Existing rows hold plaintext codes; they are short-lived, so just invalidate them.
DELETE FROM public.provider_otp_codes;

ALTER TABLE public.provider_otp_codes
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS attempts  int NOT NULL DEFAULT 0;
ALTER TABLE public.provider_otp_codes DROP COLUMN IF EXISTS otp_code;
ALTER TABLE public.provider_otp_codes ALTER COLUMN code_hash SET NOT NULL;

ALTER TABLE public.provider_otp_codes ENABLE ROW LEVEL SECURITY;  -- no policies on purpose
REVOKE ALL ON public.provider_otp_codes FROM anon, authenticated;

-- Same belt-and-braces for the customer table (already policy-less).
ALTER TABLE public.customer_email_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_email_otps FROM anon, authenticated;

-- ─── 2. public_providers view ───────────────────────────────────────────────
-- Customer pages read `name`, `city` and `updated_at` (the 90s online-heartbeat check). New columns MUST be appended at the end
-- for CREATE OR REPLACE VIEW to work.
CREATE OR REPLACE VIEW public.public_providers AS
SELECT
  sp.id,
  sp.full_name,
  sp.avatar_url,
  sp.bio,
  sp.rating,
  sp.total_reviews,
  sp.total_jobs,
  sp.experience_years,
  sp.pincodes,
  sp.service_ids,
  sp.is_online,
  sp.is_verified,
  sp.is_email_verified,
  sp.status,
  sp.kyc_status,
  sp.created_at,
  sp.name,
  sp.city,
  sp.updated_at
FROM public.service_providers sp
WHERE sp.kyc_status = 'approved'
  AND sp.status     = 'active';

GRANT SELECT ON public.public_providers TO authenticated, anon;

-- ─── 3. Remove legacy open-read policies on service_providers ───────────────
-- Any of these still present would expose phone/email/bank/KYC columns.
DROP POLICY IF EXISTS "Anyone can read providers"       ON public.service_providers;
DROP POLICY IF EXISTS "public_read_providers"           ON public.service_providers;
DROP POLICY IF EXISTS "Public limited provider view"    ON public.service_providers;

-- ─── 4. Pin search_path on SECURITY DEFINER functions ───────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not pin search_path on %: %', r.sig, SQLERRM;
    END;
  END LOOP;
END $$;

-- ─── 5. customer_notifications: owner-only access ───────────────────────────
-- Inserts happen inside SECURITY DEFINER functions/triggers, so no INSERT policy.
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_notifs_select_own" ON public.customer_notifications;
CREATE POLICY "customer_notifs_select_own" ON public.customer_notifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer_notifs_update_own" ON public.customer_notifications;
CREATE POLICY "customer_notifs_update_own" ON public.customer_notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer_notifs_delete_own" ON public.customer_notifications;
CREATE POLICY "customer_notifs_delete_own" ON public.customer_notifications
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ─── Verification (run manually after applying) ─────────────────────────────
-- Tables in public with RLS disabled (expect zero rows):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
-- SECURITY DEFINER functions still missing search_path (expect zero rows):
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef
--     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
-- Remaining policies on service_providers:
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='service_providers';
-- As anon (Dashboard → API docs, or curl with the anon key), expect [] :
--   GET /rest/v1/service_providers?select=*
--   GET /rest/v1/provider_otp_codes?select=*
