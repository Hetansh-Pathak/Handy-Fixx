-- Email ownership verification for service providers.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.provider_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_otp_codes_provider_created_idx
  ON public.provider_otp_codes (provider_id, created_at DESC);

ALTER TABLE public.provider_otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers can read their OTP codes" ON public.provider_otp_codes;
CREATE POLICY "providers can read their OTP codes"
  ON public.provider_otp_codes FOR SELECT TO authenticated
  USING (provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "providers can create their OTP codes" ON public.provider_otp_codes;
CREATE POLICY "providers can create their OTP codes"
  ON public.provider_otp_codes FOR INSERT TO authenticated
  WITH CHECK (provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  ));
