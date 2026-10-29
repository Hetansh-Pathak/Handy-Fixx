-- DRY RUN: nothing is saved (ends with ROLLBACK). Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
-- Owner decision 2026-10-29: the fee-free launch is the first 10 jobs OR the first 1 month after
-- approval, whichever ends first (was 3 months). Only the body of provider_launch_active() changes
-- (the applied 20261102000001 stays untouched). Safe to re-run; independent of 20261114.
-- Packages/shared keeps the same numbers in LAUNCH_PERIOD (fee-sql.test.ts checks this file).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.provider_launch_active(p_provider_id uuid, p_exclude_booking uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_approved timestamptz;
  v_done     integer;
BEGIN
  SELECT kyc_reviewed_at INTO v_approved FROM public.service_providers WHERE id = p_provider_id;
  IF v_approved IS NULL THEN RETURN false; END IF;                  -- not approved yet: the clock has not started
  IF now() >= v_approved + interval '1 months' THEN RETURN false; END IF;

  SELECT count(*) INTO v_done
  FROM public.bookings b
  WHERE b.provider_id = p_provider_id
    AND b.status::text = 'completed'
    AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking);
  RETURN v_done < 10;
END;
$$;

-- Rollback (restores the 3-month rule):
--   re-run the same CREATE OR REPLACE with interval '3 months'.
SELECT pg_get_functiondef('public.provider_launch_active(uuid,uuid)'::regprocedure) LIKE '%interval ''1 months''%' AS launch_is_one_month;
ROLLBACK;
