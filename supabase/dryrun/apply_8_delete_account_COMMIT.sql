-- APPLY: DELETE-ACCOUNT FUNCTION FOR REAL. Ends with COMMIT. Run the dry run first.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal: an in-app "Delete account" (Google Play and Apple both require one). The app calls the edge function
-- `delete-account` (supabase/proposals/functions/delete-account/index.ts), which calls this function with the
-- service role and then removes the files and the sign-in.
--
-- What anonymise_account(user) does, in one transaction
--   * Refuses while the person has a booking in progress (pending, confirmed, on_the_way, arrived, in_progress).
--   * Erases personal data: profile name/phone/photo/address; for a pro also name, phone, email, photo, bio, bank and UPI
--     details, date of birth, the stored OTP, documents; the identity record (provider_kyc, which frees the Aadhaar and
--     PAN so they are not stuck); and their notifications. The pro is set inactive and offline.
--   * Keeps finished bookings, payments, reviews and disputes (the law, the fee record and open disputes need them) but
--     removes the name and phone from them. If a protective trigger refuses one of these scrubs, it is listed in
--     "warnings" and the rest still happens, so an admin can follow up.
--   * Only the service role can run it: nobody can call it from the app.
--
-- Owner decision needed: how long identity records must be kept by law. This version deletes provider_kyc at once;
-- if you must keep it, change the DELETE into setting a "deleted_at" flag and restricting access.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.anonymise_account(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider uuid;
  v_active   int;
  v_warnings text[] := '{}';
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'No user given.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_provider FROM public.service_providers WHERE user_id = p_user_id;

  SELECT count(*) INTO v_active FROM public.bookings
  WHERE (customer_id = p_user_id OR user_id = p_user_id OR (v_provider IS NOT NULL AND provider_id = v_provider))
    AND status::text IN ('pending', 'confirmed', 'on_the_way', 'arrived', 'in_progress');
  IF v_active > 0 THEN
    RAISE EXCEPTION 'You have % booking(s) in progress. Finish or cancel them first.', v_active USING ERRCODE = '22023';
  END IF;

  -- Lets the KYC guard trigger accept changes to protected columns made by this function only.
  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.profiles
     SET full_name = 'Deleted user', phone = NULL, avatar_url = NULL, address = NULL, city = NULL, pincode = NULL,
         phone_verified = false, phone_verified_at = NULL
   WHERE user_id = p_user_id;

  IF v_provider IS NOT NULL THEN
    UPDATE public.service_providers
       SET full_name = 'Deleted pro', name = 'Deleted pro', initials = NULL, first_name = NULL, last_name = NULL,
           phone = NULL, email = NULL, avatar_url = NULL, bio = NULL,
           bank_account_name = NULL, bank_account_number = NULL, bank_ifsc = NULL, upi_id = NULL,
           date_of_birth = NULL, documents = '{}'::jsonb, phone_otp = NULL, phone_otp_expires_at = NULL,
           phone_verified = false, city = NULL, pincodes = '{}', service_ids = '{}',
           status = 'inactive'::provider_status, is_online = false, is_available = false
     WHERE id = v_provider;
    DELETE FROM public.provider_kyc WHERE provider_id = v_provider;
    DELETE FROM public.provider_notifications WHERE provider_id = v_provider;
  END IF;

  DELETE FROM public.customer_notifications WHERE user_id = p_user_id;

  BEGIN
    UPDATE public.bookings SET customer_name = 'Deleted user', customer_phone = NULL WHERE customer_id = p_user_id OR user_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_warnings := v_warnings || ('bookings: ' || SQLERRM);
  END;
  BEGIN
    UPDATE public.reviews SET reviewer_name = 'A customer' WHERE customer_id = p_user_id OR user_id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_warnings := v_warnings || ('reviews: ' || SQLERRM);
  END;

  PERFORM set_config('kyc.internal_update', 'false', true);
  RETURN jsonb_build_object('provider_id', v_provider, 'warnings', to_jsonb(v_warnings));
END;
$$;

REVOKE ALL ON FUNCTION public.anonymise_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymise_account(uuid) TO service_role;

-- ─── ROLLBACK ───
-- DROP FUNCTION IF EXISTS public.anonymise_account(uuid);

SELECT 'DELETE ACCOUNT FUNCTION APPLIED' AS result;
COMMIT;
