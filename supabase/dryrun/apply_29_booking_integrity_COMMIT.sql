-- APPLY (saves). Run 29_booking_integrity_DRYRUN.sql first. Then make a normal test booking in the customer app (it must still work).
BEGIN;
-- =====================================================================================================================
-- PROPOSAL 20261125000004: booking integrity (found by the attack walkthrough)             NOT APPLIED. ASK FIRST.
-- =====================================================================================================================
-- Findings: docs/SECURITY_ATTACK_WALKTHROUGH.md (W1 to W3). Live functions and triggers read 2026-11-01. Independent of
-- the other proposals. Re-run safe. Changes no fee, price, dispatch or wallet rule.
--
--   1. W1  The money and status guards on bookings fire on UPDATE only. On the first INSERT a customer could choose any
--          column the app never sets: status = 'completed' or 'confirmed', payment_status = 'paid', completed_at, coupon
--          and final amount, arrival / location evidence, dispatch state, created_at. Consequences:
--            * a booking born 'completed' for ANY approved pro lets the customer leave a review (fake or revenge
--              ratings), raise a dispute against that pro, and costs the platform the 3% fee (the fee settles on the
--              pending -> completed UPDATE, which never happens);
--            * a booking born 'confirmed' forces a job onto a chosen pro without them accepting it, skipping the wallet
--              check (that check is also UPDATE only);
--            * a booking born with payment_status = 'paid' makes the pro believe the customer already paid.
--          Fix: a BEFORE INSERT trigger for app users (not for the server): the booking must start as
--          'pending' (an error otherwise), and every server-owned column is reset to its normal starting value. The app
--          never sends any of these (checked in apps/mobile/src/features/customer/booking-api.ts), so nothing changes
--          for real bookings.
--   2. W2  Completion codes came from random() (not secure). Same 4 digits, now from a secure random source.
--   3. W3  add_booking_extra accepted any text as the bill-photo path. A pro could point it at someone else's file path;
--          the storage rule lets the booking's parties read a file that one of their extras names. Now the path must be
--          <your auth id>/<this booking id>/... (what the app builds). Body copied from the live function; one check added.
-- Rollback at the end.
-- =====================================================================================================================

-- ─── 1. Bookings are born pending, with server-owned columns at their starting values ──────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_booking_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  -- The server (definer functions, SQL editor, service role) may create any booking. Signed-in users, admins included
  -- (the admin site never creates bookings), may only start a plain pending one.
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF NEW.status::text IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'A new booking must start as pending.' USING ERRCODE = '42501';
  END IF;

  NEW.payment_status        := 'unpaid';
  NEW.final_amount          := NULL;
  NEW.coupon_code           := NULL;
  NEW.coupon_discount       := 0;
  NEW.started_at            := NULL;
  NEW.completed_at          := NULL;
  NEW.cancelled_at          := NULL;
  NEW.cancellation_reason   := NULL;
  NEW.arrived_at            := NULL;
  NEW.arrived_lat           := NULL;
  NEW.arrived_lng           := NULL;
  NEW.provider_departed_at  := NULL;
  NEW.provider_eta_minutes  := NULL;
  NEW.provider_location_lat := NULL;
  NEW.provider_location_lng := NULL;
  NEW.provider_lat          := NULL;
  NEW.provider_lng          := NULL;
  NEW.last_location_update  := NULL;
  NEW.tracking_active       := false;
  NEW.unread_messages_customer := 0;
  NEW.unread_messages_provider := 0;
  NEW.dispatch_state        := NULL;
  NEW.current_ring          := NULL;
  NEW.ring_deadline         := NULL;
  NEW.searched_since        := NULL;
  NEW.search_ends_at        := NULL;
  NEW.dispatch_accepted_at  := NULL;
  NEW.created_at            := now();
  NEW.updated_at            := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_booking_insert() FROM PUBLIC, anon, authenticated;

-- "zz" so it runs after the owner sync and the price check (BEFORE triggers run in name order).
DROP TRIGGER IF EXISTS zz_guard_booking_insert ON public.bookings;
CREATE TRIGGER zz_guard_booking_insert BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_insert();

-- ─── 2. Completion codes from a secure random source ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_booking_completion_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.booking_completion_codes (booking_id, code)
  -- gen_random_uuid() is cryptographically random; 8 hex digits = 32 bits, taken modulo 10000 (bias is below 0.0003%).
  VALUES (NEW.id, lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 10000)::text, 4, '0'))
  ON CONFLICT (booking_id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.generate_booking_completion_code() FROM PUBLIC, anon, authenticated;

-- ─── 3. add_booking_extra: the bill photo must be the pro's own file for this booking ───────────────────────────────
CREATE OR REPLACE FUNCTION public.add_booking_extra(p_booking_id uuid, p_title text, p_amount numeric, p_kind text DEFAULT 'labour'::text, p_photo_path text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pid uuid;
  b     record;
  v_id  uuid;
BEGIN
  SELECT id INTO v_pid FROM public.service_providers WHERE user_id = auth.uid();
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF v_pid IS NULL OR NOT FOUND OR b.provider_id IS DISTINCT FROM v_pid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;
  IF b.status::text NOT IN ('on_the_way','arrived','in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  IF COALESCE(p_kind, 'labour') NOT IN ('labour','parts') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  IF char_length(TRIM(COALESCE(p_title, ''))) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_title');
  END IF;
  IF p_kind = 'parts' AND COALESCE(p_photo_path, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'photo_required');
  END IF;
  -- NEW: the file must be in the caller's own folder for this booking (the app uploads to <auth id>/<booking id>/<time>.jpg).
  IF COALESCE(p_photo_path, '') <> ''
     AND (left(p_photo_path, length(auth.uid()::text) + length(p_booking_id::text) + 2) <> auth.uid()::text || '/' || p_booking_id::text || '/'
          OR p_photo_path LIKE '%..%') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_photo');
  END IF;
  IF (SELECT COUNT(*) FROM public.booking_extras WHERE booking_id = p_booking_id AND status = 'pending') >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_pending');
  END IF;

  INSERT INTO public.booking_extras (booking_id, provider_id, title, kind, amount, photo_path)
  VALUES (p_booking_id, v_pid, TRIM(p_title), COALESCE(p_kind, 'labour'), ROUND(p_amount), NULLIF(p_photo_path, ''))
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (b.customer_id, 'extra_work', 'Approve extra work: Rs ' || ROUND(p_amount)::text,
            TRIM(p_title) || '. Your price stays Rs ' || COALESCE(b.total_amount, 0)::text || ' unless you approve.',
            b.id, jsonb_build_object('extra_id', v_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.add_booking_extra(uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_booking_extra(uuid, text, numeric, text, text) TO authenticated, service_role;

-- =====================================================================================================================
-- ROLLBACK
--   1. DROP TRIGGER IF EXISTS zz_guard_booking_insert ON public.bookings;  DROP FUNCTION IF EXISTS public.guard_booking_insert();
--   2. Re-create generate_booking_completion_code with  lpad(floor(random() * 10000)::int::text, 4, '0')  (old body).
--   3. Re-create add_booking_extra without the "NEW" photo path check (old body is in supabase/proposals/20261107000000_*).
-- =====================================================================================================================

COMMIT;
