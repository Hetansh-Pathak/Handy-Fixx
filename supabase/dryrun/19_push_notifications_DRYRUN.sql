-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Owner decision 2026-10-29: push notifications to a CLOSED app (a pro gets a new request with the app shut; a customer gets
-- "your pro accepted / is on the way / started / done"). Expo's push service delivers them; this adds the two small tables
-- and the safe functions the apps and the server function need. Nothing existing is changed.
--
-- What this does
--   1. push_tokens: one row per phone (the Expo push token), owned by the signed-in account and its role. Nobody can read
--      another person's tokens; apps never write the table directly, only through the two functions below.
--   2. register_push_token(token, role, platform): the app calls it after sign-in. Checks the token's shape and that the
--      role matches the account (only a real pro can register as provider). A token that moves to another account (two people
--      sharing a phone) moves with it, so nobody gets someone else's alerts.
--   3. unregister_push_token(token): the app calls it when signing out. Removes only the caller's own token.
--   4. push_log: one row per alert sent, keyed by (audience, person, event, booking). The server inserts first and skips
--      the alert when the key already exists. This stops duplicates: the live database writes several notification rows per
--      booking event (161 "new booking" rows for 61 bookings), which would otherwise mean 2-3 phone alerts per request.
--      Old rows are removed daily when pg_cron exists. Only the service role (the server function) can use it.
--
-- The server function (supabase/proposals/functions/notify-push) and the two Database Webhooks are set up separately:
-- see docs/PUSH_SETUP.md. This SQL alone sends nothing.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('customer', 'provider')),
  platform    text NOT NULL DEFAULT 'android',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id, role);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own push tokens" ON public.push_tokens;
CREATE POLICY "Read own push tokens" ON public.push_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.push_tokens FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.push_tokens FROM authenticated;

CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_role text, p_platform text DEFAULT 'android')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '28000';
  END IF;
  IF p_token IS NULL OR p_token !~ '^Expo(nent)?PushToken\[[^\]\s]{10,}\]$' THEN
    RAISE EXCEPTION 'That is not a valid push token.' USING ERRCODE = '22023';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('customer', 'provider') THEN
    RAISE EXCEPTION 'Unknown role.' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'provider' AND NOT EXISTS (SELECT 1 FROM public.service_providers WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'This account is not a pro.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_tokens (token, user_id, role, platform, updated_at)
  VALUES (p_token, v_uid, p_role, COALESCE(NULLIF(left(p_platform, 20), ''), 'android'), now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id, role = EXCLUDED.role, platform = EXCLUDED.platform, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.push_log (
  dedupe_key  text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;      -- no policy: only the service role (the server function) can use it
REVOKE ALL ON public.push_log FROM anon, authenticated;

DO $cron$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-push-log';
    PERFORM cron.schedule('cleanup-push-log', '17 3 * * *', $$DELETE FROM public.push_log WHERE created_at < now() - interval '7 days'$$);
  ELSE
    RAISE NOTICE 'pg_cron is not installed: delete old push_log rows now and then (older than 7 days).';
  END IF;
END
$cron$;

-- Rollback:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-push-log';
--   DROP FUNCTION IF EXISTS public.unregister_push_token(text);
--   DROP FUNCTION IF EXISTS public.register_push_token(text, text, text);
--   DROP TABLE IF EXISTS public.push_log;
--   DROP TABLE IF EXISTS public.push_tokens;
SELECT to_regclass('public.push_tokens') IS NOT NULL AS tokens_table_ok, to_regprocedure('public.register_push_token(text,text,text)') IS NOT NULL AS register_ok, to_regclass('public.push_log') IS NOT NULL AS log_table_ok;
ROLLBACK;
