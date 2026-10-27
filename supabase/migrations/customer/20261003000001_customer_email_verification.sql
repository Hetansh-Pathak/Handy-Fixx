-- Customer email verification (OTP) — required before a customer can book.
-- Security notes:
--  * OTP codes are stored HASHED and the table has NO client policies:
--    only Edge Functions (service role) can read/write it.
--  * The "verified" flag lives in its own table (not profiles) so a client
--    can never flip it through the normal profile-update policy.
--  * Enforcement is in the database (RESTRICTIVE RLS on bookings), so
--    skipping the UI does not bypass it.

-- 1) Pending codes (service role only)
CREATE TABLE IF NOT EXISTS public.customer_email_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_email_otps_user_created_idx
  ON public.customer_email_otps (user_id, created_at DESC);
ALTER TABLE public.customer_email_otps ENABLE ROW LEVEL SECURITY;  -- no policies on purpose

-- 2) Proof of verification (read-only for the owner)
CREATE TABLE IF NOT EXISTS public.customer_email_verifications (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  verified_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_email_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner can read own verification" ON public.customer_email_verifications;
CREATE POLICY "owner can read own verification"
  ON public.customer_email_verifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3) Single source of truth. Verified = this exact current email was proven via OTP,
--    OR the account signed in with Google (Google already verified the address).
CREATE OR REPLACE FUNCTION public.is_customer_email_verified()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.customer_email_verifications v
      JOIN auth.users u ON u.id = v.user_id
      WHERE v.user_id = auth.uid() AND lower(v.email) = lower(u.email)
    )
    OR EXISTS (
      SELECT 1 FROM auth.identities i
      WHERE i.user_id = auth.uid() AND i.provider = 'google'
    );
$$;
REVOKE ALL ON FUNCTION public.is_customer_email_verified() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_customer_email_verified() TO authenticated;

-- 4) The actual gate. RESTRICTIVE = ANDed with whatever insert policy already exists.
DROP POLICY IF EXISTS "bookings require verified email" ON public.bookings;
CREATE POLICY "bookings require verified email"
  ON public.bookings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_customer_email_verified());
