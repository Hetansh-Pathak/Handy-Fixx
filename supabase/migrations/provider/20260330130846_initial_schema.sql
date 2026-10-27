-- Helper: update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. SERVICES
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INT DEFAULT 60,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Services viewable by all" ON public.services FOR SELECT USING (true);

INSERT INTO public.services (name, description, icon, base_price, duration_minutes, category) VALUES
  ('Plumbing', 'Pipe repairs, leaks, drain cleaning', 'Wrench', 299, 60, 'home'),
  ('Electrical', 'Wiring, fixtures, MCB & safety checks', 'Zap', 349, 90, 'home'),
  ('House Cleaning', 'Deep clean, regular maintenance', 'Sparkles', 499, 120, 'home'),
  ('Painting', 'Interior & exterior, texture & waterproof', 'PaintBucket', 799, 240, 'home'),
  ('AC Service', 'Installation, repair, gas refill', 'Wind', 599, 90, 'appliance'),
  ('Carpentry', 'Furniture repair, custom woodwork', 'Hammer', 449, 120, 'home'),
  ('Pest Control', 'Cockroach, termite, rodent control', 'Bug', 799, 60, 'home'),
  ('Appliance Repair', 'Washing machine, fridge, microwave repair', 'Settings', 399, 60, 'appliance'),
  ('Home Salon', 'Haircut, waxing, facials at your doorstep', 'Scissors', 599, 90, 'beauty'),
  ('HVAC', 'Heating, ventilation & air systems', 'Thermometer', 699, 120, 'appliance');

-- 3. SERVICE_PROVIDERS
CREATE TABLE public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('active','suspended','pending_approval','inactive')),
  is_online BOOLEAN DEFAULT false,
  rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_jobs INT DEFAULT 0,
  pincodes TEXT[] DEFAULT '{}',
  service_ids UUID[] DEFAULT '{}',
  experience_years INT DEFAULT 0,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  notification_preferences JSONB DEFAULT '{"new_booking":true,"booking_update":true,"reviews":true,"payments":true,"marketing":false}'::jsonb,
  profile_completion INT DEFAULT 0,
  total_earnings NUMERIC(12,2) DEFAULT 0,
  this_month_earnings NUMERIC(12,2) DEFAULT 0,
  acceptance_rate NUMERIC(5,2) DEFAULT 100.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers view own profile" ON public.service_providers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Public limited provider view" ON public.service_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Providers update own profile" ON public.service_providers FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.service_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. BOOKINGS
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  address TEXT,
  city TEXT,
  pincode TEXT,
  total_amount NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers see own bookings" ON public.bookings FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Providers see assigned bookings" ON public.bookings FOR SELECT TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Customers create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Providers update assigned bookings" ON public.bookings FOR UPDATE TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Customers update own bookings" ON public.bookings FOR UPDATE TO authenticated USING (customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. REVIEWS
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id),
  customer_id UUID REFERENCES public.profiles(id),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  reviewer_name TEXT,
  service_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers see own reviews" ON public.reviews FOR SELECT TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Customers see own reviews" ON public.reviews FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "Customers create reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- 6. PROVIDER_EARNINGS
CREATE TABLE public.provider_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id),
  provider_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers see own earnings" ON public.provider_earnings FOR SELECT TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Providers update own earnings" ON public.provider_earnings FOR UPDATE TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- 7. PROVIDER_NOTIFICATIONS
CREATE TABLE public.provider_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers see own notifications" ON public.provider_notifications FOR SELECT TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Providers update own notifications" ON public.provider_notifications FOR UPDATE TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Providers insert own notifications" ON public.provider_notifications FOR INSERT TO authenticated WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- 8. PROVIDER_AVAILABILITY
CREATE TABLE public.provider_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, day_of_week, start_time)
);
ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own availability" ON public.provider_availability FOR ALL TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- 9. PAYOUT_REQUESTS
CREATE TABLE public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers manage own payouts" ON public.payout_requests FOR ALL TO authenticated USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.update_provider_earnings_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    total_earnings = (SELECT COALESCE(SUM(provider_amount), 0) FROM public.provider_earnings WHERE provider_id = NEW.provider_id),
    this_month_earnings = (SELECT COALESCE(SUM(provider_amount), 0) FROM public.provider_earnings WHERE provider_id = NEW.provider_id AND created_at >= date_trunc('month', now())),
    total_jobs = (SELECT COUNT(*) FROM public.bookings WHERE provider_id = NEW.provider_id AND status = 'completed')
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_provider_totals_on_earning AFTER INSERT OR UPDATE ON public.provider_earnings FOR EACH ROW EXECUTE FUNCTION public.update_provider_earnings_totals();

CREATE OR REPLACE FUNCTION public.update_provider_rating_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    rating = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_rating_on_review AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating_on_review();

CREATE OR REPLACE FUNCTION public.notify_provider_on_cancellation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.provider_id IS NOT NULL THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (NEW.provider_id, 'booking_cancelled', 'Booking Cancelled', 'A booking for ' || NEW.scheduled_date::TEXT || ' has been cancelled.', jsonb_build_object('booking_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_on_cancellation AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_cancellation();

CREATE OR REPLACE FUNCTION public.notify_provider_on_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
  VALUES (NEW.provider_id, 'new_review', 'New Review Received', COALESCE(NEW.reviewer_name, 'A customer') || ' gave you ' || NEW.rating || ' stars.', jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating));
  RETURN NEW;
END;
$$;
CREATE TRIGGER notify_on_review AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.notify_provider_on_review();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_earnings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_requests;