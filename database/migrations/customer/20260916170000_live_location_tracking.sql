-- Live provider tracking shared by handyfix-user and handyfix-provider.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- bookings.status is TEXT with a CHECK on a clean database, so there is no enum to extend. Only touch the enum
-- when this database really has one; 20261013000000_integrity_repairs.sql widens the CHECK for the text case.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE n.nspname = 'public' AND t.typname = 'booking_status') THEN
    ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'on_the_way';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.provider_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assigned users can view provider location" ON public.provider_locations;
CREATE POLICY "Assigned users can view provider location"
  ON public.provider_locations FOR SELECT TO authenticated
  USING (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = provider_locations.booking_id
        AND b.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Providers can insert own location" ON public.provider_locations;
CREATE POLICY "Providers can insert own location"
  ON public.provider_locations FOR INSERT TO authenticated
  WITH CHECK (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = provider_locations.booking_id
        AND b.provider_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Providers can update own location" ON public.provider_locations;
CREATE POLICY "Providers can update own location"
  ON public.provider_locations FOR UPDATE TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'provider_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_locations;
  END IF;
END $$;
