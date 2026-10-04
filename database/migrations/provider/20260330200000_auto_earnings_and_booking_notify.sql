-- ─────────────────────────────────────────────────────────────────────────────
-- HandyFix Provider Panel — Auto Earnings & New Booking Notification Triggers
-- Safe to run on top of existing schema (all operations are idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────
-- TRIGGER 1: Auto-create provider_earnings row when booking is marked completed
--
-- CRITICAL: Without this, the Earnings page stays empty forever and payout
-- withdrawals can never be requested (totals.pending is always 0).
--
-- Split: 80% to provider, 20% platform fee.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_provider_earnings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fire when booking status transitions TO 'completed'
  IF NEW.status = 'completed' AND OLD.status <> 'completed' AND NEW.provider_id IS NOT NULL THEN
    -- Guard: don't double-insert if a row already exists for this booking
    IF NOT EXISTS (
      SELECT 1 FROM public.provider_earnings WHERE booking_id = NEW.id
    ) THEN
      INSERT INTO public.provider_earnings (
        provider_id,
        booking_id,
        provider_amount,
        platform_fee,
        status
      ) VALUES (
        NEW.provider_id,
        NEW.id,
        ROUND(COALESCE(NEW.total_amount, 0) * 0.80, 2),
        ROUND(COALESCE(NEW.total_amount, 0) * 0.20, 2),
        'pending'
      );
      -- The existing update_provider_totals_on_earning trigger fires automatically
      -- after this INSERT and updates total_earnings, this_month_earnings, total_jobs
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_earnings_on_completion ON public.bookings;
CREATE TRIGGER auto_create_earnings_on_completion
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_provider_earnings();

-- ─────────────────────────────────────────
-- TRIGGER 2: Notify provider when a new booking is assigned to them
--
-- Fires on:
--   a) INSERT into bookings with provider_id already set (direct assignment)
--   b) UPDATE where provider_id is newly set or changed (admin assignment)
--
-- The 'new_booking' notification type is displayed in Notifications.tsx
-- with the Briefcase icon and routes to /provider-panel/bookings on click.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_on_new_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND (OLD.provider_id IS NULL OR OLD.provider_id <> NEW.provider_id)) THEN
      INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
      VALUES (
        NEW.provider_id,
        'new_booking',
        'New Booking Request 📋',
        'You have a new booking for ' ||
          TO_CHAR(NEW.scheduled_date, 'DD Mon YYYY') ||
          CASE WHEN NEW.scheduled_time IS NOT NULL
               THEN ' at ' || NEW.scheduled_time
               ELSE ''
          END || '. Accept or decline it now.',
        jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_new_booking ON public.bookings;
CREATE TRIGGER notify_on_new_booking
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_new_booking();

-- ─────────────────────────────────────────
-- RLS: Add INSERT policy on provider_earnings
--
-- The base schema only created SELECT + UPDATE policies, not INSERT.
-- SECURITY DEFINER triggers bypass RLS so they work today, but this
-- policy is needed if we ever insert from the client directly.
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_earnings' AND policyname = 'System can insert earnings'
  ) THEN
    CREATE POLICY "System can insert earnings"
      ON public.provider_earnings FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────
-- RLS: Allow providers to delete their own availability slots
--
-- The base schema "Providers manage own availability" is FOR ALL with
-- only a USING clause. Some Postgres versions require an explicit DELETE
-- policy. This guard adds it idempotently.
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_availability' AND policyname = 'Providers delete own availability'
  ) THEN
    CREATE POLICY "Providers delete own availability"
      ON public.provider_availability FOR DELETE TO authenticated
      USING (provider_id IN (
        SELECT id FROM public.service_providers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
