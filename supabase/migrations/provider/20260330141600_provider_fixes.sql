-- ─────────────────────────────────────────────────────────────────────────────
-- HandyFix Provider Panel — DB Fixes Migration
-- Safe to run on top of existing schema (all idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────
-- Add missing columns to service_providers (if schema was created without them)
-- ─────────────────────────────────────────
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "new_booking": true,
    "booking_update": true,
    "reviews": true,
    "payments": true,
    "marketing": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_completion INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earnings NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS this_month_earnings NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_rate NUMERIC(5,2) DEFAULT 100.0;

-- ─────────────────────────────────────────
-- Add reviewer_name and service_name to reviews (if missing)
-- ─────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS service_name TEXT;

-- ─────────────────────────────────────────
-- Payout requests table (idempotent)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_requests' AND policyname = 'providers_own_payouts'
  ) THEN
    CREATE POLICY "providers_own_payouts"
      ON public.payout_requests FOR ALL TO authenticated
      USING (provider_id IN (
        SELECT id FROM public.service_providers WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- ─────────────────────────────────────────
-- Trigger: auto-update provider total_earnings when earning is added/updated
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_provider_earnings_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    total_earnings = (
      SELECT COALESCE(SUM(provider_amount), 0)
      FROM public.provider_earnings
      WHERE provider_id = NEW.provider_id
    ),
    this_month_earnings = (
      SELECT COALESCE(SUM(provider_amount), 0)
      FROM public.provider_earnings
      WHERE provider_id = NEW.provider_id
        AND created_at >= date_trunc('month', now())
    ),
    total_jobs = (
      SELECT COUNT(*)
      FROM public.bookings
      WHERE provider_id = NEW.provider_id AND status = 'completed'
    )
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_provider_totals_on_earning ON public.provider_earnings;
CREATE TRIGGER update_provider_totals_on_earning
  AFTER INSERT OR UPDATE ON public.provider_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_earnings_totals();

-- ─────────────────────────────────────────
-- Trigger: auto-update provider rating when review is inserted
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_provider_rating_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    rating = (
      SELECT ROUND(AVG(rating)::NUMERIC, 2)
      FROM public.reviews
      WHERE provider_id = NEW.provider_id
    ),
    total_reviews = (
      SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id
    )
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_rating_on_review ON public.reviews;
CREATE TRIGGER update_rating_on_review
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating_on_review();

-- ─────────────────────────────────────────
-- Trigger: notify provider on booking cancellation by customer
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_on_cancellation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (
      NEW.provider_id,
      'booking_cancelled',
      'Booking Cancelled',
      'A booking for ' || NEW.scheduled_date::TEXT || ' has been cancelled.',
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_cancellation ON public.bookings;
CREATE TRIGGER notify_on_cancellation
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_cancellation();

-- ─────────────────────────────────────────
-- Trigger: notify provider on new review
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (
    NEW.provider_id,
    'new_review',
    'New Review Received ⭐',
    COALESCE(NEW.reviewer_name, 'A customer') || ' gave you ' || NEW.rating || ' stars.',
    jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_review ON public.reviews;
CREATE TRIGGER notify_on_review
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_review();

-- ─────────────────────────────────────────
-- Enable realtime on payout_requests (safe to re-run)
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payout_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_requests;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- Seed: insert services only if table is empty
-- ─────────────────────────────────────────
INSERT INTO public.services (name, description, icon, base_price, duration_minutes, category)
SELECT * FROM (VALUES
  ('Plumbing',         'Pipe repairs, leaks, drain cleaning',          'Wrench',       299, 60,  'home'),
  ('Electrical',       'Wiring, fixtures, MCB & safety checks',        'Zap',          349, 90,  'home'),
  ('House Cleaning',   'Deep clean, regular maintenance',              'Sparkles',     499, 120, 'home'),
  ('Painting',         'Interior & exterior, texture & waterproof',    'PaintBucket',  799, 240, 'home'),
  ('AC Service',       'Installation, repair, gas refill',             'Wind',         599, 90,  'appliance'),
  ('Carpentry',        'Furniture repair, custom woodwork',            'Hammer',       449, 120, 'home'),
  ('Pest Control',     'Cockroach, termite, rodent control',           'Bug',          799, 60,  'home'),
  ('Appliance Repair', 'Washing machine, fridge, microwave repair',    'Settings',     399, 60,  'appliance'),
  ('Home Salon',       'Haircut, waxing, facials at your doorstep',    'Scissors',     599, 90,  'beauty'),
  ('HVAC',             'Heating, ventilation & air systems',           'Thermometer',  699, 120, 'appliance')
) AS v(name, description, icon, base_price, duration_minutes, category)
WHERE NOT EXISTS (SELECT 1 FROM public.services LIMIT 1);

-- ─────────────────────────────────────────
-- Add RLS policy allowing DB triggers to insert notifications
-- (triggers run as SECURITY DEFINER so they bypass RLS, but adding
--  the service_role insert policy for provider_notifications is good practice)
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_notifications' AND policyname = 'System can insert notifications'
  ) THEN
    CREATE POLICY "System can insert notifications"
      ON public.provider_notifications FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;
