-- ═══════════════════════════════════════════════════════════════════════════
-- BOOKING ATTACHMENTS CHECK (READ-ONLY: changes NOTHING)
-- Paste this whole file in Supabase -> SQL Editor -> Run, then send me the result table.
-- It answers: "Did the customer's photos / voice notes reach the database?", "Are the files in storage?"
-- and "Are the rules that let the assigned pro read them in place?".
-- ═══════════════════════════════════════════════════════════════════════════
WITH checks(n, check_name, result, detail) AS (
  SELECT 1, 'Bucket booking-attachments exists',
    CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'booking-attachments') THEN 'yes' ELSE 'MISSING' END,
    'MISSING = every upload fails; apply migrations/customer/20261003000001_booking_attachments.sql'
  UNION ALL
  SELECT 2, 'Storage rule: customer can upload into own folder (ba_owner_upload)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ba_owner_upload') THEN 'yes' ELSE 'MISSING' END,
    'MISSING = the customer''s upload is refused'
  UNION ALL
  SELECT 3, 'Storage rule: assigned pro can read the files (ba_provider_read)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'ba_provider_read') THEN 'yes' ELSE 'MISSING' END,
    'MISSING = the pro sees the list but no picture or sound'
  UNION ALL
  SELECT 4, 'Table rule: customer can add attachment rows',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_attachments' AND cmd = 'INSERT') THEN 'yes' ELSE 'MISSING' END,
    'MISSING = files upload but are never linked to the booking'
  UNION ALL
  SELECT 5, 'Table rule: assigned pro can see attachment rows',
    CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_attachments' AND cmd = 'SELECT'
                      AND (qual ILIKE '%provider%' OR policyname ILIKE '%provider%')) THEN 'yes' ELSE 'MISSING' END,
    'MISSING = the pro''s job screen shows no attachments'
  UNION ALL
  SELECT 6, 'Attachment rows saved in the last 7 days',
    (SELECT count(*)::text FROM public.booking_attachments WHERE created_at > now() - interval '7 days'),
    '0 after booking with photos = the upload or the row insert failed on the phone'
  UNION ALL
  SELECT 7, 'Files in the bucket in the last 7 days',
    (SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'booking-attachments' AND created_at > now() - interval '7 days'),
    'More files than rows (check 6) = files uploaded but the row insert was refused'
  UNION ALL
  SELECT 8, 'Rows whose booking has no pro (cannot be shown to anyone)',
    (SELECT count(*)::text FROM public.booking_attachments ba JOIN public.bookings b ON b.id = ba.booking_id
      WHERE ba.created_at > now() - interval '7 days' AND b.provider_id IS NULL),
    'Should be 0'
)
SELECT n, check_name, result, detail FROM checks ORDER BY n;

-- The latest 10 attachments with their booking and pro (no file contents).
SELECT ba.created_at, ba.type, ba.mime_type, ba.size_bytes, ba.booking_id, b.status AS booking_status,
       sp.full_name AS pro, ba.storage_path,
       EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'booking-attachments' AND o.name = ba.storage_path) AS file_exists
FROM public.booking_attachments ba
LEFT JOIN public.bookings b ON b.id = ba.booking_id
LEFT JOIN public.service_providers sp ON sp.id = b.provider_id
ORDER BY ba.created_at DESC
LIMIT 10;
