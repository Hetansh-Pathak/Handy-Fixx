-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Bug (found by the owner on the Pro app, 2026-10-28): the "I've arrived" button does nothing.
-- Cause (read-only check of the live project): the `arrived` status exists in the enum, but the live trigger
-- `zz_guard_booking_update` (function guard_booking_update) only lets a pro move:
--   confirmed > on_the_way / in_progress / cancelled
--   on_the_way > in_progress / cancelled          <- no `arrived`
--   in_progress > cancelled
-- so on_the_way > arrived and arrived > in_progress are both refused ("Invalid status change"). It also refuses the
-- `tracking_active` column, which the trip steps write (the app works around that today, but then the customer's
-- "live tracking" flag is never switched off).
--
-- What this changes: ONLY the body of public.guard_booking_update(). Everything else in it is word for word the same
-- (customers, other users, the money columns, `completed` still blocked for pros).
--   1. Pro transitions now follow the PDF lifecycle:
--        confirmed > on_the_way / in_progress / cancelled
--        on_the_way > arrived / in_progress / cancelled
--        arrived > in_progress / cancelled
--        in_progress > cancelled
--      (confirmed > in_progress and on_the_way > in_progress stay legal so older app builds keep working.)
--   2. `tracking_active` joins the columns a pro may change on their own booking.
--
-- Safe to re-run. Rollback is at the bottom. Run the dry run first (it ends with ROLLBACK).
-- After applying, nothing else is needed: the app already has EXPO_PUBLIC_ARRIVED_STATUS=1 on the owner's machine.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_is_provider boolean;
  v_is_customer boolean;
  v_changed     text[];
  v_allowed     text[];
  v_chat        constant text[] := ARRAY['unread_messages_provider','unread_messages_customer','updated_at'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(COALESCE(n.key, o.key)), ARRAY[]::text[]) INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n
  FULL JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
  WHERE n.value IS DISTINCT FROM o.value;

  IF cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  v_is_provider := v_uid IS NOT NULL AND OLD.provider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.service_providers sp WHERE sp.id = OLD.provider_id AND sp.user_id = v_uid);
  v_is_customer := v_uid IS NOT NULL AND v_uid::text IN (
    COALESCE(to_jsonb(OLD)->>'user_id', ''), COALESCE(to_jsonb(OLD)->>'customer_id', ''));

  -- Provider: trip + accept/decline columns only, valid transitions only, never 'completed'.
  IF v_is_provider THEN
    v_allowed := v_chat || ARRAY['status','started_at','provider_departed_at','provider_eta_minutes','tracking_active','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Providers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'pending'     AND NEW.status IN ('confirmed','cancelled'))
      OR (OLD.status = 'confirmed'   AND NEW.status IN ('on_the_way','in_progress','cancelled'))
      OR (OLD.status = 'on_the_way'  AND NEW.status IN ('arrived','in_progress','cancelled'))
      OR (OLD.status = 'arrived'     AND NEW.status IN ('in_progress','cancelled'))
      OR (OLD.status = 'in_progress' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid status change % -> % (completion requires the customer code)', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Customer: cancel while pending/confirmed, plus chat counters.
  IF v_is_customer THEN
    v_allowed := v_chat || ARRAY['status','cancelled_at','cancellation_reason'];
    IF EXISTS (SELECT 1 FROM unnest(v_changed) c WHERE c <> ALL (v_allowed)) THEN
      RAISE EXCEPTION 'Customers cannot change these booking fields' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         OLD.status IN ('pending','confirmed') AND NEW.status = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Customers can only cancel a pending or confirmed booking' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to update this booking' USING ERRCODE = '42501';
END;
$function$;

-- ROLLBACK (puts the old rules back): re-run the CREATE OR REPLACE above with these two edits reverted:
--   remove 'tracking_active' from v_allowed, and remove the two lines for on_the_way > arrived and the `arrived` line.

-- Proof inside the transaction: the new rules are in place (prints true, true), then everything is undone.
SELECT pg_get_functiondef('public.guard_booking_update()'::regprocedure) LIKE '%IN (''arrived'',''in_progress'',''cancelled'')%' AS allows_arrived,
       pg_get_functiondef('public.guard_booking_update()'::regprocedure) LIKE '%tracking_active%' AS allows_tracking_flag;
ROLLBACK;
