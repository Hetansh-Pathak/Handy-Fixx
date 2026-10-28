-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Why (found 2026-10-28 by a rolled-back test on the live project)
--   A customer CANNOT submit a review today. Inserting one fails with
--   "Cannot change rating directly." because four AFTER INSERT triggers on public.reviews all
--   update service_providers, and the KYC guard (prevent_privileged_column_update) only lets
--   rating / total_reviews change when the 'kyc.internal_update' flag is set; only one of the
--   four triggers sets it. Besides that:
--     * update_provider_rating also does total_jobs = total_jobs + 1 on every REVIEW. Jobs are
--       already counted on completion (update_provider_earnings_totals), so this double counts
--       and distorts the fee-free launch period ("first 10 jobs").
--     * Two triggers each notify the pro, so every review sends two notifications.
--     * Nothing stops two reviews for one booking, although the product rule (PDF p.4) is one review
--       per completed booking.
--     * Three INSERT policies are OR-ed together; "Customers can create reviews" and
--       "auth_insert_review" let any signed-in user insert a review for ANY booking or pro
--       (fake reviews), not only for their own completed booking.
--
-- What this does
--   1. One review per booking (unique index on booking_id). The 7 existing reviews are for 7 different bookings.
--   2. BEFORE INSERT check: the booking must exist, be completed and belong to the signed-in customer. The
--      provider, customer, service name are then taken FROM THE BOOKING, never trusted from the app.
--   3. ONE AFTER INSERT trigger recomputes rating and total_reviews (with the guard flag), without touching total_jobs.
--   4. Keeps notify_on_review (one notification per review); the three redundant triggers are dropped.
--   5. Drops the two loose INSERT policies; the existing "reviews_insert" policy stays.
--
-- What it does NOT do: change any past rating, any booking, or the wallet.
-- Safe to re-run. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_booking ON public.reviews (booking_id);

CREATE OR REPLACE FUNCTION public.validate_review_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  v_customer uuid;
BEGIN
  SELECT id, customer_id, user_id, provider_id, status, service_id INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = '22023';
  END IF;
  v_customer := COALESCE(b.customer_id, b.user_id);
  IF auth.uid() IS NOT NULL AND v_customer IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only review your own booking.' USING ERRCODE = '42501';
  END IF;
  IF b.status::text <> 'completed' THEN
    RAISE EXCEPTION 'You can review a job once it is completed.' USING ERRCODE = '22023';
  END IF;
  IF b.provider_id IS NULL THEN
    RAISE EXCEPTION 'This booking has no pro to review.' USING ERRCODE = '22023';
  END IF;
  NEW.customer_id  := v_customer;
  NEW.user_id      := v_customer;
  NEW.provider_id  := b.provider_id;
  NEW.service_name := COALESCE((SELECT name FROM public.services WHERE id = b.service_id), NEW.service_name);
  NEW.reviewer_name := COALESCE(NULLIF(trim(NEW.reviewer_name), ''), 'A customer');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_validate_review ON public.reviews;
CREATE TRIGGER a_validate_review
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_insert();

CREATE OR REPLACE FUNCTION public.refresh_provider_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('kyc.internal_update', 'true', true);
  UPDATE public.service_providers SET
    rating        = (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;
  PERFORM set_config('kyc.internal_update', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_review_created ON public.reviews;      -- also bumped total_jobs and tripped the guard
DROP TRIGGER IF EXISTS on_review_submitted ON public.reviews;    -- duplicate notification
DROP TRIGGER IF EXISTS update_rating_on_review ON public.reviews;
DROP TRIGGER IF EXISTS refresh_rating_after_review ON public.reviews;
CREATE TRIGGER refresh_rating_after_review
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_provider_rating();
-- notify_on_review (notify_provider_on_review) is kept: one notification per review.

DROP POLICY IF EXISTS "Customers can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "auth_insert_review" ON public.reviews;
-- "reviews_insert" stays: the booking must be the customer's own completed booking.

-- ─── ROLLBACK (restores the previous, broken behaviour; the old functions were left in place) ───
-- DROP TRIGGER IF EXISTS a_validate_review ON public.reviews;
-- DROP TRIGGER IF EXISTS refresh_rating_after_review ON public.reviews;
-- CREATE TRIGGER on_review_created AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_provider_rating();
-- CREATE TRIGGER on_review_submitted AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION handle_review_submitted();
-- CREATE TRIGGER update_rating_on_review AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_provider_rating_on_review();
-- DROP INDEX IF EXISTS public.reviews_one_per_booking;
-- CREATE POLICY "Customers can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);
-- CREATE POLICY "auth_insert_review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
