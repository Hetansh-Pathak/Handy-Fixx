-- ============================================================
-- ⚠️  PROPOSAL ONLY — NOT APPLIED — do not run without review
-- ============================================================
-- Phase 5: Server-side platform fee enforcement via BEFORE INSERT trigger
--
-- GOAL
--   Prevent the browser / API client from setting an incorrect platform_fee
--   or total_amount. The DB will silently override both values server-side,
--   ensuring the 12% rule is always enforced regardless of what the client sends.
--
-- HOW IT WORKS
--   A BEFORE INSERT trigger fires before the row is written.
--   It reads provider_amount from the INSERT payload and overwrites:
--     platform_fee  = ROUND(provider_amount * 0.12)
--     total_amount  = provider_amount + platform_fee
--
-- ROLLOUT RISKS
--   1. Breaking change to client expectations:
--      The browser currently calculates and displays the fee before booking.
--      If the trigger changes it, the displayed total and stored total will differ
--      unless the client re-fetches after insert. Plan: after inserting, navigate
--      to /booking-confirmation/<id> which fetches total_amount fresh from DB.
--
--   2. Existing rows are unaffected:
--      Triggers only fire on new INSERTs. Historical rows keep their old values.
--      If you need to backfill, run a separate UPDATE migration.
--
--   3. The trigger does not protect UPDATE:
--      If the provider panel updates total_amount directly, it bypasses this trigger.
--      Add a BEFORE UPDATE trigger too if you need end-to-end protection.
--
--   4. Rate changes:
--      If the commission rate changes from 12%, you must update the trigger.
--      Consider storing the rate in a config table instead of hardcoding 0.12.
--
--   5. coupon_discount interaction:
--      If a coupon is applied, final_amount ≠ total_amount. The trigger only
--      sets total_amount = provider_amount + platform_fee (pre-discount).
--      Make sure final_amount is handled separately by the application.
-- ============================================================

-- Step 1: Create the trigger function
CREATE OR REPLACE FUNCTION public.enforce_booking_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- platform_fee = 12% of what the provider earns (provider_amount)
  NEW.platform_fee := ROUND(COALESCE(NEW.provider_amount, 0) * 0.12);
  -- total paid by customer = service charge + platform fee
  NEW.total_amount := COALESCE(NEW.provider_amount, 0) + NEW.platform_fee;
  RETURN NEW;
END;
$$;

-- Step 2: Attach the trigger (BEFORE INSERT only)
DROP TRIGGER IF EXISTS trg_enforce_booking_fee ON public.bookings;

CREATE TRIGGER trg_enforce_booking_fee
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_fee();

-- ============================================================
-- To remove this trigger later:
--   DROP TRIGGER IF EXISTS trg_enforce_booking_fee ON public.bookings;
--   DROP FUNCTION IF EXISTS public.enforce_booking_fee();
-- ============================================================
