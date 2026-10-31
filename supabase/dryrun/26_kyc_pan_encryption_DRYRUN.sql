-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- =====================================================================================================================
-- PROPOSAL 20261125000001: KYC data: PAN encrypted, no Aadhaar, access log, blocklist, photo retention   NOT APPLIED.
-- =====================================================================================================================
-- Finding H3 (docs/SECURITY_FINDINGS.md). Owner decisions 2026-10-31: collect PAN + selfie + bank/UPI name match; stop
-- collecting Aadhaar; store PAN only encrypted; keep the PAN card photo and the selfie; delete Aadhaar photos after
-- approval (unless on legal hold). Live submit_kyc / provider_kyc checked read-only 2026-10-31 (same as the repo).
--
-- What it does
--   1. provider_kyc gets pan_encrypted / pan_nonce / pan_key_version / pan_last4 / pan_blind_index (unique), the
--      phone and bank-account-name blind indexes, legal_hold. Encryption happens ONLY in the Edge Function kyc-pan
--      (AES-256-GCM, secret KYC_PAN_KEY); this file never sees a key.
--   2. Apps can read only harmless columns (pan_last4, document paths, consent) and write only document paths and
--      consent. The PAN columns, blind indexes, legal hold and every Aadhaar column are server-only (column grants
--      plus a trigger, so even a mistaken GRANT later cannot reopen them).
--   3. kyc_access_log (append-only: who viewed which KYC data, when), kyc_blocklist (HMAC hashes only), kyc_settings
--      (photo_retention_days = 30 PLACEHOLDER: confirm with a lawyer; which photo kinds the retention job deletes).
--   4. submit_kyc no longer asks for Aadhaar; it needs the encrypted PAN and a selfie and refuses blocklisted people.
--   5. Retention helpers for the Edge Function kyc-retention (deletes files through the Storage API, which SQL cannot).
--      A daily pg_cron job calls it IF pg_cron, pg_net and the vault secret 'kyc_retention_secret' exist.
--   6. The wizard loses its Aadhaar step (9 -> 8 steps): saved progress of drafts moves down one step, once.
--
-- Order: apply this -> deploy kyc-pan, kyc-admin-reveal-pan, kyc-retention -> ship the app build without Aadhaar
-- (older builds can no longer open the KYC wizard: they read pan_number / aadhaar columns) -> run
-- supabase/proposals/scripts/kyc-migrate-pan.ts (dry run, then --apply) -> proposal 20261125000002 drops the old columns.
-- Re-run safe. Rollback at the end.
-- =====================================================================================================================

-- ─── 6 (first, once): the wizard lost its Aadhaar step ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'provider_kyc' AND column_name = 'pan_blind_index') THEN
    PERFORM set_config('kyc.internal_update', 'true', true);
    UPDATE public.service_providers SET onboarding_step = onboarding_step - 1
     WHERE onboarding_step >= 4 AND kyc_status IN ('not_submitted', 'rejected');
  END IF;
END $$;

-- ─── 1. Columns ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.provider_kyc
  ADD COLUMN IF NOT EXISTS pan_encrypted          text,
  ADD COLUMN IF NOT EXISTS pan_nonce              text,
  ADD COLUMN IF NOT EXISTS pan_key_version        smallint,
  ADD COLUMN IF NOT EXISTS pan_last4              text,
  ADD COLUMN IF NOT EXISTS pan_blind_index        text,
  ADD COLUMN IF NOT EXISTS phone_blind_index      text,
  ADD COLUMN IF NOT EXISTS bank_name_blind_index  text,
  ADD COLUMN IF NOT EXISTS legal_hold             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason      text,
  ADD COLUMN IF NOT EXISTS photos_deleted_at      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_kyc_pan_cipher_shape') THEN
    ALTER TABLE public.provider_kyc ADD CONSTRAINT provider_kyc_pan_cipher_shape CHECK (
      (pan_encrypted IS NULL AND pan_nonce IS NULL AND pan_key_version IS NULL AND pan_blind_index IS NULL)
      OR (pan_encrypted IS NOT NULL AND pan_nonce IS NOT NULL AND pan_key_version IS NOT NULL
          AND pan_blind_index IS NOT NULL AND pan_last4 IS NOT NULL
          AND pan_nonce ~ '^[A-Za-z0-9+/]{16}$' AND pan_key_version >= 1
          AND pan_blind_index ~ '^[0-9a-f]{64}$' AND pan_last4 ~ '^[0-9]{3}[A-Z]$'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS provider_kyc_pan_blind_unique ON public.provider_kyc (pan_blind_index)
  WHERE pan_blind_index IS NOT NULL;

-- ─── 2. Who may read and write which column ────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.provider_kyc FROM PUBLIC, anon, authenticated;
GRANT SELECT (provider_id, pan_last4, selfie_path, pan_path, certificate_path, consent_accepted_at, terms_version,
              legal_hold, photos_deleted_at, created_at, updated_at) ON public.provider_kyc TO authenticated;
GRANT INSERT (provider_id, selfie_path, pan_path, certificate_path, consent_accepted_at, terms_version)
  ON public.provider_kyc TO authenticated;
GRANT UPDATE (provider_id, selfie_path, pan_path, certificate_path, consent_accepted_at, terms_version)
  ON public.provider_kyc TO authenticated;
GRANT ALL ON public.provider_kyc TO service_role;

-- Belt and braces: whatever the grants say later, signed-in callers cannot set server-only columns.
CREATE OR REPLACE FUNCTION public.protect_kyc_server_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  k text;
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY ARRAY['pan_number', 'pan_encrypted', 'pan_nonce', 'pan_key_version', 'pan_last4', 'pan_blind_index',
                           'phone_blind_index', 'bank_name_blind_index', 'legal_hold', 'legal_hold_reason',
                           'photos_deleted_at', 'aadhaar_last4', 'aadhaar_hash', 'aadhaar_front_path', 'aadhaar_back_path'] LOOP
    IF (v_new -> k) IS DISTINCT FROM (v_old -> k)
       AND NOT (TG_OP = 'INSERT' AND (v_new -> k IS NULL OR v_new -> k = 'null'::jsonb OR (k = 'legal_hold' AND v_new -> k = 'false'::jsonb))) THEN
      RAISE EXCEPTION 'This KYC detail can only be saved by HandyFix (%).', k USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_kyc_server_columns ON public.provider_kyc;
CREATE TRIGGER protect_kyc_server_columns BEFORE INSERT OR UPDATE ON public.provider_kyc
  FOR EACH ROW EXECUTE FUNCTION public.protect_kyc_server_columns();

-- ─── 3. Access log, blocklist, settings ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_access_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,                 -- auth user id of the admin (NULL = the system, e.g. the retention job)
  provider_id uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('view_pan', 'view_document', 'retention_delete', 'blocklist_add', 'legal_hold')),
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_access_log_provider ON public.kyc_access_log (provider_id, created_at DESC);
ALTER TABLE public.kyc_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyc_access_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.kyc_access_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kyc_access_log TO authenticated;
DROP POLICY IF EXISTS kyc_access_log_admin_read ON public.kyc_access_log;
CREATE POLICY kyc_access_log_admin_read ON public.kyc_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.kyc_access_log_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'kyc_access_log is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS kyc_access_log_append_only ON public.kyc_access_log;
CREATE TRIGGER kyc_access_log_append_only BEFORE UPDATE OR DELETE ON public.kyc_access_log
  FOR EACH ROW EXECUTE FUNCTION public.kyc_access_log_append_only();

CREATE TABLE IF NOT EXISTS public.kyc_blocklist (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('pan', 'phone', 'bank_account_name')),
  value_hash text NOT NULL CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  reason     text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value_hash)
);
ALTER TABLE public.kyc_blocklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyc_blocklist FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.kyc_blocklist_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kyc_blocklist TO authenticated;
DROP POLICY IF EXISTS kyc_blocklist_admin_read ON public.kyc_blocklist;
CREATE POLICY kyc_blocklist_admin_read ON public.kyc_blocklist FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.kyc_settings (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- PLACEHOLDER 30: confirm the number of days with a lawyer before relying on it.
  photo_retention_days integer NOT NULL DEFAULT 30 CHECK (photo_retention_days BETWEEN 1 AND 3650),
  -- Photo kinds deleted that many days after approval. Owner 2026-10-31: keep the PAN card photo and the selfie.
  retention_doc_kinds  text[] NOT NULL DEFAULT ARRAY['aadhaar_front', 'aadhaar_back']
    CHECK (retention_doc_kinds <@ ARRAY['aadhaar_front', 'aadhaar_back', 'pan', 'selfie', 'certificate']),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.kyc_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.kyc_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyc_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kyc_settings TO authenticated;
DROP POLICY IF EXISTS kyc_settings_admin_read ON public.kyc_settings;
CREATE POLICY kyc_settings_admin_read ON public.kyc_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin: log a document view (the admin app calls this before opening a signed URL; client-reported, see the PAN
-- reveal for the server-enforced log).
CREATE OR REPLACE FUNCTION public.log_kyc_document_view(p_provider_id uuid, p_document text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  IF p_document NOT IN ('selfie', 'pan', 'certificate', 'aadhaar_front', 'aadhaar_back') THEN
    RAISE EXCEPTION 'Unknown document' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.kyc_access_log (actor_id, provider_id, action, detail) VALUES (auth.uid(), p_provider_id, 'view_document', p_document);
END $$;
REVOKE ALL ON FUNCTION public.log_kyc_document_view(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_kyc_document_view(uuid, text) TO authenticated;

-- Admin: copy a pro's own blind indexes into the blocklist (no secret needed: the hashes are already stored).
CREATE OR REPLACE FUNCTION public.admin_blocklist_provider(p_provider_id uuid, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.provider_kyc%ROWTYPE; n integer := 0; c integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Give a reason' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM public.provider_kyc WHERE provider_id = p_provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No KYC record for this pro' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.kyc_blocklist (kind, value_hash, reason, created_by)
  SELECT x.kind, x.h, btrim(p_reason), auth.uid()
    FROM (VALUES ('pan', v.pan_blind_index), ('phone', v.phone_blind_index), ('bank_account_name', v.bank_name_blind_index)) x(kind, h)
   WHERE x.h IS NOT NULL
  ON CONFLICT (kind, value_hash) DO NOTHING;
  GET DIAGNOSTICS c = ROW_COUNT; n := c;
  INSERT INTO public.kyc_access_log (actor_id, provider_id, action, detail) VALUES (auth.uid(), p_provider_id, 'blocklist_add', btrim(p_reason));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_blocklist_provider(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_blocklist_provider(uuid, text) TO authenticated;

-- Admin: put a pro's documents on legal hold (or release them). Logged.
CREATE OR REPLACE FUNCTION public.admin_set_kyc_legal_hold(p_provider_id uuid, p_hold boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501'; END IF;
  IF p_hold AND (p_reason IS NULL OR length(btrim(p_reason)) < 3) THEN RAISE EXCEPTION 'Give a reason' USING ERRCODE = '22023'; END IF;
  UPDATE public.provider_kyc SET legal_hold = p_hold, legal_hold_reason = CASE WHEN p_hold THEN btrim(p_reason) END
   WHERE provider_id = p_provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No KYC record for this pro' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.kyc_access_log (actor_id, provider_id, action, detail)
  VALUES (auth.uid(), p_provider_id, 'legal_hold', CASE WHEN p_hold THEN 'on: ' || btrim(p_reason) ELSE 'off' END);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_kyc_legal_hold(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc_legal_hold(uuid, boolean, text) TO authenticated;

-- Server: is any of these hashes blocklisted? (used by kyc-pan and submit_kyc)
CREATE OR REPLACE FUNCTION public.kyc_blocklist_hit(p_pan text, p_phone text, p_bank_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.kyc_blocklist b
                  WHERE (b.kind = 'pan' AND b.value_hash = p_pan)
                     OR (b.kind = 'phone' AND b.value_hash = p_phone)
                     OR (b.kind = 'bank_account_name' AND b.value_hash = p_bank_name));
$$;
REVOKE ALL ON FUNCTION public.kyc_blocklist_hit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_blocklist_hit(text, text, text) TO service_role;

-- ─── 4. submit_kyc without Aadhaar (live body, three checks changed) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_kyc()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_provider_id UUID;
  v_kyc         public.provider_kyc%ROWTYPE;
  v_sp          public.service_providers%ROWTYPE;
BEGIN
  SELECT * INTO v_sp FROM public.service_providers WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider profile not found.');
  END IF;
  v_provider_id := v_sp.id;

  IF v_sp.kyc_status NOT IN ('not_submitted', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'KYC is already ' || v_sp.kyc_status || '.');
  END IF;
  IF v_sp.first_name IS NULL OR trim(v_sp.first_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'First name is required.');
  END IF;
  IF v_sp.last_name IS NULL OR trim(v_sp.last_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Last name is required.');
  END IF;
  IF v_sp.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Date of birth is required.');
  END IF;
  IF date_part('year', age(v_sp.date_of_birth)) < 18 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider must be at least 18 years old.');
  END IF;
  IF v_sp.pincodes IS NULL OR array_length(v_sp.pincodes, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one service city is required.');
  END IF;
  IF v_sp.service_ids IS NULL OR array_length(v_sp.service_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one profession is required.');
  END IF;

  SELECT * INTO v_kyc FROM public.provider_kyc WHERE provider_id = v_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'KYC data not found. Please complete all steps.');
  END IF;
  -- (Aadhaar is no longer collected: owner decision 2026-10-31.)
  IF v_kyc.selfie_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selfie required.');
  END IF;
  IF v_kyc.pan_encrypted IS NULL OR v_kyc.pan_blind_index IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAN details required.');
  END IF;
  IF v_kyc.pan_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Photo of the PAN card required.');
  END IF;
  IF v_kyc.consent_accepted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Consent is required.');
  END IF;
  IF public.kyc_blocklist_hit(v_kyc.pan_blind_index, v_kyc.phone_blind_index, v_kyc.bank_name_blind_index) THEN
    RETURN jsonb_build_object('success', false, 'error', 'We cannot accept this application. Please contact HandyFix support.');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers
  SET kyc_status       = 'pending',
      kyc_submitted_at = now(),
      full_name        = trim(v_sp.first_name) || ' ' || trim(v_sp.last_name)
  WHERE id = v_provider_id;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
      EXECUTE 'INSERT INTO public.provider_notifications (provider_id, type, title, message, data) VALUES ($1, $2::public.notification_type, $3, $4, $5)'
      USING v_provider_id, 'kyc_submitted', 'Application submitted ✅', 'Your verification application has been submitted. We will review it within 1–2 working days.', jsonb_build_object('kyc_status', 'pending');
    ELSE
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (v_provider_id, 'kyc_submitted', 'Application submitted ✅', 'Your verification application has been submitted. We will review it within 1–2 working days.', jsonb_build_object('kyc_status', 'pending'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_kyc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_kyc() TO authenticated, service_role;

-- ─── 5. Retention (photo deletion runs in the Edge Function kyc-retention) ─────────────────────────────────────────
-- Rows whose photos are due: approved more than photo_retention_days ago, not on legal hold, with at least one
-- configured photo kind still stored. Columns are read through to_jsonb so this keeps working after 20261125000002
-- drops the Aadhaar columns.
CREATE OR REPLACE FUNCTION public.kyc_retention_due(p_limit integer DEFAULT 100)
RETURNS TABLE (provider_id uuid, paths text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (SELECT photo_retention_days, retention_doc_kinds FROM public.kyc_settings WHERE id),
  r AS (
    SELECT k.provider_id,
           ARRAY(SELECT to_jsonb(k) ->> (kind || '_path') FROM s, unnest(s.retention_doc_kinds) kind
                  WHERE to_jsonb(k) ->> (kind || '_path') IS NOT NULL) AS paths
      FROM public.provider_kyc k
      JOIN public.service_providers sp ON sp.id = k.provider_id, s
     WHERE sp.kyc_status = 'approved'
       AND sp.kyc_reviewed_at IS NOT NULL
       AND sp.kyc_reviewed_at < now() - make_interval(days => s.photo_retention_days)
       AND NOT k.legal_hold)
  SELECT r.provider_id, r.paths FROM r WHERE cardinality(r.paths) > 0
  ORDER BY r.provider_id LIMIT greatest(1, least(p_limit, 500));
$$;
REVOKE ALL ON FUNCTION public.kyc_retention_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_retention_due(integer) TO service_role;

-- After the files are deleted: clears exactly those paths (only if still the same, still not on hold), logs it.
CREATE OR REPLACE FUNCTION public.kyc_retention_mark_done(p_provider_id uuid, p_paths text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE kind text; col text; n integer := 0; c integer; v_hold boolean;
BEGIN
  SELECT legal_hold INTO v_hold FROM public.provider_kyc WHERE provider_id = p_provider_id FOR UPDATE;
  IF NOT FOUND OR v_hold THEN RETURN 0; END IF;
  FOREACH kind IN ARRAY ARRAY['aadhaar_front', 'aadhaar_back', 'pan', 'selfie', 'certificate'] LOOP
    col := kind || '_path';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_kyc' AND column_name = col) THEN
      EXECUTE format('UPDATE public.provider_kyc SET %I = NULL WHERE provider_id = $1 AND %I = ANY ($2)', col, col)
        USING p_provider_id, p_paths;
      GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
    END IF;
  END LOOP;
  IF n > 0 THEN
    UPDATE public.provider_kyc SET photos_deleted_at = now() WHERE provider_id = p_provider_id;
    INSERT INTO public.kyc_access_log (actor_id, provider_id, action, detail)
    VALUES (NULL, p_provider_id, 'retention_delete', n || ' photo(s)');
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.kyc_retention_mark_done(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kyc_retention_mark_done(uuid, text[]) TO service_role;

-- Daily call of the kyc-retention function at 03:15 IST (21:45 UTC). Only when everything it needs exists.
CREATE OR REPLACE FUNCTION public.kyc_retention_kick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_secret text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''kyc_retention_secret'' LIMIT 1' INTO v_secret;
  IF v_secret IS NULL OR v_secret = '' THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := ''{}''::jsonb, headers := $2, timeout_milliseconds := 30000)'
    USING 'https://jviwwhjwtyneqrguumro.supabase.co/functions/v1/kyc-retention',
          jsonb_build_object('Content-Type', 'application/json', 'x-retention-secret', v_secret);
END $$;
REVOKE ALL ON FUNCTION public.kyc_retention_kick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kyc-retention';
    PERFORM cron.schedule('kyc-retention', '45 21 * * *', 'SELECT public.kyc_retention_kick()');
  END IF;
END $$;

-- =====================================================================================================================
-- ROLLBACK
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kyc-retention';
--   Re-create submit_kyc from supabase/migrations/provider/20261005000000_kyc_onboarding.sql (section 9) and
--   GRANT SELECT, INSERT, UPDATE ON public.provider_kyc TO authenticated; DROP TRIGGER protect_kyc_server_columns ...;
--   (old app builds then work again). The new columns and tables are harmless to keep; dropping pan_encrypted loses
--   the only copy of any PAN saved after the migration script ran.
-- =====================================================================================================================

-- ─── CHECK (every column must be true) ───
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_kyc' AND column_name = 'pan_blind_index') AS blind_index_column,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'provider_kyc_pan_blind_unique') AS blind_index_unique,
  NOT has_column_privilege('authenticated', 'public.provider_kyc', 'pan_encrypted', 'select') AS apps_cannot_read_pan_cipher,
  NOT has_column_privilege('authenticated', 'public.provider_kyc', 'pan_number', 'select') AS apps_cannot_read_plain_pan,
  to_regclass('public.kyc_access_log') IS NOT NULL AS access_log,
  to_regclass('public.kyc_blocklist') IS NOT NULL AS blocklist,
  (SELECT photo_retention_days = 30 FROM public.kyc_settings WHERE id) AS retention_placeholder_30_days,
  (to_regnamespace('cron') IS NULL OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kyc-retention')) AS retention_job_scheduled,
  pg_get_functiondef('public.submit_kyc'::regproc) NOT LIKE '%Aadhaar details required%' AS submit_kyc_without_aadhaar;
ROLLBACK;
