-- 20261006000000_admin_phase1.sql
-- HandyFix Admin Panel Phase 1 Migration:
-- Audit logging, Security Definer RPCs, RLS policies for admin reads, performance indexes.

-- 1. Create admin_audit_log table if not exists
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log_admin_select" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_admin_select"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));


-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity_id ON public.admin_audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_status_created ON public.bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_sp_status_kyc ON public.service_providers(status, kyc_status);


-- 3. RLS Policies for Admin Read Access Across Core Tables
-- Bookings
DROP POLICY IF EXISTS "admin_select_all_bookings" ON public.bookings;
CREATE POLICY "admin_select_all_bookings"
ON public.bookings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Booking Attachments
DROP POLICY IF EXISTS "admin_select_all_attachments" ON public.booking_attachments;
CREATE POLICY "admin_select_all_attachments"
ON public.booking_attachments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Profiles
DROP POLICY IF EXISTS "admin_select_all_profiles" ON public.profiles;
CREATE POLICY "admin_select_all_profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Reviews
DROP POLICY IF EXISTS "admin_select_all_reviews" ON public.reviews;
CREATE POLICY "admin_select_all_reviews"
ON public.reviews FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Provider Notifications
DROP POLICY IF EXISTS "admin_select_all_provider_notifs" ON public.provider_notifications;
CREATE POLICY "admin_select_all_provider_notifs"
ON public.provider_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Customer Notifications
DROP POLICY IF EXISTS "admin_select_all_customer_notifs" ON public.customer_notifications;
CREATE POLICY "admin_select_all_customer_notifs"
ON public.customer_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- User Roles
DROP POLICY IF EXISTS "admin_select_all_roles" ON public.user_roles;
CREATE POLICY "admin_select_all_roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Storage read access for admins on booking-attachments bucket
DROP POLICY IF EXISTS "ba_admin_read" ON storage.objects;
CREATE POLICY "ba_admin_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'booking-attachments' AND public.has_role(auth.uid(), 'admin'));


-- 4. Update admin_approve_kyc to log to audit trail
CREATE OR REPLACE FUNCTION public.admin_approve_kyc(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_old_kyc TEXT;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  SELECT kyc_status INTO v_old_kyc FROM public.service_providers WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET
    kyc_status = 'approved',
    status = 'active',
    is_verified = true,
    kyc_reviewed_at = NOW(),
    kyc_reviewed_by = v_admin_id,
    kyc_rejection_reason = NULL,
    verified_at = NOW(),
    updated_at = NOW()
  WHERE id = p_provider_id;

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (
    p_provider_id,
    'kyc_approved',
    'KYC Approved! 🎉',
    'Your KYC verification has been approved. You can now accept jobs and go online!',
    jsonb_build_object('approved_at', NOW())
  );

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'kyc_approved',
    'service_provider',
    p_provider_id,
    jsonb_build_object('previous_kyc_status', v_old_kyc, 'new_status', 'active')
  );

  RETURN jsonb_build_object('success', true, 'message', 'KYC approved successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 5. Update admin_reject_kyc to log to audit trail
CREATE OR REPLACE FUNCTION public.admin_reject_kyc(p_provider_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_old_kyc TEXT;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
  END IF;

  SELECT kyc_status INTO v_old_kyc FROM public.service_providers WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET
    kyc_status = 'rejected',
    status = 'pending_approval',
    is_online = false,
    kyc_reviewed_at = NOW(),
    kyc_reviewed_by = v_admin_id,
    kyc_rejection_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_provider_id;

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (
    p_provider_id,
    'kyc_rejected',
    'KYC Application Update',
    'Your KYC application was not approved. Reason: ' || TRIM(p_reason),
    jsonb_build_object('reason', TRIM(p_reason), 'rejected_at', NOW())
  );

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'kyc_rejected',
    'service_provider',
    p_provider_id,
    jsonb_build_object('previous_kyc_status', v_old_kyc, 'reason', TRIM(p_reason))
  );

  RETURN jsonb_build_object('success', true, 'message', 'KYC rejected');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 6. RPC: admin_suspend_provider
CREATE OR REPLACE FUNCTION public.admin_suspend_provider(p_provider_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_open_bookings INT;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Suspension reason must be at least 5 characters');
  END IF;

  -- Set session config to pass privileged column trigger
  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET
    status = 'suspended',
    is_online = false,
    updated_at = NOW()
  WHERE id = p_provider_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found');
  END IF;

  -- Count active bookings for reporting
  SELECT COUNT(*) INTO v_open_bookings
  FROM public.bookings
  WHERE provider_id = p_provider_id AND status IN ('pending', 'confirmed', 'on_the_way', 'in_progress');

  -- Send notification to provider
  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (
    p_provider_id,
    'account_suspended',
    'Account Suspended',
    'Your provider account has been suspended by administration. Reason: ' || TRIM(p_reason),
    jsonb_build_object('reason', TRIM(p_reason), 'suspended_at', NOW())
  );

  -- Audit log
  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'provider_suspended',
    'service_provider',
    p_provider_id,
    jsonb_build_object('reason', TRIM(p_reason), 'open_bookings_count', v_open_bookings)
  );

  RETURN jsonb_build_object('success', true, 'open_bookings_count', v_open_bookings);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 7. RPC: admin_reactivate_provider
CREATE OR REPLACE FUNCTION public.admin_reactivate_provider(p_provider_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_kyc_status TEXT;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  SELECT kyc_status INTO v_kyc_status FROM public.service_providers WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider not found');
  END IF;

  IF v_kyc_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot reactivate provider whose KYC is not approved');
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET
    status = 'active',
    updated_at = NOW()
  WHERE id = p_provider_id;

  INSERT INTO public.provider_notifications (provider_id, type, title, message)
  VALUES (
    p_provider_id,
    'account_reactivated',
    'Account Reactivated',
    'Your account has been reactivated. You can now resume taking jobs.'
  );

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'provider_reactivated',
    'service_provider',
    p_provider_id,
    jsonb_build_object('note', p_note)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 8. RPC: admin_cancel_booking
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id UUID,
  p_reason TEXT,
  p_notify BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_booking RECORD;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancellation reason must be at least 5 characters');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel a booking that is already ' || v_booking.status);
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_reason = '[Admin] ' || TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_booking_id;

  -- Notifications
  IF p_notify THEN
    IF v_booking.customer_id IS NOT NULL THEN
      INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id)
      VALUES (
        v_booking.customer_id,
        'booking_cancelled',
        'Booking Cancelled',
        'Your booking #' || UPPER(SUBSTRING(p_booking_id::text FROM 1 FOR 8)) || ' was cancelled by support. Reason: ' || TRIM(p_reason),
        p_booking_id
      );
    END IF;

    IF v_booking.provider_id IS NOT NULL THEN
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (
        v_booking.provider_id,
        'booking_cancelled',
        'Booking Cancelled',
        'Booking #' || UPPER(SUBSTRING(p_booking_id::text FROM 1 FOR 8)) || ' was cancelled by admin.',
        jsonb_build_object('booking_id', p_booking_id, 'reason', TRIM(p_reason))
      );
    END IF;
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'booking_cancelled',
    'booking',
    p_booking_id,
    jsonb_build_object('previous_status', v_booking.status, 'reason', TRIM(p_reason), 'provider_id', v_booking.provider_id)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 9. RPC: admin_reassign_booking
CREATE OR REPLACE FUNCTION public.admin_reassign_booking(
  p_booking_id UUID,
  p_new_provider_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_booking RECORD;
  v_new_provider RECORD;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Admin role required');
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reassign reason must be at least 5 characters');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only reassign bookings in pending or confirmed status');
  END IF;

  IF v_booking.provider_id = p_new_provider_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'New provider is same as currently assigned provider');
  END IF;

  SELECT * INTO v_new_provider FROM public.service_providers WHERE id = p_new_provider_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'New provider not found');
  END IF;

  IF v_new_provider.kyc_status != 'approved' OR v_new_provider.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'New provider is not approved and active');
  END IF;

  -- Reassign provider and reset status to pending (new provider must acknowledge)
  UPDATE public.bookings
  SET
    provider_id = p_new_provider_id,
    status = 'pending',
    updated_at = NOW()
  WHERE id = p_booking_id;

  -- Notify old provider
  IF v_booking.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (
      v_booking.provider_id,
      'booking_reassigned',
      'Booking Reassigned',
      'Booking #' || UPPER(SUBSTRING(p_booking_id::text FROM 1 FOR 8)) || ' was reassigned to another provider.',
      jsonb_build_object('booking_id', p_booking_id)
    );
  END IF;

  -- Notify new provider
  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (
    p_new_provider_id,
    'new_booking_assigned',
    'New Booking Assigned! 📋',
    'You have been assigned booking #' || UPPER(SUBSTRING(p_booking_id::text FROM 1 FOR 8)) || ' by admin.',
    jsonb_build_object('booking_id', p_booking_id)
  );

  -- Audit log
  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    'booking_reassigned',
    'booking',
    p_booking_id,
    jsonb_build_object(
      'previous_provider_id', v_booking.provider_id,
      'new_provider_id', p_new_provider_id,
      'reason', TRIM(p_reason)
    )
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 10. RPC: admin_get_dashboard_counts
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_counts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_pending_kyc INT;
  v_active_providers INT;
  v_suspended_providers INT;
  v_bookings_today INT;
  v_pending_bookings INT;
  v_in_progress_bookings INT;
  v_completed_today INT;
  v_cancelled_today INT;
  v_attention_items JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  -- Counts
  SELECT COUNT(*) INTO v_pending_kyc FROM public.service_providers WHERE kyc_status = 'pending';
  SELECT COUNT(*) INTO v_active_providers FROM public.service_providers WHERE status = 'active';
  SELECT COUNT(*) INTO v_suspended_providers FROM public.service_providers WHERE status = 'suspended';

  SELECT COUNT(*) INTO v_bookings_today FROM public.bookings WHERE created_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO v_pending_bookings FROM public.bookings WHERE status = 'pending';
  SELECT COUNT(*) INTO v_in_progress_bookings FROM public.bookings WHERE status = 'in_progress';
  SELECT COUNT(*) INTO v_completed_today FROM public.bookings WHERE status = 'completed' AND completed_at >= CURRENT_DATE;
  SELECT COUNT(*) INTO v_cancelled_today FROM public.bookings WHERE status = 'cancelled' AND cancelled_at >= CURRENT_DATE;

  -- Needs Attention 1: KYC pending > 2 days
  FOR r IN (
    SELECT id, full_name, kyc_submitted_at
    FROM public.service_providers
    WHERE kyc_status = 'pending' AND kyc_submitted_at < NOW() - INTERVAL '2 days'
    LIMIT 5
  ) LOOP
    v_attention_items := v_attention_items || jsonb_build_object(
      'type', 'kyc_stale',
      'id', r.id,
      'label', 'KYC Review Overdue: ' || r.full_name,
      'detail', 'Submitted ' || TO_CHAR(r.kyc_submitted_at, 'DD Mon YYYY'),
      'link_to', '/kyc'
    );
  END LOOP;

  -- Needs Attention 2: Bookings pending > 30 minutes
  FOR r IN (
    SELECT id, created_at, address
    FROM public.bookings
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes'
    LIMIT 5
  ) LOOP
    v_attention_items := v_attention_items || jsonb_build_object(
      'type', 'pending_long',
      'id', r.id,
      'label', 'Unassigned Booking #' || UPPER(SUBSTRING(r.id::text FROM 1 FOR 8)),
      'detail', 'Pending for > 30 mins (' || r.address || ')',
      'link_to', '/bookings?status=pending'
    );
  END LOOP;

  -- Needs Attention 3: Active bookings assigned to suspended provider
  FOR r IN (
    SELECT b.id, sp.full_name
    FROM public.bookings b
    JOIN public.service_providers sp ON b.provider_id = sp.id
    WHERE b.status IN ('pending', 'confirmed', 'on_the_way', 'in_progress')
      AND sp.status = 'suspended'
    LIMIT 5
  ) LOOP
    v_attention_items := v_attention_items || jsonb_build_object(
      'type', 'suspended_provider',
      'id', r.id,
      'label', 'Booking #' || UPPER(SUBSTRING(r.id::text FROM 1 FOR 8)) || ' with Suspended Provider',
      'detail', 'Assigned to ' || r.full_name || ' (suspended)',
      'link_to', '/bookings'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'pending_kyc', v_pending_kyc,
    'active_providers', v_active_providers,
    'suspended_providers', v_suspended_providers,
    'bookings_today', v_bookings_today,
    'pending_bookings', v_pending_bookings,
    'in_progress_bookings', v_in_progress_bookings,
    'completed_today', v_completed_today,
    'cancelled_today', v_cancelled_today,
    'needs_attention', v_attention_items
  );
END;
$$;


-- Grant permissions
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_provider TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_provider TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_booking TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_counts TO authenticated;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
