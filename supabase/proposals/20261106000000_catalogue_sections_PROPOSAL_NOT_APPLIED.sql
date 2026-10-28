-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED. Apply BEFORE 20261106000001_catalogue_seed_PROPOSAL_NOT_APPLIED.sql.
--
-- Catalogue structure: sections inside each service (like "Select a service" on Urban Company).
--   1. service_sub_items.section (text, nullable): the group a sub-service is shown under ("Fan", "Toilet" …).
--   2. A new service "Home Help" (slug home-help, category help) for domestic work.
--   3. Every existing sub-service gets its section and a display order (sort_order) so sections appear in a sensible
--      order. Names and prices are NOT touched. Only rows whose section is still empty are updated.
--
-- The app reads the column if it exists; without it, sub-services show as one list exactly as today.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_sub_items ADD COLUMN IF NOT EXISTS section text;

INSERT INTO public.services (name, slug, description, long_description, icon, icon_name, base_price, duration_minutes, category, is_active)
SELECT 'Home Help', 'home-help', 'Jhadu-pocha, utensils, dusting and daily help', 'Trusted local help for everyday chores: sweeping and mopping, utensils, dusting, laundry and more.',
       'Sparkles', 'Sparkles', 99, 60, 'help', true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE slug = 'home-help');

UPDATE public.service_sub_items i
SET section = v.section, sort_order = v.ord
FROM public.services s, (VALUES
  ('plumbing', 'Water Heater Service', 'Bath fittings', 3),
  ('plumbing', 'Drain Cleaning', 'Drainage', 12),
  ('plumbing', 'Toilet Repair', 'Toilet', 17),
  ('plumbing', 'Tap/Faucet Replacement', 'Tap & mixer', 35),
  ('plumbing', 'Pipe Leak Repair', 'Water pipes', 48),
  ('plumbing', 'New Pipe Installation', 'Water pipes', 49),
  ('electrical', 'Switch/Socket Repair', 'Switch & socket', 1),
  ('electrical', 'Fan Installation', 'Fan', 11),
  ('electrical', 'Light Fixture Install', 'Wall/ceiling light', 18),
  ('electrical', 'Wiring & Rewiring', 'Wiring', 27),
  ('electrical', 'Safety Inspection', 'Wiring', 30),
  ('electrical', 'MCB/Fuse Box Repair', 'MCB & submeter', 33),
  ('carpentry', 'Wardrobe/Cabinet Fix', 'Cupboard & drawer', 5),
  ('carpentry', 'Modular Kitchen Fix', 'Cupboard & drawer', 6),
  ('carpentry', 'Door/Window Repair', 'Door', 15),
  ('carpentry', 'Furniture Repair', 'Furniture repair', 39),
  ('carpentry', 'Furniture Assembly', 'Furniture repair', 40),
  ('carpentry', 'Custom Woodwork', 'Furniture repair', 41),
  ('ac-service', 'AC Deep Cleaning', 'Service', 11),
  ('ac-service', 'AC Annual Maintenance', 'Service', 12),
  ('ac-service', 'AC Repair & Service', 'Repair & gas refill', 14),
  ('ac-service', 'AC Gas Refill', 'Repair & gas refill', 15),
  ('ac-service', 'AC Installation', 'Installation/uninstallation', 19),
  ('ac-service', 'AC Uninstallation', 'Installation/uninstallation', 20),
  ('appliance-repair', 'Washing Machine Repair', 'Washing machine', 2),
  ('appliance-repair', 'Refrigerator Repair', 'Refrigerator', 6),
  ('appliance-repair', 'TV Repair', 'Television', 8),
  ('appliance-repair', 'Microwave Repair', 'Microwave', 12),
  ('appliance-repair', 'Geyser/Water Heater', 'Geyser', 14),
  ('appliance-repair', 'Dishwasher Repair', 'Dishwasher', 32),
  ('pest-control', 'Cockroach Control', 'Cockroach & ants', 1),
  ('pest-control', 'Termite Treatment', 'Termite', 2),
  ('pest-control', 'Rodent Control', 'Rodents', 3),
  ('pest-control', 'Bed Bug Treatment', 'Bed bugs', 4),
  ('pest-control', 'Mosquito Control', 'Mosquito', 5),
  ('pest-control', 'Annual Pest Package', 'Packages & visit', 6),
  ('painting', '1 Room Interior Paint', 'Rooms & flats', 1),
  ('painting', 'Full Flat Painting', 'Rooms & flats', 2),
  ('painting', 'Exterior Painting', 'Exterior & waterproofing', 3),
  ('painting', 'Waterproofing', 'Exterior & waterproofing', 4),
  ('painting', 'Texture/Design Paint', 'Design & wood', 5),
  ('painting', 'Wood Polish/Paint', 'Design & wood', 6)
) AS v(slug, name, section, ord)
WHERE s.id = i.service_id AND s.slug = v.slug AND i.name = v.name AND i.section IS NULL;

-- ── Check (read-only) ───────────────────────────────────────────────────────
-- SELECT s.slug, i.section, count(*) FROM public.service_sub_items i JOIN public.services s ON s.id = i.service_id
--  GROUP BY 1, 2 ORDER BY 1, 2;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- (only before any new sub-service uses it) ALTER TABLE public.service_sub_items DROP COLUMN section;
-- DELETE FROM public.services WHERE slug = 'home-help' AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.service_id = services.id);
-- Original sort_order values were 1..6 within each service in the listed order.
