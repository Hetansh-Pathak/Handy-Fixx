-- APPLY STEP 2 (arrived status) FOR REAL. Run this file ALONE as its own query.
-- Adding an enum value cannot be undone, so it has no BEGIN/ROLLBACK.
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'arrived' AFTER 'on_the_way';
