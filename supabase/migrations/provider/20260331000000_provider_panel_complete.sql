-- ─────────────────────────────────────────────
-- HandyFix Provider Panel — Complete Migration
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────

-- 1. Add missing columns to service_providers
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS bank_account_name      TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number    TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc              TEXT,
  ADD COLUMN IF NOT EXISTS upi_id                 TEXT,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "new_booking": true,
    "booking_update": true,
    "reviews": true,
    "payments": true,
    "marketing": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_completion     INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_rate        NUMERIC(5,2) DEFAULT 100.0;

-- 2. Add reviewer_name + service_name to reviews for display
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS service_name  TEXT;

-- 3. Payout requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  amount              NUMERIC(10,2) NOT NULL,
  bank_account_name   TEXT,
  bank_account_number TEXT,
  bank_ifsc           TEXT,
  upi_id              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "providers_own_payouts" ON public.payout_requests;
CREATE POLICY "providers_own_payouts" ON public.payout_requests
  FOR ALL TO authenticated
  USING (provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  ));

-- 4. Enable realtime on payout_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payout_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_requests;
  END IF;
END $$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

-- 5. Trigger: notify provider when booking is cancelled
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

-- 6. Trigger: notify provider on new review
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

-- 7. Trigger: auto-update provider rating when review is added
CREATE OR REPLACE FUNCTION public.update_provider_rating_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    rating       = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_rating_on_review ON public.reviews;
CREATE TRIGGER update_rating_on_review
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating_on_review();

-- 8. Auto-confirm user on signup (prevents "Email not confirmed" issues)
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  NEW.confirmation_token := '';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_on_signup ON auth.users;
CREATE TRIGGER auto_confirm_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user();

-- 9. RPC: confirm a specific user's email (used by login flow as fallback)
CREATE OR REPLACE FUNCTION public.confirm_user_email(user_email TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = auth, public AS $$
BEGIN
  UPDATE auth.users
  SET
    email_confirmed_at   = COALESCE(email_confirmed_at, now()),
    confirmation_token   = '',
    confirmation_sent_at = NULL,
    updated_at           = now()
  WHERE email = user_email;
END;
$$;

-- 10. Confirm all existing unconfirmed users
UPDATE auth.users
SET
  email_confirmed_at   = now(),
  confirmation_token   = '',
  updated_at           = now()
WHERE email_confirmed_at IS NULL OR confirmation_token != '';
