-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Profile pictures for pros (and later customers). A public `avatars` bucket: customers must see a pro's
-- photo on the list of pros, so it cannot live in the private `provider-kyc` bucket (ID documents) or
-- `booking-attachments`. Public means anyone with the URL can view the image; nothing else is in here.
--
-- Writes are limited to the user's own folder: `{auth.uid()}/avatar-{timestamp}.{ext}`. The app then saves
-- the public URL in `service_providers.avatar_url` (already a column, already in `public_providers`, and not
-- one of the columns `prevent_privileged_column_update` blocks), so no table or RLS change is needed.
--
-- Until this is applied the app shows "Profile photos are not switched on yet" and everything else works.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

-- Public URLs are served without RLS; this SELECT only lets the owner list their own folder (to clean up old photos).
CREATE POLICY "avatars_owner_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Rollback ───────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "avatars_owner_select" ON storage.objects;
-- DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
-- DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
-- (empty the bucket in the dashboard, then) DELETE FROM storage.buckets WHERE id = 'avatars';
