-- ═══════════════════════════════════════════════════════════════════════════
-- HandyFix — Manual KYC Onboarding
-- Migration 3: Public providers view + RLS tightening on service_providers
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Create public_providers view ─────────────────────────────────────────
-- Only approved + active providers visible; only safe columns exposed.
-- Customers query this view; no phone/email/bank/KYC data leaked.
CREATE OR REPLACE VIEW public.public_providers AS
SELECT
  sp.id,
  sp.full_name,
  sp.avatar_url,
  sp.bio,
  sp.rating,
  sp.total_reviews,
  sp.total_jobs,
  sp.experience_years,
  sp.pincodes,
  sp.service_ids,
  sp.is_online,
  sp.is_verified,
  sp.is_email_verified,
  sp.status,
  sp.kyc_status,
  sp.created_at
FROM public.service_providers sp
WHERE sp.kyc_status = 'approved'
  AND sp.status     = 'active';

-- Grant read access to all authenticated and anonymous users
GRANT SELECT ON public.public_providers TO authenticated, anon;

-- ─── 2. Tighten the "Public limited provider view" policy ─────────────────────
-- Remove the old unrestricted public SELECT policy that exposed ALL columns
DROP POLICY IF EXISTS "Public limited provider view" ON public.service_providers;

-- Add a new, stricter public policy: only select safe columns from approved providers.
-- Customers should use the VIEW, but if someone queries the table directly,
-- only the owner and admin can see sensitive fields.
-- Non-owners/non-admins get zero rows from direct table access.
DROP POLICY IF EXISTS "Non-owner public select" ON public.service_providers;
CREATE POLICY "Non-owner public select" ON public.service_providers
  FOR SELECT TO authenticated
  USING (
    -- Owner always sees own row
    user_id = auth.uid()
    OR
    -- Admin sees all
    public.has_role(auth.uid(), 'admin')
  );

-- Keep the existing owner-specific policy (may already exist)
DROP POLICY IF EXISTS "Providers view own profile" ON public.service_providers;
CREATE POLICY "Providers view own profile" ON public.service_providers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ─── 3. Admin SELECT policy for service_providers ────────────────────────────
DROP POLICY IF EXISTS "Admins view all providers" ON public.service_providers;
CREATE POLICY "Admins view all providers" ON public.service_providers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 4. Ensure UPDATE policy exists (owner only, non-privileged columns) ──────
DROP POLICY IF EXISTS "Providers update own profile" ON public.service_providers;
CREATE POLICY "Providers update own profile" ON public.service_providers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- NOTE: The prevent_privileged_column_update() TRIGGER (migration 1) enforces
-- which specific columns are off-limits. The policy allows the UPDATE to reach
-- the trigger, which then validates column-by-column.

-- ─── 5. INSERT policy: allow new providers to create their own row ─────────────
DROP POLICY IF EXISTS "Providers insert own profile" ON public.service_providers;
CREATE POLICY "Providers insert own profile" ON public.service_providers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
