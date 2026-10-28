-- APPLY: LABOUR & SHIFTING SERVICE FOR REAL. Ends with COMMIT. Run the dry run first.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Do not run until you have read this header.
--
-- Goal (owner, 2026-10-29): a "Labour & Shifting" service for heavy lifting: loading and unloading, shifting heavy
-- furniture and appliances, carrying up stairs, a helper by the hour or day, site helpers. Prices approved by the owner.
--
-- One helper per booking unless the job says "2 helpers" (bookings have no workers count yet; that comes with the
-- daily-labour slice). The customer pays the helper directly, like every other service. Data only: no table,
-- policy, trigger or function changes. Pros see it on My services and turn it on like any other service.
--
-- Safe to re-run: the service is matched by slug and a job is skipped when the service already has one with the
-- same name. Rollback is at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.services (name, slug, description, icon_name, base_price, duration_minutes, category, is_active)
SELECT 'Labour & Shifting', 'labour-shifting', 'Helpers for heavy lifting, loading and shifting', 'Truck', 299, 120, 'help', true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE slug = 'labour-shifting');

INSERT INTO public.service_sub_items (service_id, section, name, description, icon, base_price, duration_minutes, sort_order, is_active)
SELECT s.id, v.section, v.name, v.description, v.icon, v.base_price, v.duration_minutes, v.ord, true
FROM (VALUES
  ('Helper by the hour or day', 'Helper – 2 Hours', 'One helper for lifting and carrying, up to 2 hours', '💪', 299, 120, 1),
  ('Helper by the hour or day', 'Helper – Half Day (4 Hours)', 'One helper for 4 hours of lifting and shifting', '💪', 449, 240, 2),
  ('Helper by the hour or day', 'Helper – Full Day (8 Hours)', 'One helper for a full working day', '💪', 799, 480, 3),
  ('Helper by the hour or day', '2 Helpers – 2 Hours', 'Two helpers for heavier loads, up to 2 hours', '👥', 549, 120, 4),
  ('Shifting heavy items', 'Fridge / Washing Machine Shifting', 'Moved safely within the house or to the vehicle', '🧊', 249, 45, 5),
  ('Shifting heavy items', 'Almirah / Sofa / Bed Shifting', 'One heavy furniture item moved', '🛋️', 299, 60, 6),
  ('Shifting heavy items', 'Carry Up Stairs (per floor, up to 50 kg)', 'Items carried one floor up or down', '🪜', 99, 20, 7),
  ('Loading & site work', 'Truck / Tempo Loading or Unloading', 'Goods loaded onto or unloaded from one vehicle', '🚚', 399, 120, 8),
  ('Loading & site work', 'Construction Site Helper – Full Day', 'Carrying bricks, cement, sand and material for a day', '🧱', 749, 480, 9),
  ('Loading & site work', 'Debris / Scrap Clearing – 2 Hours', 'Rubble, scrap or garden waste bagged and moved out', '🗑️', 349, 120, 10)
) AS v(section, name, description, icon, base_price, duration_minutes, ord)
JOIN public.services s ON s.slug = 'labour-shifting'
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_sub_items x WHERE x.service_id = s.id AND lower(x.name) = lower(v.name)
);

-- ─── ROLLBACK ───
-- Only while no booking uses it (bookings reference services):
-- DELETE FROM public.service_sub_items WHERE service_id = (SELECT id FROM public.services WHERE slug = 'labour-shifting');
-- DELETE FROM public.services WHERE slug = 'labour-shifting';
-- If bookings exist, hide it instead: UPDATE public.services SET is_active = false WHERE slug = 'labour-shifting';

-- ─── CHECK ───
SELECT s.name, s.slug, count(i.id) AS jobs FROM public.services s LEFT JOIN public.service_sub_items i ON i.service_id = s.id WHERE s.slug = 'labour-shifting' GROUP BY s.id;
COMMIT;
