-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Fixes: the assigned pro sees "Photos and voice note" on a job but no photo or sound plays.
--
-- Cause: the storage rule "ba_provider_read" (migrations 20261003000001 and 20261004000001) says
--     WHERE ba.storage_path = name
-- inside a sub-query that joins public.service_providers. That table also has a column called `name`, and SQL
-- resolves an unqualified column to the NEAREST table first, so the rule compares the file path with the pro's
-- name. It never matches, every signed URL for a pro is refused, and only the customer (owner rules) can open files.
--
-- Fix: the same rule with the file name written as `objects.name` (the storage.objects row being read).
-- Nothing else changes: still only the pro assigned to that booking can read its files, read-only.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ba_provider_read" ON storage.objects;

CREATE POLICY "ba_provider_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.booking_attachments ba
      JOIN public.bookings b ON b.id = ba.booking_id
      JOIN public.service_providers sp ON sp.id = b.provider_id
      WHERE ba.storage_path = objects.name
        AND sp.user_id = auth.uid()
    )
  );

-- ── Check after applying (read-only) ────────────────────────────────────────
-- SELECT policyname, qual FROM pg_policies
--  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ba_provider_read';
-- The qual must contain "objects.name".

-- ── Rollback (restores the old, broken rule) ────────────────────────────────
-- DROP POLICY IF EXISTS "ba_provider_read" ON storage.objects;
-- CREATE POLICY "ba_provider_read" ON storage.objects FOR SELECT TO authenticated USING (
--   bucket_id = 'booking-attachments' AND EXISTS (
--     SELECT 1 FROM public.booking_attachments ba JOIN public.bookings b ON b.id = ba.booking_id
--     JOIN public.service_providers sp ON sp.id = b.provider_id
--     WHERE ba.storage_path = name AND sp.user_id = auth.uid()));
