-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Connects the database to the notify-push function (deployed 2026-10-29): when HandyFix writes a row into
-- provider_notifications or customer_notifications, the database calls the function, which sends the phone alert.
-- This is the same thing the dashboard's "Database Webhooks" page sets up, done in one paste. It needs the proposal
-- 20261120 (push tokens) applied first, otherwise the function simply finds no phone and does nothing.
--
-- THE SECRET (you do this yourself; it must never be written into a file or a chat)
--   1. Choose a long random value (30+ characters, letters and digits).
--   2. Supabase > Edge Functions > Secrets: add PUSH_WEBHOOK_SECRET with that value.
--   3. Supabase > SQL Editor, run ONCE with your own value:
--        SELECT vault.create_secret('<your long random value>', 'push_webhook_secret');
--      (The vault stores it encrypted. To change it later, update the vault entry and the Edge Function secret together.)
--   Until step 3 is done this proposal sends nothing: with no vault secret the trigger returns immediately.
--
-- What this does
--   1. Installs pg_net (the small extension that lets the database call a web address, asynchronously).
--   2. push_webhook(): a trigger function that reads the secret from the vault and posts the new row to the function.
--      It returns the row untouched and swallows every error, so a problem here can NEVER stop a booking, a message or any
--      other notification from being saved.
--   3. One AFTER INSERT trigger on each of provider_notifications and customer_notifications.
--
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.push_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;   -- not configured yet: do nothing
  END IF;

  PERFORM net.http_post(
    url := 'https://jviwwhjwtyneqrguumro.supabase.co/functions/v1/notify-push',
    body := jsonb_build_object('type', 'INSERT', 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', to_jsonb(NEW)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;     -- an alert problem must never block saving the notification (or the booking behind it)
END;
$$;

REVOKE ALL ON FUNCTION public.push_webhook() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_webhook ON public.provider_notifications;
CREATE TRIGGER push_webhook AFTER INSERT ON public.provider_notifications
  FOR EACH ROW EXECUTE FUNCTION public.push_webhook();

DROP TRIGGER IF EXISTS push_webhook ON public.customer_notifications;
CREATE TRIGGER push_webhook AFTER INSERT ON public.customer_notifications
  FOR EACH ROW EXECUTE FUNCTION public.push_webhook();

-- Rollback (stops all alerts; nothing else changes):
--   DROP TRIGGER IF EXISTS push_webhook ON public.provider_notifications;
--   DROP TRIGGER IF EXISTS push_webhook ON public.customer_notifications;
--   DROP FUNCTION IF EXISTS public.push_webhook();
--   (the vault secret and pg_net can stay)
SELECT to_regprocedure('public.push_webhook()') IS NOT NULL AS function_ok, (SELECT count(*) FROM pg_trigger WHERE tgname = 'push_webhook' AND NOT tgisinternal) = 2 AS two_triggers, EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') AS pg_net_ok;
ROLLBACK;
