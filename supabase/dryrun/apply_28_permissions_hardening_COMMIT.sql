-- APPLY (saves). Run 28_permissions_hardening_DRYRUN.sql first. Then check the customer app, the Pro app and the admin site still work (see docs/SECURITY_CHANGES.md).
BEGIN;
-- =====================================================================================================================
-- PROPOSAL 20261125000003: table, function and storage permissions                         NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Findings: docs/SECURITY_FINDINGS.md (M3 in part, M4 in full, M5, L2, L5, L6, plus two ownership gaps found while
-- reading every live policy on 2026-11-01). Checked read-only on the live project: every grant, every policy, every
-- function. Independent of the other 20261125 proposals. Re-run safe. Changes no fee, dispatch, booking or wallet logic.
--
-- Why this is possible: the apps send every signed-out visitor to the sign-in screen, and all data calls come from signed-in
-- users ("authenticated"). So the "anon" role (what the public key alone gives you) needs almost nothing.
--
--   1. TABLES   anon keeps SELECT on the public catalogue tables, INSERT on the two public forms, SELECT on public_providers;
--               nothing else (before: ALL on every table, with row-level security as the only barrier). No-one but the
--               owner keeps TRUNCATE / REFERENCES / TRIGGER. New tables are no longer readable by anon by default.
--   2. FUNCTIONS anon can call no function. Trigger functions (45 of them) can be called by nobody (a trigger does not need
--               EXECUTE at fire time). Signed-in users keep exactly the functions they had, except provider_launch_active
--               (an internal helper that told anyone whether a given pro is in the fee-free launch period).
--   3. BOOKINGS a booking can only be created for yourself: customer_id and user_id must both be you. Before, the open
--               "users_own_bookings_insert" rule let a user create a booking whose customer_id was SOMEONE ELSE, which then
--               appeared in that person's list (spam, and a notification to the pro).
--   4. ATTACHMENTS photos / voice notes can only be added to your own booking. Before, any signed-in user could attach a file
--               to any booking id, and the booking's pro could then open it.
--   5. STORAGE  size limits on the two booking buckets (10 MB, the app's own limit); booking-attachments also only accepts the
--               13 photo / audio types the app stores.
--   6. LEFTOVER customer_otp_codes (an old phone-OTP table no code uses) is closed to signed-in users.
--
-- Not in this file (already written, apply separately): chat 20261110 (anyone could post into any chat) and reviews
-- 20261108 (fake reviews); both match the live policy names.
-- Rollback at the end.
-- =====================================================================================================================

-- ─── 1. Tables ───────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  -- Public catalogue data (read only). The two forms below are the only things a signed-out visitor may write.
  v_read   text[] := ARRAY['services', 'service_sub_items', 'provider_services', 'provider_service_pricing',
                           'provider_availability', 'reviews', 'pincode_city_map', 'public_providers'];
  v_insert text[] := ARRAY['contact_messages', 'pro_applications'];
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    IF r.relname = ANY (v_read) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', r.relname);
    ELSIF r.relname = ANY (v_insert) THEN
      EXECUTE format('GRANT INSERT ON public.%I TO anon', r.relname);
    END IF;
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', r.relname);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- New objects: no automatic access for anon. (supabase_admin's defaults belong to a role the SQL editor cannot change.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- PostgreSQL also gives every NEW function to PUBLIC (everyone, so anon too). Signed-in users and the server keep
-- their own explicit default grants for this schema; a future function that anon really needs must be granted by hand.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN NULL;
END $$;

-- ─── 2. Functions ────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_auth boolean;
BEGIN
  FOR r IN SELECT p.oid, p.prorettype, p.proname, pg_get_function_identity_arguments(p.oid) AS args
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    v_auth := has_function_privilege('authenticated', r.oid, 'execute');
    IF r.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
      IF v_auth THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
      END IF;
    END IF;
  END LOOP;
END $$;

-- An internal helper (called from other server functions, which run as the owner), not an app function.
DO $$
BEGIN
  IF to_regprocedure('public.provider_launch_active(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.provider_launch_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.provider_launch_active(uuid, uuid) TO service_role;
  END IF;
END $$;

-- ─── 3. Bookings are created only for yourself ─────────────────────────────────────────────────────────────────────
-- RESTRICTIVE: it is ANDed with the existing permissive rules, so none of them can be used to book for someone else.
-- (The BEFORE INSERT trigger sync_booking_owner fills customer_id / user_id from each other first, so an app that sends
-- only one of them still passes.)
DROP POLICY IF EXISTS "bookings insert only as yourself" ON public.bookings;
CREATE POLICY "bookings insert only as yourself" ON public.bookings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((customer_id IS NULL OR customer_id = auth.uid()) AND (user_id IS NULL OR user_id = auth.uid()));

-- ─── 4. Attachments only on your own booking ───────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attachments only on your own booking" ON public.booking_attachments;
CREATE POLICY "attachments only on your own booking" ON public.booking_attachments AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b
                       WHERE b.id = booking_attachments.booking_id AND (b.customer_id = auth.uid() OR b.user_id = auth.uid())));

-- ─── 5. Storage limits ───────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  -- 10 MB = the app's own limit (ATTACHMENT_LIMITS). Types = exactly the ones the app can store.
  UPDATE storage.buckets
     SET file_size_limit = 10485760,
         allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                                    'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm',
                                    'audio/ogg', 'audio/3gpp']
   WHERE id = 'booking-attachments';
  -- Bill photos: size only (the picker reports some image types under several names).
  UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'booking-extras';
END $$;

-- ─── 6. Leftover phone-OTP table ─────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.customer_otp_codes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "users_manage_own_otp" ON public.customer_otp_codes;
    REVOKE ALL ON public.customer_otp_codes FROM anon, authenticated;
  END IF;
END $$;

-- =====================================================================================================================
-- ROLLBACK (each line undoes one section)
--   1. GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;   -- re-opens it
--      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;  (same for SEQUENCES / FUNCTIONS)
--      ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   2. GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;  GRANT EXECUTE ON FUNCTION public.provider_launch_active(uuid,uuid) TO authenticated;
--   3. DROP POLICY "bookings insert only as yourself" ON public.bookings;
--   4. DROP POLICY "attachments only on your own booking" ON public.booking_attachments;
--   5. UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id IN ('booking-attachments', 'booking-extras');
--   6. CREATE POLICY "users_manage_own_otp" ON public.customer_otp_codes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--      GRANT ALL ON public.customer_otp_codes TO authenticated;
-- =====================================================================================================================

COMMIT;
