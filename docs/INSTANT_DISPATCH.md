# Instant dispatch (Rapido-style matching)

Owner decision 2026-10-31, branch `feature/instant-dispatch`. **Replaces "customer picks a pro".** The customer picks a
service (and job), the server offers the job to eligible pros in widening rings around the customer, and the first pro
to accept gets it. CLAUDE.md "Product decisions" is updated when the feature is finished (slice 5).

## Owner answers (2026-10-31)

1. "All pros in Jamnagar" = a **city zone: centre 22.4707, 70.0577, radius 20 km**, editable in `dispatch_settings`.
   Not `service_providers.city`: on the live project every approved pro says "Ahmedabad" (read-only check), while 60 of
   74 bookings are in Jamnagar.
2. **Distance only.** The pros' pincode lists are not used for instant dispatch.
3. A pro whose wallet is too low **still gets the offer**, shown as "Top up ₹X to accept", and counts in "N pros notified".

## Rules

| Rule | Value (default, all in `dispatch_settings`) |
|---|---|
| Rings | 2 km, 5 km, 10 km (10 s each), then the whole city zone until the search ends |
| Empty ring | skipped at once (a ring that adds no new pro is not waited on) |
| Cumulative | earlier pros can still accept while later rings are open |
| Max search | 120 s, then "No pro available right now" |
| Keep looking | +10 minutes on the city ring |
| Nobody online at all | "no pro" immediately (with "Schedule for later") |
| Eligible pro | KYC approved, status active, online, heartbeat < 90 s, offers the service, inside a ring |
| Order inside a ring | distance, then rating, never money |
| Winner | first accept; atomic (row lock); everyone else sees "Taken by another pro" |
| Price | one catalogue price (job price, else service price), locked at request, platform fee ₹0; pro rates not used |
| Time | "Now" by default; "Schedule for later" uses the existing clock picker; same dispatch |
| Pro side | no countdown; an offer stays open until accepted or the search ends ("Expired") |
| Privacy | before accept a pro sees service, "about N km away", locality/pincode, earning and fee; never the exact address or phone. The customer sees notified pros as vague amber dots (rounded to ~1 km plus a fixed jitter) |

## Shared logic (slice 1, done)

`packages/shared/src/dispatch/` (39 tests in `dispatch.test.ts`):

- `settings.ts`: `DispatchSettings`, `DEFAULT_DISPATCH_SETTINGS`, `parseDispatchSettings` (bad row → defaults).
- `ring-plan.ts`: `ringForDistance`, `isInCity`, `tickSearch` (one server tick; SQL twin `dispatch_tick`),
  `newSearchClock`, `extendSearchClock`.
- `eligibility.ts`: `dispatchEligibility`, `orderForOffers`, `offerAccess` (the existing wallet accept-check for the button).
- `offer.ts`: `OfferStatus` offered → accepted | taken | expired | withdrawn, `offerTransition` (only once),
  `offerView` (Accept / Top up ₹X / Taken / Expired / Accepted).
- `search.ts`: `DispatchState` searching → assigned | no_pro | cancelled (no_pro → searching via keep looking),
  `searchStatusText`, `stageChips`, `notifiedLine`, `elapsedLabel`, `foundBadge`, `dispatchPrice`,
  `confirmButtonLabel`, `outsideCityMessage`, `jitteredPoint`, `approxDistanceLine`.

Deprecated (kept until the owner confirms they are unused): `rankProviders`, `sortProviders`, `orderWithFeatured`,
`nextBestPros`, `needsAlternatives`.

## Database (slice 2, done: proposal `20261124000000`, NOT applied)

- `dispatch_settings` (one row), `provider_presence` (pro position from the heartbeat, server-only),
  `booking_offers` (one row per booking and pro; a pro reads only their own; Realtime), `dispatch_events` (audit trail).
- `bookings`: a searching booking is `status = 'pending'` with `provider_id IS NULL`, plus `dispatch_state`,
  `current_ring`, `ring_deadline`, `searched_since`, `search_ends_at`.
- RPCs: `report_presence`, `start_dispatch`, `accept_dispatch_offer` (first wins, reuses the live wallet check by
  setting provider + `confirmed` together), `cancel_search`, `extend_search`, `get_offer_card`, `get_search_state`.
- Server tick: `pg_cron` (1.6.4 on the live project supports second schedules) runs `dispatch_tick()` every 3
  seconds, so the search moves on even when the customer closes the app (a ring may last up to 3 s longer than 10 s).
  A scheduled edge function runs at most once a minute: too slow for 10 s rings.
- Works with the live triggers as they are (read-only check 2026-10-31): the price trigger already prices a booking
  without a pro at the catalogue price; the update guard lets server functions through; accepting sets the pro and
  `confirmed` together, so the live wallet and KYC checks, the customer notice and the completion code work unchanged.
  The one live function it changes: `notify_provider_on_new_booking` skips dispatch bookings (it would tell the winner
  "Accept or decline it now"). Offers notify with type `new_booking`, `data.kind = 'dispatch_offer'` (the type is an
  enum without a dispatch value).
- Dry run `supabase/dryrun/23_instant_dispatch_DRYRUN.sql`, apply `apply_23_…`, status `verify/10` row 23,
  APPLY_PLAN row 9.
- Tests: `supabase/tests/instant-dispatch` (`npm install && npm test`): 55 checks on a real throwaway Postgres 17,
  including two pros accepting at the same instant (the second waits on the row lock, then gets "taken") and five at
  once (exactly one wins); plus the dry-run file (runs fully, saves nothing). `dispatch-sql.test.ts` keeps the SQL and
  the shared rules in step.

## Customer screens (slice 3, done; behind `EXPO_PUBLIC_INSTANT_DISPATCH=1`)

The switch stays OFF until the proposal is applied (slice 5): the live database cannot dispatch yet, so today's
"choose a pro" list keeps working. With it ON:

- Service page: no pro list or sorting; pick the job, "Continue · ₹199" (one fixed price).
- `customer/request/new`: locked price + "₹0 platform fee", **Now** by default or "Schedule for later" (existing clock
  picker), pinned position required ("Use my current location"), address/city/pincode, notes, photos/voice note,
  the email-verification and late-cancel pause checks, then **"Find a pro · ₹199"**. The app sends no price (the
  database sets it), saves the booking with no pro and calls `start_dispatch`; if that refuses (outside the city, a
  search already running) the message is shown as written and the empty booking is cancelled.
- `customer/request/[id]` (Finding / Found / No pro): reads `get_search_state` every 2 s while searching.
  `FindingMap` draws a stylised vector city with react-native-svg (no map key), the blue "You" pin with a glow, dashed
  rings (2 km, 5 km, City), a radar sweep (12-slice conic fade, 3.2 s per turn, linear), three pulse rings (scale
  0.25 to 1.35, fading, 2.6 s, staggered 0.87 s) and the notified pros as amber dots (rounded by the server plus a
  fixed jitter) that pop in and breathe. Only transform and opacity are animated (Reanimated); with reduce-motion
  everything stands still. Glass bottom sheet: timer chip (server clock), status line with animated dots (a live
  region, also announced), stage chips, service card, "N pros notified…", Cancel request (confirm first, free).
  Found: rings go, a dashed route from the pro to the customer, the pro's initials marker, "N min away", the pro card
  (verified shield, rating, jobs, ETA, locked price), Message / Track, "Pro found in 38 s". No pro: dimmed map,
  "Keep looking for 10 more minutes", "Schedule for later", "Cancel request".
- `customer/booking/[id]`: a booking that is still searching opens the Finding screen (closing the app loses
  nothing); "Choose another pro instead" and the next-best list are gone.
- Shared: `readSearchSnapshot`, `searchElapsedSeconds`, `matchSeconds`, `ringFractions` / `mapFraction` /
  `mapOffset` (the drawn map is not to scale: rings at fixed fractions, distances interpolated), `etaLine`.
- Browser test `apps/mobile/e2e-web/dispatch-flow.cjs` (23 checks, `npm run test:e2e-dispatch` with the switch on).
- Left for slice 6 (polish): the route drawing itself in, success haptic (`expo-haptics` is a native package: new
  development build), a real dark map when `EXPO_PUBLIC_MAPS_ENABLED=1`, "Ask my previous pro first".

## Not working until push exists (slice 4b, needs the owner's Firebase project)

A pro whose app is **closed** gets no offer. While the Pro app is open (or in the background with the location
service running) offers arrive by Realtime plus a poll, with a full-screen alert and sound.

## Pitch-deck items this changes

"Customer chooses a pro from a ranked list" → automatic matching. "Pros set their own rate inside a band" → not used for
these bookings. "Featured boost / paid visibility" → no list to show it on. "Ranking by rating, distance, response
speed" → only decides who is asked first inside a ring. "30-second accept window" → 10-second rings.
