-- =====================================================================================================================
-- PROPOSAL 20261125000002: drop the plain PAN and every Aadhaar column from provider_kyc       NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Last step of the KYC change (finding H3). Needs 20261125000001 applied AND the one-time script
-- supabase/proposals/scripts/kyc-migrate-pan.ts run with --apply (it encrypts every plain PAN and removes Aadhaar data
-- and files). This file REFUSES to run while any plain PAN or Aadhaar value is left, so nothing can be lost by
-- running it too early. Re-run safe (a second run finds the columns already gone).
-- After it: no Aadhaar is stored anywhere; the retention job stops deleting Aadhaar photos (there are none).
-- Rollback: the columns can be re-added empty (ALTER TABLE ... ADD COLUMN ...); their old values are gone for good.
-- =====================================================================================================================

DO $$
DECLARE v_left bigint := 0; col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['pan_number', 'aadhaar_last4', 'aadhaar_hash', 'aadhaar_front_path', 'aadhaar_back_path'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_kyc' AND column_name = col) THEN
      EXECUTE format('SELECT count(*) FROM public.provider_kyc WHERE %I IS NOT NULL', col) INTO v_left;
      IF v_left > 0 THEN
        RAISE EXCEPTION 'provider_kyc.% still has % value(s): run supabase/proposals/scripts/kyc-migrate-pan.ts --apply first', col, v_left;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.provider_kyc_pan_unique;
ALTER TABLE public.provider_kyc
  DROP COLUMN IF EXISTS pan_number,
  DROP COLUMN IF EXISTS aadhaar_last4,
  DROP COLUMN IF EXISTS aadhaar_hash,
  DROP COLUMN IF EXISTS aadhaar_front_path,
  DROP COLUMN IF EXISTS aadhaar_back_path;

UPDATE public.kyc_settings
   SET retention_doc_kinds = array_remove(array_remove(retention_doc_kinds, 'aadhaar_front'), 'aadhaar_back'),
       updated_at = now()
 WHERE id AND retention_doc_kinds && ARRAY['aadhaar_front', 'aadhaar_back'];

-- The provider OTP plain-code column (emptied by 20261125000000) goes too, once that proposal is applied.
DO $$
DECLARE v_plain bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_otp_codes' AND column_name = 'code_hash')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_otp_codes' AND column_name = 'otp_code') THEN
    EXECUTE 'SELECT count(*) FROM public.provider_otp_codes WHERE otp_code IS NOT NULL' INTO v_plain;
    IF v_plain = 0 THEN
      ALTER TABLE public.provider_otp_codes DROP COLUMN otp_code;
    END IF;
  END IF;
END $$;
