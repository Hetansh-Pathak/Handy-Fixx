-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix: availability time-order check + server-side keyed Aadhaar hashing.
-- Additive, idempotent. NOT run against any database here — apply on staging first.
--
-- 1. provider_availability had no database check that end_time > start_time.
--    validateRange() in the provider app enforces this in the UI, but nothing
--    stopped a direct API call from inserting a backwards or zero-length range.
--
-- 2. provider_kyc.aadhaar_hash was computed client-side with ONE hardcoded salt
--    shared by every provider (in provider-app/src/lib/constants.ts, shipped to
--    the browser). Aadhaar numbers are a small, checksum-constrained 12-digit
--    space, so a fixed public salt gives almost no protection: anyone who ever
--    reads that column (a compromised admin account, a backup leak, a future
--    RLS bug) could brute-force every hash back to a real Aadhaar number in
--    seconds. The column is also UNIQUE, used to catch the same person signing
--    up as two different providers — that need for a *deterministic* hash is
--    exactly why a per-row random salt can't be the fix (same number, same
--    salt would be required, which just moves the same weakness).
--
--    Fix: hash server-side with HMAC-SHA256 keyed by a secret that never
--    leaves the database. The client sends the raw Aadhaar number over TLS
--    to this RPC (it already did, implicitly, since the number was typed into
--    the browser and used there); the RPC computes the hash and writes it,
--    the plaintext is never stored, and the key is not derivable from the
--    hash the way a client-visible salt was.
--
-- ─── REQUIRED MANUAL STEP ─────────────────────────────────────────────────
-- Before relying on this, set a real secret key once, from the SQL editor
-- (NOT from any app code), and keep a copy somewhere safe (e.g. your
-- password manager) — losing it breaks duplicate-Aadhaar detection going
-- forward, though it does not expose or corrupt any stored data:
--
--   ALTER DATABASE postgres SET app.aadhaar_hmac_key = '<a long random string>';
--
-- Generate one with, e.g.: openssl rand -base64 48
-- Then reconnect (or start a new session) before calling submit_aadhaar_kyc().
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. provider_availability: forbid end_time <= start_time ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'provider_availability'
      AND constraint_name = 'provider_availability_time_order'
  ) THEN
    ALTER TABLE public.provider_availability
      ADD CONSTRAINT provider_availability_time_order CHECK (end_time > start_time);
  END IF;
END $$;

-- Existing rows that already violate this (shouldn't exist, given the UI, but
-- the whole point is that we can't be sure) are left as-is: adding a CHECK
-- does not retroactively touch existing rows unless you ALTER ... VALIDATE.
-- Surface them so you can see what, if anything, needs a manual look:
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.provider_availability WHERE end_time <= start_time;
  IF v_bad > 0 THEN
    RAISE NOTICE 'provider_availability: % existing row(s) have end_time <= start_time and were NOT auto-fixed. Review manually: select * from public.provider_availability where end_time <= start_time;', v_bad;
  END IF;
END $$;

-- ─── 2. provider_kyc: server-side keyed Aadhaar hash ─────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing hashes were computed with a single hardcoded client-side salt, which
-- is not meaningfully different from no salt. They are not trustworthy as a
-- secret and are cleared so nothing relies on their strength; last-4 (not
-- sensitive on its own) and all document paths are kept. A provider whose hash
-- is cleared is unaffected day-to-day — kyc_status, review, and everything
-- else about their account is untouched — but they will need to resubmit the
-- Aadhaar number once (the submit_aadhaar_kyc RPC below) for duplicate
-- detection to cover them again. The affected rows are logged, not deleted.
DO $$
DECLARE v_weak int;
BEGIN
  SELECT count(*) INTO v_weak FROM public.provider_kyc WHERE aadhaar_hash IS NOT NULL;
  IF v_weak > 0 THEN
    RAISE NOTICE 'provider_kyc: clearing % existing aadhaar_hash value(s) hashed with the old shared client-side salt. Affected providers should re-enter their Aadhaar number once.', v_weak;
  END IF;
END $$;
UPDATE public.provider_kyc SET aadhaar_hash = NULL WHERE aadhaar_hash IS NOT NULL;

-- RPC: provider submits their own Aadhaar number; hashed here, never stored raw.
-- Replaces client-side hashAadhaar() + the provider_kyc upsert of aadhaar_hash.
CREATE OR REPLACE FUNCTION public.submit_aadhaar_kyc(p_aadhaar text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider uuid;
  v_key      text;
  v_hash     text;
  v_last4    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF p_aadhaar IS NULL OR p_aadhaar !~ '^[0-9]{12}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_format');
  END IF;

  SELECT id INTO v_provider FROM public.service_providers WHERE user_id = auth.uid();
  IF v_provider IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_provider');
  END IF;

  v_key := current_setting('app.aadhaar_hmac_key', true);
  IF v_key IS NULL OR v_key = '' THEN
    -- Fails closed: no key configured means no hash can be computed. See the
    -- REQUIRED MANUAL STEP above — without it this RPC always returns this.
    RETURN jsonb_build_object('ok', false, 'reason', 'not_configured');
  END IF;

  v_last4 := right(p_aadhaar, 4);
  v_hash  := encode(hmac(p_aadhaar, v_key, 'sha256'), 'hex');

  BEGIN
    INSERT INTO public.provider_kyc (provider_id, aadhaar_last4, aadhaar_hash)
    VALUES (v_provider, v_last4, v_hash)
    ON CONFLICT (provider_id) DO UPDATE
      SET aadhaar_last4 = EXCLUDED.aadhaar_last4,
          aadhaar_hash  = EXCLUDED.aadhaar_hash,
          updated_at    = now();
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_aadhaar');
  END;

  RETURN jsonb_build_object('ok', true, 'last4', v_last4);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_aadhaar_kyc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_aadhaar_kyc(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
