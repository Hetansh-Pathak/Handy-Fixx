-- ============================================================
-- Migration: booking_attachments + booking-attachments bucket
-- Date:      2026-10-03
-- Apply in:  Supabase SQL editor (paste entire file)
-- Idempotent: yes (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ============================================================

-- ── 1. Create the booking_attachments table ──────────────────────────────────
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

-- index for fast lookup by booking
CREATE INDEX IF NOT EXISTS idx_booking_attachments_booking_id
  ON public.booking_attachments(booking_id);

-- index for fast lookup by uploader (used in storage policy)
CREATE INDEX IF NOT EXISTS idx_booking_attachments_uploaded_by
  ON public.booking_attachments(uploaded_by);

-- ── 2. Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.booking_attachments ENABLE ROW LEVEL SECURITY;

-- drop existing policies so the script stays idempotent
DROP POLICY IF EXISTS "customers_insert_own_attachments"  ON public.booking_attachments;
DROP POLICY IF EXISTS "customers_select_own_attachments"  ON public.booking_attachments;
DROP POLICY IF EXISTS "provider_select_booking_attachments" ON public.booking_attachments;

-- Customers can insert attachments where they uploaded them
CREATE POLICY "customers_insert_own_attachments"
  ON public.booking_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- Customers can select their own uploaded attachments
CREATE POLICY "customers_select_own_attachments"
  ON public.booking_attachments
  FOR SELECT
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Providers can select attachments for bookings assigned to them
-- (mirrors the same pattern used in bookings RLS policies)
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

-- ── 3. Create private Storage bucket ─────────────────────────────────────────
-- NOTE: Supabase does NOT expose storage bucket creation via SQL.
-- Run the following in the Supabase Dashboard → Storage → New Bucket:
--   Name:   booking-attachments
--   Public: OFF (private bucket — signed URLs only)
--
-- Then run the storage.objects policies below:

-- Drop existing storage policies (idempotent)
DROP POLICY IF EXISTS "ba_owner_upload"  ON storage.objects;
DROP POLICY IF EXISTS "ba_owner_read"    ON storage.objects;
DROP POLICY IF EXISTS "ba_provider_read" ON storage.objects;

-- Allow authenticated users to upload ONLY into their own folder
-- Path structure: {user_id}/{draft_id}/{filename}
CREATE POLICY "ba_owner_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'booking-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow owner to read their own files
CREATE POLICY "ba_owner_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow owner to delete their own files (for cleanup)
DROP POLICY IF EXISTS "ba_owner_delete" ON storage.objects;
CREATE POLICY "ba_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow providers to read files for their own bookings
-- (provider reads via booking_attachments table's storage_path)
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

-- ── 4. Note: problem_note is stored in bookings.special_instructions ─────────
-- The existing `special_instructions` column in bookings is used for the
-- customer text note. No additional column is needed.
