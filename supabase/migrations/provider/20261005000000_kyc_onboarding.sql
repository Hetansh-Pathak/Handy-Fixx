-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Manual KYC Onboarding
-- Migration 1: Core schema, RPCs, security hardening
-- Idempotent: safe to run multiple times
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Notification Enum Extension ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    BEGIN
      ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'kyc_submitted';
    EXCEPTION WHEN OTHERS THEN END;
    BEGIN
      ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'kyc_approved';
    EXCEPTION WHEN OTHERS THEN END;
    BEGIN
      ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'kyc_rejected';
    EXCEPTION WHEN OTHERS THEN END;
  END IF;
END $$;

-- ─── 1. Admin role system ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view roles" ON public.user_roles;
CREATE POLICY "Admins can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Helper: has_role(uid, role_name)
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = p_role
  );
$$;

-- ─── 2. Add KYC columns to service_providers ─────────────────────────────────
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS first_name        TEXT,
  ADD COLUMN IF NOT EXISTS last_name         TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE,
  ADD COLUMN IF NOT EXISTS kyc_status        TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS onboarding_step   INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_verified       BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. Grandfather existing active providers ──────────────────────────────
UPDATE public.service_providers
SET kyc_status  = 'approved',
    is_verified = true,
    kyc_reviewed_at = now()
WHERE status = 'active'
  AND kyc_status = 'not_submitted';

-- ─── 4. Sensitive KYC data table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_kyc (
  provider_id         UUID PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  aadhaar_last4       TEXT,
  aadhaar_hash        TEXT UNIQUE,          -- salted SHA-256 for duplicate detection
  pan_number          TEXT,                 -- stored as-is, RLS-protected; shown masked in UI
  aadhaar_front_path  TEXT,
  aadhaar_back_path   TEXT,
  selfie_path         TEXT,
  pan_path            TEXT,
  certificate_path    TEXT,
  consent_accepted_at TIMESTAMPTZ,
  terms_version       TEXT DEFAULT 'v1.0',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER update_provider_kyc_updated_at
  BEFORE UPDATE ON public.provider_kyc
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.provider_kyc ENABLE ROW LEVEL SECURITY;

-- Provider can view/manage their own KYC only while editable
DROP POLICY IF EXISTS "Providers view own KYC" ON public.provider_kyc;
CREATE POLICY "Providers view own KYC" ON public.provider_kyc
  FOR SELECT TO authenticated
  USING (provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Providers insert own KYC" ON public.provider_kyc;
CREATE POLICY "Providers insert own KYC" ON public.provider_kyc
  FOR INSERT TO authenticated
  WITH CHECK (
    provider_id IN (
      SELECT id FROM public.service_providers
      WHERE user_id = auth.uid()
        AND kyc_status IN ('not_submitted', 'rejected')
    )
  );

DROP POLICY IF EXISTS "Providers update own KYC" ON public.provider_kyc;
CREATE POLICY "Providers update own KYC" ON public.provider_kyc
  FOR UPDATE TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.service_providers
      WHERE user_id = auth.uid()
        AND kyc_status IN ('not_submitted', 'rejected')
    )
  );

-- Admins can view all KYC records
DROP POLICY IF EXISTS "Admins view all KYC" ON public.provider_kyc;
CREATE POLICY "Admins view all KYC" ON public.provider_kyc
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 5. Unique index on PAN (where filled) ───────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS provider_kyc_pan_unique
  ON public.provider_kyc (pan_number)
  WHERE pan_number IS NOT NULL;

-- ─── 6. Security: prevent providers from self-updating privileged columns ─────
CREATE OR REPLACE FUNCTION public.prevent_privileged_column_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Allow updates triggered internally by RPCs (e.g. submit_kyc, admin_approve_kyc)
  IF current_setting('kyc.internal_update', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only enforce for non-admin users
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status              IS DISTINCT FROM OLD.status              THEN
    RAISE EXCEPTION 'Cannot change status directly. Use admin RPC.';
  END IF;
  IF NEW.kyc_status          IS DISTINCT FROM OLD.kyc_status          THEN
    RAISE EXCEPTION 'Cannot change kyc_status directly. Use submit_kyc() RPC.';
  END IF;
  IF NEW.kyc_rejection_reason IS DISTINCT FROM OLD.kyc_rejection_reason THEN
    RAISE EXCEPTION 'Cannot change kyc_rejection_reason.';
  END IF;
  IF NEW.kyc_reviewed_at     IS DISTINCT FROM OLD.kyc_reviewed_at     THEN
    RAISE EXCEPTION 'Cannot change kyc_reviewed_at.';
  END IF;
  IF NEW.kyc_reviewed_by     IS DISTINCT FROM OLD.kyc_reviewed_by     THEN
    RAISE EXCEPTION 'Cannot change kyc_reviewed_by.';
  END IF;
  IF NEW.is_verified         IS DISTINCT FROM OLD.is_verified         THEN
    RAISE EXCEPTION 'Cannot change is_verified.';
  END IF;
  IF NEW.rating              IS DISTINCT FROM OLD.rating              THEN
    RAISE EXCEPTION 'Cannot change rating directly.';
  END IF;
  IF NEW.total_jobs          IS DISTINCT FROM OLD.total_jobs          THEN
    RAISE EXCEPTION 'Cannot change total_jobs directly.';
  END IF;
  IF NEW.total_reviews       IS DISTINCT FROM OLD.total_reviews       THEN
    RAISE EXCEPTION 'Cannot change total_reviews directly.';
  END IF;
  IF NEW.total_earnings      IS DISTINCT FROM OLD.total_earnings      THEN
    RAISE EXCEPTION 'Cannot change total_earnings directly.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privileged_column_update ON public.service_providers;
CREATE TRIGGER prevent_privileged_column_update
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_column_update();

-- ─── 7. Enforce: provider cannot set is_online=true unless approved ───────────
CREATE OR REPLACE FUNCTION public.enforce_kyc_before_online()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Skip if not trying to go online or already approved
  IF NEW.is_online IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF OLD.kyc_status = 'approved' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;
  IF NEW.kyc_status = 'approved' AND NEW.status = 'active' THEN
    RETURN NEW;
  END IF;
  -- Block: set is_online to false silently (do not raise, just override)
  NEW.is_online := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_kyc_before_online ON public.service_providers;
CREATE TRIGGER enforce_kyc_before_online
  BEFORE UPDATE OF is_online ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kyc_before_online();

-- ─── 8. Enforce: booking can only be assigned to approved provider ─────────────
CREATE OR REPLACE FUNCTION public.enforce_provider_kyc_for_bookings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kyc_status TEXT;
  v_status     TEXT;
BEGIN
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT kyc_status, status INTO v_kyc_status, v_status
  FROM public.service_providers
  WHERE id = NEW.provider_id;

  IF v_kyc_status IS DISTINCT FROM 'approved' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Provider is not yet approved to accept bookings.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_provider_kyc_on_booking ON public.bookings;
CREATE TRIGGER enforce_provider_kyc_on_booking
  BEFORE INSERT OR UPDATE OF provider_id, status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_kyc_for_bookings();

-- ─── 9. RPC: submit_kyc — provider calls this, validates and transitions state ─
CREATE OR REPLACE FUNCTION public.submit_kyc()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider_id UUID;
  v_kyc         public.provider_kyc%ROWTYPE;
  v_sp          public.service_providers%ROWTYPE;
BEGIN
  -- Find the provider row for the calling user
  SELECT * INTO v_sp FROM public.service_providers WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider profile not found.');
  END IF;

  v_provider_id := v_sp.id;

  IF v_sp.kyc_status NOT IN ('not_submitted', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'KYC is already ' || v_sp.kyc_status || '.');
  END IF;

  -- Validate required fields on service_providers
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

  -- Validate KYC documents
  SELECT * INTO v_kyc FROM public.provider_kyc WHERE provider_id = v_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'KYC data not found. Please complete all steps.');
  END IF;
  IF v_kyc.aadhaar_front_path IS NULL AND v_kyc.aadhaar_last4 IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aadhaar details required.');
  END IF;
  IF v_kyc.selfie_path IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selfie required.');
  END IF;
  IF v_kyc.pan_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAN details required.');
  END IF;
  IF v_kyc.consent_accepted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Consent is required.');
  END IF;

  -- Allow internal update flag for trigger
  PERFORM set_config('kyc.internal_update', 'true', true);

  -- Transition to pending
  UPDATE public.service_providers
  SET kyc_status       = 'pending',
      kyc_submitted_at = now(),
      full_name        = trim(v_sp.first_name) || ' ' || trim(v_sp.last_name)
  WHERE id = v_provider_id;

  -- Insert submission notification safely (compatible with both enum and text type column)
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
$$;

-- ─── 10. Admin RPC: approve KYC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_kyc(p_provider_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized.');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET kyc_status       = 'approved',
      status           = 'active',
      is_verified      = true,
      kyc_reviewed_at  = now(),
      kyc_reviewed_by  = auth.uid(),
      kyc_rejection_reason = NULL
  WHERE id = p_provider_id
    AND kyc_status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found or not in pending state.');
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
      EXECUTE 'INSERT INTO public.provider_notifications (provider_id, type, title, message, data) VALUES ($1, $2::public.notification_type, $3, $4, $5)'
      USING p_provider_id, 'kyc_approved', 'Application Approved 🎉', 'Congratulations! Your verification has been approved. You can now receive bookings.', jsonb_build_object('kyc_status', 'approved');
    ELSE
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (p_provider_id, 'kyc_approved', 'Application Approved 🎉', 'Congratulations! Your verification has been approved. You can now receive bookings.', jsonb_build_object('kyc_status', 'approved'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 11. Admin RPC: reject KYC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_kyc(p_provider_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized.');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required.');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET kyc_status            = 'rejected',
      kyc_rejection_reason  = p_reason,
      kyc_reviewed_at       = now(),
      kyc_reviewed_by       = auth.uid()
  WHERE id = p_provider_id
    AND kyc_status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found or not in pending state.');
  END IF;

  -- Reset KYC data record to allow edits again
  UPDATE public.provider_kyc
  SET consent_accepted_at = NULL
  WHERE provider_id = p_provider_id;

  BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
      EXECUTE 'INSERT INTO public.provider_notifications (provider_id, type, title, message, data) VALUES ($1, $2::public.notification_type, $3, $4, $5)'
      USING p_provider_id, 'kyc_rejected', 'Application Needs Revision', 'Your verification needs some changes: ' || p_reason || '. Please review and resubmit.', jsonb_build_object('kyc_status', 'rejected', 'reason', p_reason);
    ELSE
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (p_provider_id, 'kyc_rejected', 'Application Needs Revision', 'Your verification needs some changes: ' || p_reason || '. Please review and resubmit.', jsonb_build_object('kyc_status', 'rejected', 'reason', p_reason));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 12. Update RLS: notifications — allow system/trigger to INSERT for any provider
DROP POLICY IF EXISTS "System inserts provider notifications" ON public.provider_notifications;
CREATE POLICY "System inserts provider notifications" ON public.provider_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── 13. Enable realtime on service_providers for live KYC status updates ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_providers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_providers;
  END IF;
END $$;
