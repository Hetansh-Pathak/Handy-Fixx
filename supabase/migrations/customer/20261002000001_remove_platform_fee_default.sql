-- Migration: Remove default value from bookings.platform_fee
-- Purpose : platform_fee must now always be set explicitly by the application
--           (12% of provider_amount). Dropping the DB default prevents rows
--           with a stale / wrong default from being silently inserted.
--
-- Status  : PENDING — review before running against production.
--           Check first: SELECT column_default FROM information_schema.columns
--                        WHERE table_name='bookings' AND column_name='platform_fee';
--           If the result is already NULL, this migration is a no-op.

ALTER TABLE public.bookings
  ALTER COLUMN platform_fee DROP DEFAULT;
