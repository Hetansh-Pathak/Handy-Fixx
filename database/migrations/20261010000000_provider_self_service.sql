-- Phase 15: provider self-service deactivation.
-- Why: since phase 13/14 the trigger prevent_privileged_column_update blocks clients from changing
-- service_providers.status, so the Settings "Deactivate account" button failed silently (the app still
-- told the provider it worked and signed them out). This SECURITY DEFINER function is the only way now.
-- NOT RUN here (no Postgres in the sandbox). Apply on staging first.

CREATE OR REPLACE FUNCTION public.deactivate_my_provider_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_provider_id FROM public.service_providers WHERE user_id = auth.uid() FOR UPDATE;
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'NO_PROVIDER' USING ERRCODE = 'P0002';
  END IF;

  -- Never abandon customers mid-job.
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE provider_id = v_provider_id AND status IN ('pending', 'confirmed', 'on_the_way', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_BOOKINGS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.service_providers SET status = 'inactive', is_online = false WHERE id = v_provider_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_my_provider_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_my_provider_account() TO authenticated;
