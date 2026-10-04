-- ============================================================
-- Migration: Completion Codes + Attachment Policy Fixes
-- Date:      2026-10-04
-- Apply in:  Supabase SQL editor (paste entire file)
-- Idempotent: yes (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ── 1. booking_completion_codes table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_completion_codes (
  booking_id      uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  code            text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- ── 2. Enable RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.booking_completion_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "customer_select_own_code"   ON public.booking_completion_codes;
DROP POLICY IF EXISTS "provider_NO_access_codes"   ON public.booking_completion_codes;

-- ONLY the booking's customer can SELECT their code
CREATE POLICY "customer_select_own_code"
  ON public.booking_completion_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_completion_codes.booking_id
        AND b.customer_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE policy for anyone (only SECURITY DEFINER functions can write)
-- Providers intentionally have NO access

-- ── 3. Trigger: auto-generate code on booking INSERT ─────────────────────────
CREATE OR REPLACE FUNCTION public.generate_booking_completion_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.booking_completion_codes (booking_id, code)
  VALUES (
    NEW.id,
    lpad(floor(random() * 10000)::int::text, 4, '0')
  )
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_completion_code ON public.bookings;
CREATE TRIGGER trg_generate_completion_code
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_booking_completion_code();

-- ── 4. Backfill codes for existing non-completed bookings ─────────────────────
INSERT INTO public.booking_completion_codes (booking_id, code)
SELECT
  id,
  lpad(floor(random() * 10000)::int::text, 4, '0')
FROM public.bookings
WHERE status NOT IN ('completed', 'cancelled')
  AND id NOT IN (SELECT booking_id FROM public.booking_completion_codes)
ON CONFLICT (booking_id) DO NOTHING;

-- ── 5. RPC: complete_booking_with_code ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_booking_with_code(
  p_booking_id uuid,
  p_code       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking        record;
  v_code_row       record;
  v_provider_uid   uuid;
  v_max_attempts   constant integer := 5;
  v_lock_minutes   constant integer := 15;
BEGIN
  -- 1. Verify caller is the assigned provider
  SELECT sp.user_id INTO v_provider_uid
  FROM public.bookings b
  JOIN public.service_providers sp ON sp.id = b.provider_id
  WHERE b.id = p_booking_id;

  IF v_provider_uid IS NULL OR v_provider_uid <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- 2. Fetch booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;

  IF v_booking.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status', 'status', v_booking.status);
  END IF;

  -- 3. Fetch code row
  SELECT * INTO v_code_row FROM public.booking_completion_codes WHERE booking_id = p_booking_id;

  IF v_code_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_code');
  END IF;

  -- 4. Check lock
  IF v_code_row.locked_until IS NOT NULL AND v_code_row.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', v_code_row.locked_until
    );
  END IF;

  -- 5. Compare code
  IF v_code_row.code <> p_code THEN
    DECLARE
      v_new_attempts integer := v_code_row.failed_attempts + 1;
      v_lock         timestamptz := NULL;
    BEGIN
      IF v_new_attempts >= v_max_attempts THEN
        v_lock := now() + (v_lock_minutes || ' minutes')::interval;
      END IF;

      UPDATE public.booking_completion_codes
      SET failed_attempts = v_new_attempts,
          locked_until    = v_lock
      WHERE booking_id = p_booking_id;

      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'wrong_code',
        'attempts_left', GREATEST(0, v_max_attempts - v_new_attempts),
        'locked', v_lock IS NOT NULL,
        'locked_until', v_lock
      );
    END;
  END IF;

  -- 6. Code is correct — complete the booking
  UPDATE public.bookings
  SET status       = 'completed',
      completed_at = now(),
      updated_at   = now()
  WHERE id = p_booking_id;

  -- Reset attempts
  UPDATE public.booking_completion_codes
  SET failed_attempts = 0,
      locked_until    = NULL
  WHERE booking_id = p_booking_id;

  -- 7. Trigger existing earnings logic (same as what the trigger does after update)
  -- The existing auto_earnings_trigger fires on bookings UPDATE — so earnings are handled.

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute only to authenticated users
REVOKE ALL ON FUNCTION public.complete_booking_with_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_booking_with_code(uuid, text) TO authenticated;

-- ── 6. Block direct status='completed' update by providers ───────────────────
-- We use a BEFORE UPDATE trigger that rejects status→completed unless we're
-- in a service_role session (admin) or the function set a session flag.
-- Strategy: block direct set of status='completed' for non-service-role.
-- The complete_booking_with_code RPC does the update as SECURITY DEFINER
-- using the postgres role, so we check current_setting to allow it.

CREATE OR REPLACE FUNCTION public.block_direct_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_rpc_completion boolean;
BEGIN
  -- Allow if status is not changing to 'completed'
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- Allow if old status was already completed (no-op)
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Allow if called from service_role (admin panel)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow if the RPC set a session variable (SECURITY DEFINER runs as postgres)
  -- The trigger function itself runs as the invoking user context.
  -- Since complete_booking_with_code is SECURITY DEFINER, its UPDATE runs as
  -- the function owner (postgres), so pg_has_role check works:
  IF pg_has_role('postgres', 'MEMBER') THEN
    RETURN NEW;
  END IF;

  -- Block: provider trying to directly set completed
  RAISE EXCEPTION 'Direct completion not allowed. Use complete_booking_with_code().'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_direct_completion ON public.bookings;
CREATE TRIGGER trg_block_direct_completion
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.block_direct_completion();

-- ── 7. Ensure booking_attachments table exists & RLS policies ─────────────
CREATE TABLE IF NOT EXISTS public.booking_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  uploaded_by      uuid REFERENCES auth.users(id),
  type             text NOT NULL CHECK (type IN ('image', 'audio')),
  storage_path     text NOT NULL,
  mime_type        text,
  size_bytes       integer,
  duration_seconds integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking_id
  ON public.booking_attachments(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_attachments_uploaded_by
  ON public.booking_attachments(uploaded_by);

ALTER TABLE public.booking_attachments ENABLE ROW LEVEL SECURITY;

-- (re-drop and re-create to be idempotent)
DROP POLICY IF EXISTS "customers_insert_own_attachments"  ON public.booking_attachments;
DROP POLICY IF EXISTS "customers_select_own_attachments"  ON public.booking_attachments;
DROP POLICY IF EXISTS "provider_select_booking_attachments" ON public.booking_attachments;

CREATE POLICY "customers_insert_own_attachments"
  ON public.booking_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "customers_select_own_attachments"
  ON public.booking_attachments
  FOR SELECT
  TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY "provider_select_booking_attachments"
  ON public.booking_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.service_providers sp ON sp.id = b.provider_id
      WHERE b.id = booking_attachments.booking_id
        AND sp.user_id = auth.uid()
    )
  );

-- ── 8. Fix storage policies (bucket + owner CRUD + provider read) ───────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-attachments', 'booking-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ba_owner_upload"  ON storage.objects;
DROP POLICY IF EXISTS "ba_owner_read"    ON storage.objects;
DROP POLICY IF EXISTS "ba_owner_update"  ON storage.objects;
DROP POLICY IF EXISTS "ba_owner_delete"  ON storage.objects;
DROP POLICY IF EXISTS "ba_provider_read" ON storage.objects;

CREATE POLICY "ba_owner_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'booking-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "ba_owner_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "ba_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'booking-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "ba_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "ba_provider_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND EXISTS (
      SELECT 1 FROM public.booking_attachments ba
      JOIN public.bookings b ON b.id = ba.booking_id
      JOIN public.service_providers sp ON sp.id = b.provider_id
      WHERE ba.storage_path = name
        AND sp.user_id = auth.uid()
    )
  );

-- ── 9. Indexes for performance ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bcc_booking_id ON public.booking_completion_codes(booking_id);
