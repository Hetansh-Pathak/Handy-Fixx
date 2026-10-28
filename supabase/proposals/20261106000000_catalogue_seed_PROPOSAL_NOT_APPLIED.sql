-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL, NOT APPLIED.
--
-- Fills the catalogue with 67 new sub-services (service_sub_items) under the EXISTING services, matched by slug.
-- Prices: about 15% below Urban Company's Ahmedabad price, snapped to a clean ₹…9 price (rule and sources in
-- docs/catalogue-research.md). They are catalogue "Starts at" prices only; a pro's own rate stays in the admin band.
--
-- Safe by design:
--   * INSERT only. Nothing is updated or deleted; existing sub-items and prices stay exactly as they are.
--   * No new services: every category maps to an existing services row (electrical, plumbing, ac-service,
--     carpentry, cleaning, appliance-repair, salon). A slug that does not exist simply inserts nothing.
--   * Idempotent: a row is skipped when the same service already has a sub-item with the same name
--     (case-insensitive). service_sub_items has no unique key on (service_id, name) in the repo, so ON CONFLICT
--     alone could not prevent duplicates; ON CONFLICT DO NOTHING is kept for any key the live table does have.
--   * New rows sort after the existing ones of their service.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.service_sub_items (service_id, name, description, icon, base_price, duration_minutes, sort_order, is_active)
SELECT s.id, v.name, v.description, v.icon, v.base_price, v.duration_minutes,
       COALESCE((SELECT max(x.sort_order) FROM public.service_sub_items x WHERE x.service_id = s.id), 0) + v.ord,
       true
FROM (VALUES
  ('electrical', 'Switchboard Installation', 'New switchboard fitted and tested', '🔌', 249, 30, 1),
  ('electrical', 'Fan Repair', 'Ceiling, exhaust or wall fan fixed', '🌀', 169, 30, 2),
  ('electrical', 'Fan Regulator Repair', 'Regulator repaired or replaced', '🎛️', 89, 10, 3),
  ('electrical', 'Chandelier Installation', 'Chandelier mounted and wired safely', '✨', 449, 60, 4),
  ('electrical', 'Doorbell Installation', 'Wired or wireless doorbell fitted', '🔔', 79, 30, 5),
  ('electrical', 'Submeter Installation', 'Separate meter for a room or floor', '📟', 279, 60, 6),
  ('electrical', 'Inverter Installation', 'Inverter and battery connected to home', '🔋', 399, 60, 7),
  ('electrical', 'Inverter Servicing', 'Inverter checked, cleaned and tuned', '🔋', 219, 45, 8),
  ('electrical', 'Stabiliser Installation', 'Voltage stabiliser fitted for appliances', '⚡', 149, 30, 9),
  ('electrical', 'Geyser Installation', 'Geyser mounted, plumbed and wired', '🌡️', 499, 60, 10),
  ('electrical', 'TV Wall Mounting', 'TV mounted on wall with bracket', '📺', 299, 45, 11),
  ('electrical', 'Electrician Visit', 'Inspection and quote for any job', '🧰', 129, 45, 12),
  ('plumbing', 'Tap Repair', 'Leaking or stiff tap fixed', '🚰', 119, 20, 13),
  ('plumbing', 'Wash Basin Installation', 'Basin fixed with waste pipe', '🪥', 399, 45, 14),
  ('plumbing', 'Jet Spray Installation', 'Health faucet fitted near toilet', '🚿', 119, 30, 15),
  ('plumbing', 'Flush Tank Repair', 'Running or weak flush fixed', '🚽', 139, 30, 16),
  ('plumbing', 'Toilet Blockage Removal', 'Blocked toilet cleared completely', '🪠', 1099, 130, 17),
  ('plumbing', 'Shower Installation', 'Shower head or panel fitted', '🚿', 139, 30, 18),
  ('plumbing', 'Bathroom Drain Unblocking', 'Slow or blocked bathroom drain cleared', '🕳️', 349, 120, 19),
  ('plumbing', 'Water Tank Cleaning', 'Overhead tank emptied, scrubbed, disinfected', '🛢️', 699, 120, 20),
  ('plumbing', 'Water Motor Installation', 'Pump motor fitted and tested', '⚙️', 399, 60, 21),
  ('plumbing', 'Plumber Visit', 'Inspection and quote for any job', '🧰', 129, 45, 22),
  ('ac-service', 'Foam-Jet Service (Split AC)', 'Foam and jet wash for split AC', '💨', 499, 60, 23),
  ('ac-service', 'Jet Service (Window AC)', 'Jet wash for window AC', '🪟', 399, 45, 24),
  ('ac-service', 'Anti-Rust Deep Clean', 'Deep clean with anti-rust coil coating', '🛡️', 899, 90, 25),
  ('ac-service', 'AC Check-up', 'Diagnosis of cooling, noise or leaks', '🩺', 249, 45, 26),
  ('ac-service', 'AC Water Leak Repair', 'Indoor unit dripping water fixed', '💧', 599, 60, 27),
  ('carpentry', 'Door Lock Installation', 'New main or room lock fitted', '🔒', 499, 60, 28),
  ('carpentry', 'Door Lock Repair', 'Stuck or broken lock repaired', '🔑', 229, 90, 29),
  ('carpentry', 'Door Hinge Replacement', 'Sagging door fixed with new hinges', '🚪', 249, 30, 30),
  ('carpentry', 'Cupboard Hinge Fix', 'Loose cupboard doors realigned', '🗄️', 149, 30, 31),
  ('carpentry', 'Drawer Channel Replacement', 'Smooth sliding drawers again', '🗃️', 219, 30, 32),
  ('carpentry', 'Curtain Rod Installation', 'Curtain rod fitted with brackets', '🪟', 169, 30, 33),
  ('carpentry', 'Drill & Hang', 'Frames, clocks or decor hung', '🖼️', 109, 20, 34),
  ('carpentry', 'Wall Shelf Installation', 'Wooden shelf fixed level and strong', '📚', 249, 60, 35),
  ('carpentry', 'Bed Repair', 'Creaking or broken bed support fixed', '🛏️', 399, 60, 36),
  ('carpentry', 'Carpenter Visit', 'Inspection and quote for any job', '🧰', 129, 45, 37),
  ('cleaning', 'Bathroom Deep Cleaning', 'Tiles, fittings and floor scrubbed', '🛁', 499, 60, 38),
  ('cleaning', 'Move-in Bathroom Cleaning', 'Fresh start for a new home', '🧽', 599, 90, 39),
  ('cleaning', 'Kitchen Deep Cleaning', 'Cabinets, slab, tiles and sink degreased', '🍳', 1449, 180, 40),
  ('cleaning', 'Chimney Cleaning', 'Filters and hood degreased', '🧯', 599, 90, 41),
  ('cleaning', 'Fridge Cleaning', 'Inside, shelves and seals cleaned', '🧊', 399, 45, 42),
  ('cleaning', 'Sofa Cleaning', 'Fabric sofa shampooed and vacuumed', '🛋️', 449, 60, 43),
  ('cleaning', 'Mattress Cleaning', 'Dust mites and stains removed', '🛏️', 399, 45, 44),
  ('cleaning', 'Carpet Cleaning', 'Carpet shampooed and vacuumed', '🧶', 399, 45, 45),
  ('cleaning', 'Ceiling Fan Cleaning', 'Blades and motor housing wiped', '🌀', 99, 15, 46),
  ('cleaning', 'Partial Home Cleaning', 'Chosen rooms deep cleaned', '🧹', 2149, 165, 47),
  ('cleaning', 'Empty Flat Deep Cleaning', 'Whole unfurnished flat deep cleaned', '🏠', 3149, 210, 48),
  ('cleaning', 'Full Home Deep Cleaning', 'Whole furnished flat deep cleaned', '🏡', 3399, 235, 49),
  ('appliance-repair', 'Washing Machine Check-up', 'Diagnosis before any repair', '🩺', 169, 60, 50),
  ('appliance-repair', 'Washing Machine Installation', 'Inlet, drain and level set up', '🧺', 349, 45, 51),
  ('appliance-repair', 'Washing Machine Deep Service', 'Drum and parts descaled and cleaned', '🫧', 949, 90, 52),
  ('appliance-repair', 'Refrigerator Check-up', 'Cooling and noise problems diagnosed', '🧊', 169, 60, 53),
  ('appliance-repair', 'Microwave Check-up', 'Heating or turntable problems diagnosed', '📡', 169, 30, 54),
  ('appliance-repair', 'TV Check-up', 'Display, sound or power issues diagnosed', '📺', 219, 45, 55),
  ('appliance-repair', 'Chimney Deep Service', 'Motor and filters serviced', '🔥', 999, 90, 56),
  ('appliance-repair', 'Water Purifier Service', 'RO filters checked and serviced', '🚰', 249, 45, 57),
  ('salon', 'Threading', 'Eyebrow and upper lip shaping', '🧵', 89, 15, 58),
  ('salon', 'Face Waxing', 'Gentle wax for face', '🪒', 169, 20, 59),
  ('salon', 'Full Legs Waxing', 'Smooth legs with quality wax', '🦵', 499, 40, 60),
  ('salon', 'Full Arms & Underarms Waxing', 'Arms and underarms waxed', '💪', 549, 40, 61),
  ('salon', 'Face Cleanup', 'Cleanse, scrub and mask for glow', '🧖', 1149, 45, 62),
  ('salon', 'Glow Facial', 'Brightening facial with massage', '💆', 1799, 80, 63),
  ('salon', 'Manicure', 'Nails shaped, cleaned and polished', '💅', 849, 45, 64),
  ('salon', 'Pedicure', 'Soak, scrub and foot massage', '🦶', 1349, 60, 65),
  ('salon', 'Men''s Haircut', 'Haircut and styling at home', '💇‍♂️', 229, 30, 66),
  ('salon', 'Head & Shoulder Massage', 'Relaxing head, neck, shoulder massage', '💆‍♂️', 249, 20, 67)
) AS v(slug, name, description, icon, base_price, duration_minutes, ord)
JOIN public.services s ON s.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_sub_items e
  WHERE e.service_id = s.id AND lower(e.name) = lower(v.name)
)
ON CONFLICT DO NOTHING;

-- ── Check after applying (read-only) ────────────────────────────────────────
-- SELECT s.slug, count(*) FROM public.service_sub_items i JOIN public.services s ON s.id = i.service_id
--  GROUP BY s.slug ORDER BY s.slug;

-- ── Rollback: removes exactly the rows this file adds (same service + name), nothing else ──
-- DELETE FROM public.service_sub_items i
-- USING public.services s, (VALUES
--   ('electrical', 'Switchboard Installation'),
--   ('electrical', 'Fan Repair'),
--   ('electrical', 'Fan Regulator Repair'),
--   ('electrical', 'Chandelier Installation'),
--   ('electrical', 'Doorbell Installation'),
--   ('electrical', 'Submeter Installation'),
--   ('electrical', 'Inverter Installation'),
--   ('electrical', 'Inverter Servicing'),
--   ('electrical', 'Stabiliser Installation'),
--   ('electrical', 'Geyser Installation'),
--   ('electrical', 'TV Wall Mounting'),
--   ('electrical', 'Electrician Visit'),
--   ('plumbing', 'Tap Repair'),
--   ('plumbing', 'Wash Basin Installation'),
--   ('plumbing', 'Jet Spray Installation'),
--   ('plumbing', 'Flush Tank Repair'),
--   ('plumbing', 'Toilet Blockage Removal'),
--   ('plumbing', 'Shower Installation'),
--   ('plumbing', 'Bathroom Drain Unblocking'),
--   ('plumbing', 'Water Tank Cleaning'),
--   ('plumbing', 'Water Motor Installation'),
--   ('plumbing', 'Plumber Visit'),
--   ('ac-service', 'Foam-Jet Service (Split AC)'),
--   ('ac-service', 'Jet Service (Window AC)'),
--   ('ac-service', 'Anti-Rust Deep Clean'),
--   ('ac-service', 'AC Check-up'),
--   ('ac-service', 'AC Water Leak Repair'),
--   ('carpentry', 'Door Lock Installation'),
--   ('carpentry', 'Door Lock Repair'),
--   ('carpentry', 'Door Hinge Replacement'),
--   ('carpentry', 'Cupboard Hinge Fix'),
--   ('carpentry', 'Drawer Channel Replacement'),
--   ('carpentry', 'Curtain Rod Installation'),
--   ('carpentry', 'Drill & Hang'),
--   ('carpentry', 'Wall Shelf Installation'),
--   ('carpentry', 'Bed Repair'),
--   ('carpentry', 'Carpenter Visit'),
--   ('cleaning', 'Bathroom Deep Cleaning'),
--   ('cleaning', 'Move-in Bathroom Cleaning'),
--   ('cleaning', 'Kitchen Deep Cleaning'),
--   ('cleaning', 'Chimney Cleaning'),
--   ('cleaning', 'Fridge Cleaning'),
--   ('cleaning', 'Sofa Cleaning'),
--   ('cleaning', 'Mattress Cleaning'),
--   ('cleaning', 'Carpet Cleaning'),
--   ('cleaning', 'Ceiling Fan Cleaning'),
--   ('cleaning', 'Partial Home Cleaning'),
--   ('cleaning', 'Empty Flat Deep Cleaning'),
--   ('cleaning', 'Full Home Deep Cleaning'),
--   ('appliance-repair', 'Washing Machine Check-up'),
--   ('appliance-repair', 'Washing Machine Installation'),
--   ('appliance-repair', 'Washing Machine Deep Service'),
--   ('appliance-repair', 'Refrigerator Check-up'),
--   ('appliance-repair', 'Microwave Check-up'),
--   ('appliance-repair', 'TV Check-up'),
--   ('appliance-repair', 'Chimney Deep Service'),
--   ('appliance-repair', 'Water Purifier Service'),
--   ('salon', 'Threading'),
--   ('salon', 'Face Waxing'),
--   ('salon', 'Full Legs Waxing'),
--   ('salon', 'Full Arms & Underarms Waxing'),
--   ('salon', 'Face Cleanup'),
--   ('salon', 'Glow Facial'),
--   ('salon', 'Manicure'),
--   ('salon', 'Pedicure'),
--   ('salon', 'Men''s Haircut'),
--   ('salon', 'Head & Shoulder Massage')
-- ) AS v(slug, name)
-- WHERE s.id = i.service_id AND s.slug = v.slug AND lower(i.name) = lower(v.name)
--   AND i.created_at >= '2026-10-28';
