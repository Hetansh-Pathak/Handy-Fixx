-- =====================================================================================================================
-- PROPOSAL 20261125000000: security hardening before the VAPT                               NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Findings: docs/SECURITY_FINDINGS.md (C1, C2, C3, H1, M1, M4, L1), checked read-only on the live project 2026-10-31.
-- Independent of every other proposal. Re-run safe. Changes no fee, dispatch, booking or wallet logic.
--
--   1. C1  Pros' rows (phone, email, DOB, bank details) were readable by anyone: drop the two open SELECT policies.
--          Customers read the public_providers view; pros read their own row; admins keep their policies.
--   2. C2  confirm_user_email(text) (SECURITY DEFINER, confirms any email): nobody but the database owner may call it.
--   3. C3  Provider email OTP: clients can no longer read or write provider_otp_codes; plain codes are removed; new
--          columns for the HMAC + salt + attempts + lock + single use; two service-role helpers (atomic attempt,
--          rate limit). Deploy supabase/proposals/functions/send-provider-otp and verify-provider-otp RIGHT AFTER this
--          (the old deployed functions keep working on the old column until then).
--   4. H1  Notifications: the one trigger function that inserted as the caller becomes SECURITY DEFINER, then the
--          four "anyone may insert" policies go.
--   5. M1  KYC photos: a pro may replace or delete their own files only while the application is a draft or rejected.
--   6. M4  Nothing signed-out may run admin or KYC functions; anon loses its grants on sensitive tables.
--   7. L1  Fixed search_path on five helper functions (no logic change).
--
-- Rollback (section by section): see the end of this file.
-- =====================================================================================================================

-- ─── 1. C1: pros' rows are not public ───────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_providers" ON public.service_providers;
DROP POLICY IF EXISTS "Anyone can view active online providers" ON public.service_providers;

-- ─── 2. C2: confirm_user_email ──────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.confirm_user_email(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.confirm_user_email(text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ─── 3. C3: provider email OTP ──────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "providers can create their OTP codes" ON public.provider_otp_codes;
DROP POLICY IF EXISTS "providers can read their OTP codes" ON public.provider_otp_codes;
ALTER TABLE public.provider_otp_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_otp_codes FROM anon, authenticated;

ALTER TABLE public.provider_otp_codes
  ADD COLUMN IF NOT EXISTS code_hash   text,
  ADD COLUMN IF NOT EXISTS salt        text,
  ADD COLUMN IF NOT EXISTS attempts    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip_hash     text;
-- Plain codes: unused codes are thrown away (they live 10 minutes), used ones keep their row without the code.
-- (20261125000002 drops the otp_code column later, so every statement that names it is guarded: re-run safe.)
DELETE FROM public.provider_otp_codes WHERE verified IS NOT TRUE AND code_hash IS NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'provider_otp_codes' AND column_name = 'otp_code') THEN
    ALTER TABLE public.provider_otp_codes ALTER COLUMN otp_code DROP NOT NULL;
    UPDATE public.provider_otp_codes SET otp_code = NULL WHERE otp_code IS NOT NULL;
  END IF;
END $$;

-- One row per send, keyed by an HMAC of the account, the email or the IP (never the raw value). Service role only.
CREATE TABLE IF NOT EXISTS public.otp_rate_events (
  id         bigserial PRIMARY KEY,
  scope      text NOT NULL CHECK (scope ~ '^[a-z_:]{1,40}$'),
  key_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_rate_events_lookup ON public.otp_rate_events (scope, key_hash, created_at DESC);
ALTER TABLE public.otp_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_rate_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.otp_rate_events_id_seq FROM PUBLIC, anon, authenticated;

-- Counts the events in the window for EVERY key first; records one event per key only when all are under the limit.
-- Returns 0 when allowed, otherwise the seconds to wait. Locks per scope+key so two parallel sends cannot both pass.
CREATE OR REPLACE FUNCTION public.otp_rate_take(p_scope text, p_keys text[], p_window_seconds integer, p_max integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE k text; v_count integer; v_oldest timestamptz; v_wait integer := 0;
BEGIN
  IF p_window_seconds < 1 OR p_max < 1 OR coalesce(cardinality(p_keys), 0) = 0 THEN
    RAISE EXCEPTION 'bad rate limit arguments' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY p_keys LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || '|' || k, 0));
  END LOOP;
  FOREACH k IN ARRAY p_keys LOOP
    SELECT count(*), min(created_at) INTO v_count, v_oldest FROM public.otp_rate_events
     WHERE scope = p_scope AND key_hash = k AND created_at > now() - make_interval(secs => p_window_seconds);
    IF v_count >= p_max THEN
      v_wait := greatest(v_wait, ceil(extract(epoch FROM (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer, 1);
    END IF;
  END LOOP;
  IF v_wait > 0 THEN RETURN v_wait; END IF;
  INSERT INTO public.otp_rate_events (scope, key_hash) SELECT p_scope, unnest(p_keys);
  DELETE FROM public.otp_rate_events WHERE created_at < now() - interval '2 days';
  RETURN 0;
END $$;
REVOKE ALL ON FUNCTION public.otp_rate_take(text, text[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_rate_take(text, text[], integer, integer) TO service_role;

-- Takes ONE attempt on the provider's newest live code, atomically (parallel guesses cannot share an attempt).
-- Returns the hash + salt to compare, or a status: none | expired | locked | used.
CREATE OR REPLACE FUNCTION public.provider_otp_take_attempt(p_provider_id uuid, p_max_attempts integer)
RETURNS TABLE (status text, otp_id uuid, code_hash text, salt text, email text, attempts_left integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.provider_otp_codes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.provider_otp_codes c
   WHERE c.provider_id = p_provider_id AND c.code_hash IS NOT NULL
   ORDER BY c.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'none'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, 0; RETURN; END IF;
  IF r.consumed_at IS NOT NULL OR r.verified THEN
    RETURN QUERY SELECT 'used'::text, r.id, NULL::text, NULL::text, NULL::text, 0; RETURN;
  END IF;
  IF r.locked_at IS NOT NULL OR r.attempts >= p_max_attempts THEN
    UPDATE public.provider_otp_codes SET locked_at = coalesce(locked_at, now()) WHERE id = r.id;
    RETURN QUERY SELECT 'locked'::text, r.id, NULL::text, NULL::text, NULL::text, 0; RETURN;
  END IF;
  IF r.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, r.id, NULL::text, NULL::text, NULL::text, 0; RETURN;
  END IF;
  UPDATE public.provider_otp_codes SET attempts = attempts + 1,
         locked_at = CASE WHEN attempts + 1 >= p_max_attempts THEN now() END
   WHERE id = r.id;
  RETURN QUERY SELECT 'ok'::text, r.id, r.code_hash, r.salt, r.email, p_max_attempts - r.attempts - 1;
END $$;
REVOKE ALL ON FUNCTION public.provider_otp_take_attempt(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_otp_take_attempt(uuid, integer) TO service_role;

-- Single use: succeeds once per code (also after the attempt that locked it, if that attempt was right).
CREATE OR REPLACE FUNCTION public.provider_otp_consume(p_otp_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH u AS (
    UPDATE public.provider_otp_codes SET consumed_at = now(), verified = true
     WHERE id = p_otp_id AND consumed_at IS NULL AND verified IS NOT TRUE AND expires_at > now()
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u);
$$;
REVOKE ALL ON FUNCTION public.provider_otp_consume(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_otp_consume(uuid) TO service_role;

-- ─── 4. H1: notifications are written by the database, not by callers ──────────────────────────────────────────────
-- The live trigger notify_provider_on_new_booking (on bookings) calls this function, which ran as the customer and
-- needed the open INSERT policy. Same body, now runs as its owner.
DO $$
BEGIN
  IF to_regprocedure('public.notify_provider_on_booking()') IS NOT NULL THEN
    ALTER FUNCTION public.notify_provider_on_booking() SECURITY DEFINER SET search_path TO 'public';
    REVOKE ALL ON FUNCTION public.notify_provider_on_booking() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
DROP POLICY IF EXISTS "System can insert notifications" ON public.provider_notifications;
DROP POLICY IF EXISTS "System inserts provider notifications" ON public.provider_notifications;
DROP POLICY IF EXISTS "allow_authenticated_insert_provider_notifications" ON public.provider_notifications;
DROP POLICY IF EXISTS "cust_notif_insert" ON public.customer_notifications;

-- ─── 5. M1: KYC photos are frozen once submitted ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Providers can update own KYC docs" ON storage.objects;
  DROP POLICY IF EXISTS "Providers can delete own KYC docs" ON storage.objects;
  CREATE POLICY "Providers can update own KYC docs" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'provider-kyc' AND (storage.foldername(name))[1] = auth.uid()::text
           AND EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.user_id = auth.uid()
                        AND sp.kyc_status IN ('not_submitted', 'rejected')))
    WITH CHECK (bucket_id = 'provider-kyc' AND (storage.foldername(name))[1] = auth.uid()::text);
  CREATE POLICY "Providers can delete own KYC docs" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'provider-kyc' AND (storage.foldername(name))[1] = auth.uid()::text
           AND EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.user_id = auth.uid()
                        AND sp.kyc_status IN ('not_submitted', 'rejected')));
END $$;

-- ─── 6. M4: nothing signed-out runs admin/KYC functions or touches sensitive tables ────────────────────────────────
DO $$
DECLARE f text; t text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.admin_approve_kyc(uuid)', 'public.admin_reject_kyc(uuid,text)',
                           'public.admin_get_dashboard_counts()', 'public.submit_kyc()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['provider_kyc', 'provider_otp_codes', 'customer_email_otps', 'customer_otp_codes',
                           'customer_email_verifications', 'admin_users', 'admin_activity_log', 'admin_audit_log',
                           'user_roles', 'payout_requests'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ─── 7. L1: fixed search_path (no logic change) ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.dispatch_events_append_only()',
                           'public.dispatch_km(double precision,double precision,double precision,double precision)',
                           'public.fee_for_service_bill(numeric)', 'public.reset_booking_extras_on_insert()',
                           'public.wallet_tx_immutable()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path TO ''public''', f);
    END IF;
  END LOOP;
END $$;

-- =====================================================================================================================
-- ROLLBACK (only if something breaks; each line undoes one section)
--   1. CREATE POLICY "public_read_providers" ON public.service_providers FOR SELECT USING (true);   -- re-opens C1!
--   2. GRANT EXECUTE ON FUNCTION public.confirm_user_email(text) TO authenticated;                  -- re-opens C2!
--   3. Redeploy the old OTP functions; the old code needs: GRANT SELECT, INSERT ON public.provider_otp_codes TO
--      authenticated; plus its two policies (see supabase/migrations/provider/20260917100000_*). New columns/table harmless.
--   4. CREATE POLICY "System inserts provider notifications" ON public.provider_notifications FOR INSERT TO authenticated
--      WITH CHECK (true);  ALTER FUNCTION public.notify_provider_on_booking() SECURITY INVOKER;
--   5. Re-create the two storage policies without the kyc_status condition.
--   6. GRANT EXECUTE ON FUNCTION ... TO anon; GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO anon;
--   7. ALTER FUNCTION ... RESET search_path;
-- =====================================================================================================================
