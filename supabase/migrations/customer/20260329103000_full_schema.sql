-- =============================================
-- EXTEND PROFILES TABLE
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

-- =============================================
-- SERVICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon_name TEXT,
  image_url TEXT,
  base_price NUMERIC(10,2),
  duration_minutes INT DEFAULT 60,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read services"
  ON public.services
  FOR SELECT
  USING (true);

INSERT INTO public.services (name, slug, description, icon_name, base_price, duration_minutes, category)
VALUES
  ('Plumbing', 'plumbing', 'Pipe repairs, leaks, installations', 'Wrench', 299, 60, 'home'),
  ('Electrical', 'electrical', 'Wiring, fixtures, safety checks', 'Zap', 349, 90, 'home'),
  ('House Cleaning', 'cleaning', 'Deep clean, regular maintenance', 'Sparkles', 499, 120, 'home'),
  ('Painting', 'painting', 'Interior and exterior painting', 'PaintBucket', 799, 240, 'home'),
  ('AC Service', 'ac-service', 'AC installation, repair, gas refill', 'Wind', 599, 90, 'appliance'),
  ('Carpentry', 'carpentry', 'Furniture repair, custom woodwork', 'Hammer', 449, 120, 'home'),
  ('Pest Control', 'pest-control', 'Cockroach, termite, rodent control', 'Bug', 799, 60, 'home'),
  ('HVAC', 'hvac', 'Heating, ventilation and air systems', 'Thermometer', 699, 120, 'appliance'),
  ('Appliance Repair', 'appliance-repair', 'Washing machine, fridge, microwave', 'Settings', 399, 60, 'appliance'),
  ('Home Salon', 'salon', 'Haircut, waxing, facials at home', 'Scissors', 599, 90, 'beauty')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- SERVICE PROVIDERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  experience_years INT DEFAULT 1,
  rating NUMERIC(3,2) DEFAULT 4.5,
  total_reviews INT DEFAULT 0,
  total_jobs INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  base_charge NUMERIC(10,2),
  pincodes TEXT[] DEFAULT '{}',
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read providers"
  ON public.service_providers
  FOR SELECT
  USING (true);

-- =============================================
-- PROVIDER <-> SERVICES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.provider_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price NUMERIC(10,2),
  UNIQUE(provider_id, service_id)
);

ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read provider_services"
  ON public.provider_services
  FOR SELECT
  USING (true);

-- =============================================
-- BOOKINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.service_providers(id),
  service_id UUID REFERENCES public.services(id),
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT NOT NULL,
  city TEXT,
  special_instructions TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  total_amount NUMERIC(10,2),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- REVIEWS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
  ON public.reviews
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own review"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- PROVIDER SEED DATA
-- =============================================
INSERT INTO public.service_providers (name, bio, experience_years, rating, total_reviews, total_jobs, base_charge, pincodes, city)
VALUES
  ('Rajesh Kumar', 'Expert plumber with 8+ years of experience in residential plumbing', 8, 4.9, 234, 412, 299, ARRAY['380001', '380002', '380005', '380006', '380007'], 'Ahmedabad'),
  ('Suresh Patel', 'Certified electrician, specializes in home wiring and safety audits', 6, 4.8, 189, 301, 349, ARRAY['380001', '380004', '380008', '380009'], 'Ahmedabad'),
  ('Meena Sharma', 'Professional house cleaner, eco-friendly products used', 4, 4.7, 156, 289, 499, ARRAY['380002', '380003', '380005', '380006'], 'Ahmedabad'),
  ('Anil Verma', 'Experienced painter, interior and exterior specialist', 10, 4.8, 312, 521, 799, ARRAY['380001', '380002', '380003', '380004', '380005'], 'Ahmedabad'),
  ('Priya Nair', 'Trained beauty professional offering home salon services', 5, 4.9, 278, 445, 599, ARRAY['380006', '380007', '380008', '380009'], 'Ahmedabad'),
  ('Deepak Singh', 'AC technician with certification from Daikin and Voltas', 7, 4.7, 198, 367, 599, ARRAY['380001', '380002', '380003'], 'Ahmedabad'),
  ('Mohan Lal', 'Pest control expert, safe for family and pets', 9, 4.6, 143, 234, 799, ARRAY['380004', '380005', '380006', '380007'], 'Ahmedabad'),
  ('Kavita Reddy', 'Skilled carpenter, furniture repair and custom woodwork', 6, 4.8, 167, 312, 449, ARRAY['380001', '380003', '380008'], 'Ahmedabad')
ON CONFLICT DO NOTHING;

-- =============================================
-- LINK PROVIDERS TO SERVICES
-- =============================================
INSERT INTO public.provider_services (provider_id, service_id, custom_price)
SELECT sp.id, s.id, sp.base_charge
FROM public.service_providers sp
JOIN public.services s ON
  (sp.name = 'Rajesh Kumar' AND s.slug = 'plumbing') OR
  (sp.name = 'Suresh Patel' AND s.slug = 'electrical') OR
  (sp.name = 'Meena Sharma' AND s.slug = 'cleaning') OR
  (sp.name = 'Anil Verma' AND s.slug = 'painting') OR
  (sp.name = 'Priya Nair' AND s.slug = 'salon') OR
  (sp.name = 'Deepak Singh' AND s.slug = 'ac-service') OR
  (sp.name = 'Mohan Lal' AND s.slug = 'pest-control') OR
  (sp.name = 'Kavita Reddy' AND s.slug = 'carpentry')
ON CONFLICT (provider_id, service_id) DO NOTHING;
