-- Run in the Supabase SQL editor (read-only). Anything listed below deserves a look.
-- 1. Tables in public with Row Level Security OFF (anyone with the anon key can read/write them)
SELECT c.relname AS table_without_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1;

-- 2. Policies that allow everything (USING true / WITH CHECK true), especially for writes or the anon role
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
ORDER BY cmd = 'SELECT', tablename;

-- 3. Write privileges granted to anon/authenticated on the money tables (should be none for the ones below)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('provider_earnings','payout_requests','booking_completion_codes','provider_otp_codes','customer_email_otps')
  AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY 2, 1, 3;

-- 4. Tables the migrations never create (created by hand in the dashboard): messages, provider_locations.
--    Check their policies explicitly: a booking's chat/location must only be visible to its customer + provider.
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('messages','provider_locations');

-- 5. Storage buckets that are public
SELECT id, name, public FROM storage.buckets ORDER BY public DESC, name;
