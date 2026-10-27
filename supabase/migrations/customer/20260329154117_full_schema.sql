-- =============================================
-- PROFILES TABLE (create from scratch for new project)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  pincode TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SERVICES TABLE
-- =============================================
CREATE TABLE public.services (
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
CREATE POLICY "Anyone can read services" ON public.services FOR SELECT USING (true);

INSERT INTO public.services (name, slug, description, icon_name, base_price, duration_minutes, category) VALUES
  ('Plumbing', 'plumbing', 'Pipe repairs, leaks, installations', 'Wrench', 299, 60, 'home'),
  ('Electrical', 'electrical', 'Wiring, fixtures, safety checks', 'Zap', 349, 90, 'home'),
  ('House Cleaning', 'cleaning', 'Deep clean, regular maintenance', 'Sparkles', 499, 120, 'home'),
  ('Painting', 'painting', 'Interior & exterior painting', 'PaintBucket', 799, 240, 'home'),
  ('AC Service', 'ac-service', 'AC installation, repair, gas refill', 'Wind', 599, 90, 'appliance'),
  ('Carpentry', 'carpentry', 'Furniture repair, custom woodwork', 'Hammer', 449, 120, 'home'),
  ('Pest Control', 'pest-control', 'Cockroach, termite, rodent control', 'Bug', 799, 60, 'home'),
  ('HVAC', 'hvac', 'Heating, ventilation & air systems', 'Thermometer', 699, 120, 'appliance'),
  ('Appliance Repair', 'appliance-repair', 'Washing machine, fridge, microwave', 'Settings', 399, 60, 'appliance'),
  ('Home Salon', 'salon', 'Haircut, waxing, facials at home', 'Scissors', 599, 90, 'beauty');

-- =============================================
-- SERVICE PROVIDERS TABLE
-- =============================================
CREATE TABLE public.service_providers (
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
CREATE POLICY "Anyone can read providers" ON public.service_providers FOR SELECT USING (true);

-- =============================================
-- PROVIDER <-> SERVICES JUNCTION TABLE
-- =============================================
CREATE TABLE public.provider_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price NUMERIC(10,2),
  UNIQUE(provider_id, service_id)
);

ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read provider_services" ON public.provider_services FOR SELECT USING (true);

-- =============================================
-- BOOKINGS TABLE
-- =============================================
CREATE TABLE public.bookings (
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
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  total_amount NUMERIC(10,2),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- =============================================
-- REVIEWS TABLE
-- =============================================
CREATE TABLE public.reviews (
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
CREATE POLICY "Anyone can read reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =============================================
-- SEED: PROVIDERS WITH PINCODES
-- =============================================
INSERT INTO public.service_providers (name, bio, experience_years, rating, total_reviews, total_jobs, base_charge, pincodes, city) VALUES
  ('Rajesh Kumar', 'Expert plumber with 8+ years of experience in residential plumbing', 8, 4.9, 234, 412, 299, ARRAY['380001','380002','380005','380006','380007'], 'Ahmedabad'),
  ('Suresh Patel', 'Certified electrician, specializes in home wiring and safety audits', 6, 4.8, 189, 301, 349, ARRAY['380001','380004','380008','380009'], 'Ahmedabad'),
  ('Meena Sharma', 'Professional house cleaner, eco-friendly products used', 4, 4.7, 156, 289, 499, ARRAY['380002','380003','380005','380006'], 'Ahmedabad'),
  ('Anil Verma', 'Experienced painter, interior and exterior specialist', 10, 4.8, 312, 521, 799, ARRAY['380001','380002','380003','380004','380005'], 'Ahmedabad'),
  ('Priya Nair', 'Trained beauty professional offering home salon services', 5, 4.9, 278, 445, 599, ARRAY['380006','380007','380008','380009'], 'Ahmedabad'),
  ('Deepak Singh', 'AC technician with certification from Daikin and Voltas', 7, 4.7, 198, 367, 599, ARRAY['380001','380002','380003'], 'Ahmedabad'),
  ('Mohan Lal', 'Pest control expert, safe for family and pets', 9, 4.6, 143, 234, 799, ARRAY['380004','380005','380006','380007'], 'Ahmedabad'),
  ('Kavita Reddy', 'Skilled carpenter, furniture repair and custom woodwork', 6, 4.8, 167, 312, 449, ARRAY['380001','380003','380008'], 'Ahmedabad');

-- =============================================
-- SEED: PROVIDER <-> SERVICE LINKS
-- =============================================
DO $$
DECLARE
  v_rajesh UUID; v_suresh UUID; v_meena UUID; v_anil UUID;
  v_priya UUID; v_deepak UUID; v_mohan UUID; v_kavita UUID;
  s_plumbing UUID; s_electrical UUID; s_cleaning UUID; s_painting UUID;
  s_salon UUID; s_ac UUID; s_pest UUID; s_carpentry UUID;
  s_appliance UUID; s_hvac UUID;
BEGIN
  SELECT id INTO v_rajesh FROM public.service_providers WHERE name = 'Rajesh Kumar';
  SELECT id INTO v_suresh FROM public.service_providers WHERE name = 'Suresh Patel';
  SELECT id INTO v_meena FROM public.service_providers WHERE name = 'Meena Sharma';
  SELECT id INTO v_anil FROM public.service_providers WHERE name = 'Anil Verma';
  SELECT id INTO v_priya FROM public.service_providers WHERE name = 'Priya Nair';
  SELECT id INTO v_deepak FROM public.service_providers WHERE name = 'Deepak Singh';
  SELECT id INTO v_mohan FROM public.service_providers WHERE name = 'Mohan Lal';
  SELECT id INTO v_kavita FROM public.service_providers WHERE name = 'Kavita Reddy';

  SELECT id INTO s_plumbing FROM public.services WHERE slug = 'plumbing';
  SELECT id INTO s_electrical FROM public.services WHERE slug = 'electrical';
  SELECT id INTO s_cleaning FROM public.services WHERE slug = 'cleaning';
  SELECT id INTO s_painting FROM public.services WHERE slug = 'painting';
  SELECT id INTO s_salon FROM public.services WHERE slug = 'salon';
  SELECT id INTO s_ac FROM public.services WHERE slug = 'ac-service';
  SELECT id INTO s_pest FROM public.services WHERE slug = 'pest-control';
  SELECT id INTO s_carpentry FROM public.services WHERE slug = 'carpentry';
  SELECT id INTO s_appliance FROM public.services WHERE slug = 'appliance-repair';
  SELECT id INTO s_hvac FROM public.services WHERE slug = 'hvac';

  INSERT INTO public.provider_services (provider_id, service_id, custom_price) VALUES
    (v_rajesh, s_plumbing, 299),
    (v_suresh, s_electrical, 349),
    (v_suresh, s_appliance, 399),
    (v_meena, s_cleaning, 499),
    (v_anil, s_painting, 799),
    (v_priya, s_salon, 599),
    (v_deepak, s_ac, 599),
    (v_deepak, s_hvac, 699),
    (v_mohan, s_pest, 799),
    (v_kavita, s_carpentry, 449),
    (v_rajesh, s_appliance, 350),
    (v_kavita, s_appliance, 420);
END $$;
