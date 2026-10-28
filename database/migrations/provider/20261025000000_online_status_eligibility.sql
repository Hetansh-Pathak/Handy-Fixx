-- Report the reason an unapproved or inactive provider cannot go online
-- instead of silently forcing the requested value back to false.
CREATE OR REPLACE FUNCTION public.enforce_kyc_before_online()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_online IS TRUE
     AND (NEW.kyc_status IS DISTINCT FROM 'approved'
          OR NEW.status IS DISTINCT FROM 'active') THEN
    RAISE EXCEPTION
      'Provider cannot go online: verification status is "%", account status is "%". Approved verification and an active account are required.',
      COALESCE(NEW.kyc_status, 'unknown'),
      COALESCE(NEW.status, 'unknown')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_kyc_before_online ON public.service_providers;
CREATE TRIGGER enforce_kyc_before_online
  BEFORE UPDATE OF is_online ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kyc_before_online();

CREATE OR REPLACE FUNCTION public.set_provider_online(p_is_online BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_provider public.service_providers%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to change online status.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_provider
  FROM public.service_providers
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider profile not found for the signed-in account.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_online IS TRUE
     AND (v_provider.kyc_status IS DISTINCT FROM 'approved'
          OR v_provider.status IS DISTINCT FROM 'active') THEN
    RAISE EXCEPTION
      'Provider cannot go online: verification status is "%", account status is "%". Approved verification and an active account are required.',
      COALESCE(v_provider.kyc_status, 'unknown'),
      COALESCE(v_provider.status, 'unknown')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('kyc.internal_update', 'true', true);

  UPDATE public.service_providers
  SET is_online = p_is_online
  WHERE id = v_provider.id
  RETURNING * INTO v_provider;

  IF v_provider.is_online IS DISTINCT FROM p_is_online THEN
    RAISE EXCEPTION
      'Database trigger prevented changing provider online status (verification: "%", account: "%").',
      COALESCE(v_provider.kyc_status, 'unknown'),
      COALESCE(v_provider.status, 'unknown')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'is_online', v_provider.is_online,
    'kyc_status', v_provider.kyc_status,
    'status', v_provider.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_provider_online(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_provider_online(BOOLEAN) TO authenticated;
