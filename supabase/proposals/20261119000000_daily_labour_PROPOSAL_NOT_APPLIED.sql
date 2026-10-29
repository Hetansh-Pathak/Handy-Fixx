-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Owner decision 2026-10-29: add "Daily Labour" (workers by the day) and house help by the day. The wages are NOT
-- decided yet, so every price below is a DEFAULT that is meant to be edited:
--   * HandyFix edits the default and the allowed range on the admin "Price bands" page (min / catalogue / max).
--   * Each pro may set their own rate for a job inside that range (My services), as for every other service.
-- Number of workers = separate jobs per count ("1 worker", "2 workers", "3 workers"), so the existing locked price and
-- price bands apply without any table, trigger or policy change. Data only. Prices are per job as written:
-- "2 workers - Full Day" is the price for both workers together.
--
-- Defaults (rupees):   Half day (4 hrs)   Full day (8 hrs)
--   1 worker                400                700
--   2 workers               800               1400
--   3 workers              1200               2100
--   House help by the day   350                600
-- Default band: 70% to 150% of the default (pros can ask a little less or more, never wildly different).
--
-- "Lady worker only" is NOT part of this: it needs a verified gender field in the pro identity check (own slice).
-- Safe to re-run: the service is matched by slug and a job is skipped when the service already has one with the same
-- name. House help jobs are added only if the Home Help service exists. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.services (name, slug, description, icon_name, base_price, duration_minutes, category, is_active)
SELECT 'Daily Labour', 'daily-labour', 'Workers by the day for any manual work', 'Users', 400, 240, 'help', true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE slug = 'daily-labour');

INSERT INTO public.service_sub_items (service_id, section, name, description, icon, base_price, duration_minutes, sort_order, price_min, price_max, is_active)
SELECT s.id, v.section, v.name, v.description, v.icon, v.base_price, v.duration_minutes, v.ord,
       round(v.base_price * 0.7), round(v.base_price * 1.5), true
FROM (VALUES
  ('1 worker',  '1 Worker - Half Day (4 Hours)',  'One worker for half a day of general manual work', '👷', 400,  240, 1),
  ('1 worker',  '1 Worker - Full Day (8 Hours)',  'One worker for a full working day',               '👷', 700,  480, 2),
  ('2 workers', '2 Workers - Half Day (4 Hours)', 'Two workers together for half a day',              '👥', 800,  240, 3),
  ('2 workers', '2 Workers - Full Day (8 Hours)', 'Two workers together for a full working day',      '👥', 1400, 480, 4),
  ('3 workers', '3 Workers - Half Day (4 Hours)', 'Three workers together for half a day',            '👥', 1200, 240, 5),
  ('3 workers', '3 Workers - Full Day (8 Hours)', 'Three workers together for a full working day',    '👥', 2100, 480, 6)
) AS v(section, name, description, icon, base_price, duration_minutes, ord)
JOIN public.services s ON s.slug = 'daily-labour'
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_sub_items x WHERE x.service_id = s.id AND lower(x.name) = lower(v.name)
);

INSERT INTO public.service_sub_items (service_id, section, name, description, icon, base_price, duration_minutes, sort_order, price_min, price_max, is_active)
SELECT s.id, v.section, v.name, v.description, v.icon, v.base_price, v.duration_minutes, v.ord,
       round(v.base_price * 0.7), round(v.base_price * 1.5), true
FROM (VALUES
  ('By the day', 'House Help - Half Day (4 Hours)', 'One house help for half a day of daily chores', '🧹', 350, 240, 100),
  ('By the day', 'House Help - Full Day (8 Hours)', 'One house help for a full day of daily chores', '🧹', 600, 480, 101)
) AS v(section, name, description, icon, base_price, duration_minutes, ord)
JOIN public.services s ON s.slug = 'home-help'
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_sub_items x WHERE x.service_id = s.id AND lower(x.name) = lower(v.name)
);

-- ─── ROLLBACK ───
-- Only while no booking uses them (bookings reference services and jobs):
-- DELETE FROM public.service_sub_items WHERE service_id = (SELECT id FROM public.services WHERE slug = 'daily-labour');
-- DELETE FROM public.services WHERE slug = 'daily-labour';
-- DELETE FROM public.service_sub_items WHERE service_id = (SELECT id FROM public.services WHERE slug = 'home-help') AND section = 'By the day';
-- If bookings exist, hide instead: UPDATE public.services SET is_active = false WHERE slug = 'daily-labour';
