-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Manual KYC Onboarding
-- Migration 2: Private storage bucket for KYC documents
-- NOTE: Storage policies are managed in the Supabase dashboard as well;
--       the SQL below inserts the bucket row and creates storage policies.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Create private storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-kyc',
  'provider-kyc',
  false,          -- NOT public
  5242880,        -- 5 MB in bytes
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = false;

-- ─── Storage RLS Policies ────────────────────────────────────────────────────

-- Allow authenticated provider to INSERT (upload) into their own folder
DROP POLICY IF EXISTS "Providers can upload KYC docs" ON storage.objects;
CREATE POLICY "Providers can upload KYC docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'provider-kyc'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.service_providers
      WHERE user_id = auth.uid()
        AND kyc_status IN ('not_submitted', 'rejected')
    )
  );

-- Allow provider to SELECT (read) their own objects
DROP POLICY IF EXISTS "Providers can read own KYC docs" ON storage.objects;
CREATE POLICY "Providers can read own KYC docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'provider-kyc'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow provider to DELETE their own objects (for replace/retake)
DROP POLICY IF EXISTS "Providers can delete own KYC docs" ON storage.objects;
CREATE POLICY "Providers can delete own KYC docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'provider-kyc'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow provider to UPDATE (upsert) their own objects
DROP POLICY IF EXISTS "Providers can update own KYC docs" ON storage.objects;
CREATE POLICY "Providers can update own KYC docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'provider-kyc'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow admins to read ALL KYC documents (for review)
DROP POLICY IF EXISTS "Admins can read all KYC docs" ON storage.objects;
CREATE POLICY "Admins can read all KYC docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'provider-kyc'
    AND public.has_role(auth.uid(), 'admin')
  );
