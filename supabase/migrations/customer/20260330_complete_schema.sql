-- ─────────────────────────────────────────
-- EXTEND PROFILES (already exists)
-- ─────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ─────────────────────────────────────────
-- SERVICES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  long_description TEXT,
  icon_name TEXT DEFAULT 'Wrench',
  image_url TEXT,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 299,
  duration_minutes INT DEFAULT 60,
  category TEXT DEFAULT 'home',
  is_active BOOLEAN DEFAULT true,
  booking_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Patch columns that may be missing if table already existed
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS icon_name TEXT DEFAULT 'Wrench';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 60;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'home';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS booking_count INT DEFAULT 0;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_services" ON public.services;
CREATE POLICY "public_read_services" ON public.services FOR SELECT USING (true);

INSERT INTO public.services (name, slug, description, long_description, icon_name, base_price, duration_minutes, category, booking_count) VALUES
('Plumbing',        'plumbing',        'Pipe repairs, leaks, drain cleaning',        'Our certified plumbers handle everything from minor leaks to full pipe replacements. All work is guaranteed for 30 days.',       'Wrench',       299, 60,  'home',      1240),
('Electrical',      'electrical',      'Wiring, fixtures, MCB & safety checks',      'Licensed electricians for safe, code-compliant work. From switch replacements to full panel upgrades.',                           'Zap',          349, 90,  'home',      980),
('House Cleaning',  'cleaning',        'Deep clean, regular maintenance',            'Thorough top-to-bottom cleaning using eco-friendly products. Move-in/out specials available.',                                      'Sparkles',     499, 120, 'home',      2100),
('Painting',        'painting',        'Interior & exterior, texture & waterproof',  'Expert painters with premium paints. We protect your furniture and clean up completely after the job.',                            'PaintBucket',  799, 240, 'home',      670),
('AC Service',      'ac-service',      'Installation, repair, gas refill',           'Daikin/Voltas-certified technicians. Annual maintenance contracts available at discounted rates.',                                  'Wind',         599, 90,  'appliance', 1560),
('Carpentry',       'carpentry',       'Furniture repair, custom woodwork',          'Skilled carpenters for modular furniture assembly, repair, and custom builds. Home visit for free estimate.',                       'Hammer',       449, 120, 'home',      430),
('Pest Control',    'pest-control',    'Cockroach, termite, rodent control',         'Government-approved chemicals. Safe for children and pets after 4 hours. 90-day re-treatment guarantee.',                          'Bug',          799, 60,  'home',      890),
('Appliance Repair','appliance-repair','Washing machine, fridge, microwave repair',  'Multi-brand repair experts. Genuine spare parts used. 60-day warranty on all repairs.',                                           'Settings',     399, 60,  'appliance', 720),
('Home Salon',      'salon',           'Haircut, waxing, facials at your doorstep',  'Trained beauty professionals bringing salon-quality services home. Hygienic tools, premium products.',                             'Scissors',     599, 90,  'beauty',    1890),
('HVAC',            'hvac',            'Heating, ventilation & air systems',         'Complete HVAC installation, servicing, and repair. Energy audits and efficiency upgrades available.',                               'Thermometer',  699, 120, 'appliance', 310)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  long_description = EXCLUDED.long_description,
  base_price = EXCLUDED.base_price,
  booking_count = EXCLUDED.booking_count;

-- ─────────────────────────────────────────
-- SERVICE PROVIDERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  initials TEXT,
  bio TEXT,
  experience_years INT DEFAULT 1,
  rating NUMERIC(3,2) DEFAULT 4.5,
  total_reviews INT DEFAULT 0,
  total_jobs INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  pincodes TEXT[] DEFAULT '{}',
  city TEXT DEFAULT 'Ahmedabad',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Patch columns that may be missing if table already existed
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS initials TEXT;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 1;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS total_reviews INT DEFAULT 0;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS total_jobs INT DEFAULT 0;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT true;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS pincodes TEXT[] DEFAULT '{}';
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Ahmedabad';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_providers'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.service_providers ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_providers" ON public.service_providers;
CREATE POLICY "public_read_providers" ON public.service_providers FOR SELECT USING (true);

INSERT INTO public.service_providers (name, full_name, initials, bio, experience_years, rating, total_reviews, total_jobs, pincodes, city) VALUES
('Rajesh Kumar',  'Rajesh Kumar',  'RK', 'Expert plumber certified by ISI. Handles residential and commercial plumbing with precision and care.', 8, 4.9, 234, 412, ARRAY['380001','380002','380005','380006','380007','380009'], 'Ahmedabad'),
('Suresh Patel',  'Suresh Patel',  'SP', 'Licensed electrician with expertise in home wiring, solar setups, and safety inspections.', 6, 4.8, 189, 301, ARRAY['380001','380004','380008','380009','380006'], 'Ahmedabad'),
('Meena Sharma',  'Meena Sharma',  'MS', 'Professional cleaner using eco-certified products. Specialises in deep cleaning and sanitisation.', 4, 4.7, 156, 289, ARRAY['380002','380003','380005','380006','380001'], 'Ahmedabad'),
('Anil Verma',    'Anil Verma',    'AV', 'Master painter with 10 years of experience in residential and commercial spaces. Waterproof and texture specialist.', 10, 4.8, 312, 521, ARRAY['380001','380002','380003','380004','380005'], 'Ahmedabad'),
('Priya Nair',    'Priya Nair',    'PN', 'Trained at VLCC. Offers haircuts, waxing, facials, and bridal packages at home.', 5, 4.9, 278, 445, ARRAY['380006','380007','380008','380009','380002'], 'Ahmedabad'),
('Deepak Singh',  'Deepak Singh',  'DS', 'Daikin and Voltas certified AC technician. Handles all brands, all models.', 7, 4.7, 198, 367, ARRAY['380001','380002','380003','380005'], 'Ahmedabad'),
('Mohan Lal',     'Mohan Lal',     'ML', 'Pest control specialist using government-approved, pet-safe chemicals.', 9, 4.6, 143, 234, ARRAY['380004','380005','380006','380007','380003'], 'Ahmedabad'),
('Kavita Reddy',  'Kavita Reddy',  'KR', 'Skilled carpenter for furniture assembly, repairs, and custom woodwork.', 6, 4.8, 167, 312, ARRAY['380001','380003','380008','380007'], 'Ahmedabad'),
('Amit Shah',     'Amit Shah',     'AS', 'Multi-brand appliance repair expert. Washing machines, fridges, microwaves. Genuine parts only.', 5, 4.7, 121, 198, ARRAY['380001','380002','380004','380006'], 'Ahmedabad'),
('Ritu Desai',    'Ritu Desai',    'RD', 'HVAC specialist with expertise in central air systems, VRF units, and commercial ventilation.', 8, 4.8, 145, 267, ARRAY['380003','380005','380007','380009'], 'Ahmedabad');

UPDATE public.service_providers
SET full_name = name
WHERE full_name IS NULL AND name IS NOT NULL;

-- ─────────────────────────────────────────
-- PROVIDER ↔ SERVICES JUNCTION
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price NUMERIC(10,2),
  UNIQUE(provider_id, service_id)
);
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_provider_services" ON public.provider_services;
CREATE POLICY "public_read_provider_services" ON public.provider_services FOR SELECT USING (true);

-- Link providers to services
INSERT INTO public.provider_services (provider_id, service_id, custom_price)
SELECT sp.id, sv.id, NULL
FROM public.service_providers sp, public.services sv
WHERE (sp.name='Rajesh Kumar' AND sv.slug='plumbing')
   OR (sp.name='Suresh Patel' AND sv.slug='electrical')
   OR (sp.name='Meena Sharma' AND sv.slug='cleaning')
   OR (sp.name='Anil Verma'   AND sv.slug='painting')
   OR (sp.name='Priya Nair'   AND sv.slug='salon')
   OR (sp.name='Deepak Singh' AND sv.slug='ac-service')
   OR (sp.name='Mohan Lal'    AND sv.slug='pest-control')
   OR (sp.name='Kavita Reddy' AND sv.slug='carpentry')
   OR (sp.name='Amit Shah'    AND sv.slug='appliance-repair')
   OR (sp.name='Ritu Desai'   AND sv.slug='hvac')
   -- Extra cross-links
   OR (sp.name='Rajesh Kumar' AND sv.slug='appliance-repair')
   OR (sp.name='Suresh Patel' AND sv.slug='hvac')
   OR (sp.name='Deepak Singh' AND sv.slug='hvac')
   OR (sp.name='Meena Sharma' AND sv.slug='plumbing')
   OR (sp.name='Anil Verma'   AND sv.slug='carpentry')
ON CONFLICT (provider_id, service_id) DO NOTHING;

-- ─────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref TEXT UNIQUE DEFAULT 'HF-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.service_providers(id),
  service_id UUID REFERENCES public.services(id),
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT NOT NULL,
  city TEXT,
  special_instructions TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','in_progress','completed','cancelled')),
  payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded')),
  service_charge NUMERIC(10,2),
  platform_fee NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_time TIME;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN scheduled_date DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_bookings_select" ON public.bookings;
DROP POLICY IF EXISTS "users_own_bookings_insert" ON public.bookings;
DROP POLICY IF EXISTS "users_own_bookings_update" ON public.bookings;
CREATE POLICY "users_own_bookings_select" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_own_bookings_insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_bookings_update" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_service_booking_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.services SET booking_count = booking_count + 1 WHERE id = NEW.service_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.increment_service_booking_count();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  rating INT CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  comment TEXT,
  reviewer_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_reviews" ON public.reviews;
DROP POLICY IF EXISTS "auth_insert_review" ON public.reviews;
CREATE POLICY "public_read_reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "auth_insert_review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.service_providers SET
    rating = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_jobs = total_jobs + 1
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_review_created ON public.reviews;
CREATE TRIGGER on_review_created
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating();

-- ─────────────────────────────────────────
-- CONTACT MESSAGES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread','read','replied')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_insert_contact" ON public.contact_messages;
CREATE POLICY "anyone_insert_contact" ON public.contact_messages FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────
-- PRO APPLICATIONS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  pincode TEXT NOT NULL,
  service_category TEXT NOT NULL,
  experience_years INT NOT NULL,
  has_tools BOOLEAN DEFAULT false,
  id_proof_type TEXT,
  about TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.pro_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_insert_application" ON public.pro_applications;
CREATE POLICY "anyone_insert_application" ON public.pro_applications FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────
-- ENABLE REALTIME
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
  END IF;
END $$;
