-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Adds the `arrived` booking status from the PDF lifecycle:
--   pending > confirmed > on_the_way > ARRIVED > in_progress > completed
--
-- BEFORE running: run supabase/verify/05_booking_status_and_triggers_READONLY.sql.
--   * If bookings.status is an ENUM (booking_status): this file is needed.
--   * If it is plain text and no CHECK constraint lists statuses: you do not need this file at all.
--
-- Run this file ON ITS OWN, as its own query. PostgreSQL does not allow a newly added enum value
-- to be used in the same transaction that adds it.
--
-- Until it is applied the mobile app keeps working: it goes on_the_way > in_progress and shows
-- "STEP x OF 3" instead of "x OF 4" (EXPO_PUBLIC_ARRIVED_STATUS is not set to 1).
-- After applying, set EXPO_PUBLIC_ARRIVED_STATUS=1 in the app build.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'arrived' AFTER 'on_the_way';

-- If the verify script showed a CHECK constraint that lists statuses, it must also allow 'arrived'
-- (replace the constraint name and list below with what the check printed):
-- ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
-- ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
--   CHECK (status IN ('pending','confirmed','on_the_way','arrived','in_progress','completed','cancelled'));
