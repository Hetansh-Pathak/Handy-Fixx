-- Required only when the customer app uses a separate Supabase project.
-- Keep the public provider directory schema able to expose the email-verification badge.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
