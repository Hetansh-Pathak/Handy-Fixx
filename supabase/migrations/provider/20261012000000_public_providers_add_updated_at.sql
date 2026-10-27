-- Adds updated_at to public_providers. The customer app hides providers not updated
-- in the last 90 seconds, so without this column every provider was hidden.
-- (Already applied manually on the live database; kept here for the record.)
CREATE OR REPLACE VIEW public.public_providers AS
SELECT
  sp.id, sp.full_name, sp.full_name AS name, sp.avatar_url, sp.bio, sp.rating,
  sp.total_reviews, sp.total_jobs, sp.experience_years, sp.pincodes, sp.service_ids,
  sp.is_online, sp.is_verified, sp.is_email_verified, sp.status, sp.kyc_status,
  sp.city, sp.created_at, sp.updated_at
FROM public.service_providers sp
WHERE sp.kyc_status = 'approved' AND sp.status = 'active'::provider_status;
GRANT SELECT ON public.public_providers TO authenticated, anon;
