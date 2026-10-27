-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Lets a customer call their pro, safely. PDF p.2 and p.12: phone numbers appear only after the pro accepts.
--
-- Why this is needed: the KYC migration (20261005000002_public_providers_view) correctly hid the
-- service_providers table from customers, so the old "join service_providers.phone" no longer returns anything.
-- This function is the only door: it returns the pro's phone to the booking's own customer, and only while the
-- booking is accepted and active. Anyone else, or any other status, gets NULL.
--
-- Until it is applied the mobile app simply hides the Call button on the booking screen (it does not break).
-- A later step can replace the raw number with masked calling.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_booking_provider_phone(p_booking_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text;
BEGIN
  SELECT sp.phone INTO v_phone
  FROM public.bookings b
  JOIN public.service_providers sp ON sp.id = b.provider_id
  WHERE b.id = p_booking_id
    AND b.customer_id = auth.uid()
    AND b.status::text IN ('confirmed', 'on_the_way', 'arrived', 'in_progress');
  RETURN v_phone;
END;
$$;

REVOKE ALL ON FUNCTION public.get_booking_provider_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_provider_phone(uuid) TO authenticated;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.get_booking_provider_phone(uuid);
