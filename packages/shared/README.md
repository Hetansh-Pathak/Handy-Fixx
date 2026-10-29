# @handyfix/shared

Pure, tested business logic shared by `apps/mobile` and `apps/admin`. No React, no DOM, no
React Native imports, so it runs identically on Hermes, Node and the browser. Consumed as
TypeScript source (no build step).

```bash
npm run test -w @handyfix/shared            # Vitest
npm run test:coverage -w @handyfix/shared   # thresholds enforced (see vitest.config.ts)
```

Time-dependent functions take `now: Date` as an argument. Never call `new Date()` inside logic.

## Modules

| Module | What it owns | Source of truth |
|---|---|---|
| `money/fee` | 3% of the service bill, min ₹5, max ₹50 (owner 2026-10-29, replaces the PDF slabs), customer fee = ₹0 | owner |
| `money/price-band` | Admin band check, clamp, inclusive bounds | PDF p.3 |
| `money/bill` | Final bill, approved-only extras, parts excluded from fee, extra-work validation and approve/decline | PDF p.3, p.5 |
| `money/launch` | Fee-free launch: first 3 months or first 10 jobs | PDF p.6 |
| `money/wallet` | Recharge packs ₹49/₹99/₹199, "covers about N jobs", accept check ("Recharge ₹49 to accept"), job settlement with a fee held at accept (charge / release / waive; old dues only for jobs accepted before holds) | PDF p.7–8, owner 2026-10-29 |
| `money/money` | `formatInr` with Indian grouping (no `Intl` dependency) | legacy `inr()` |
| `booking/status` | Lifecycle, who may transition, provider primary button per step, customer buttons per state | PDF p.5, p.7, p.10 |
| `booking/schedule` | Slots, 8-day window, past-slot hiding, date/time display (no `Intl`) | legacy `Booking.tsx` |
| `booking/validation` | Zod: pincode, email, 6-digit OTP, Indian mobile, 3-step booking | legacy `Booking.tsx`, OTP functions |
| `booking/completion-code` | 4-digit code, `complete_booking_with_code` reply → one UI message | legacy `CompleteJobDialog` |
| `booking/cancellation` | 3 late cancellations in 30 days pauses instant booking for 7 days | PDF p.4 |
| `booking/dispute` | 24 h / 48 h windows, reply and decision deadlines, outcomes | PDF p.11 |
| `booking/tracking` | ETA and distance text, stale-position rule (60 s) | PDF p.4 |
| `booking/request-outcome` | Waiting / expired / declined / accepted, "offer next pros" rule | PDF p.4 |
| `booking/grouping` | In-progress vs past bookings, when the code card and map show | PDF p.10 |
| `booking/request-timer` | 30 s accept countdown | PDF p.6 |
| `providers/ranking` | Rank by rating → distance → response speed (never money), featured slots, next-best offers | PDF p.4, p.12 |
| `geo/distance` | Haversine km, distance formatting | new |
| `kyc/kyc` | 9 steps, Aadhaar (Verhoeff) and PAN checks, masks, file validation, 18+ check | legacy `constants.ts` |
| `auth/roles` | One role per account, role → home route (`/customer`, `/provider`), background-location rule | locked decisions |
| `auth/session-role` | Role resolution (provider row wins, else remembered role), who may become a pro | locked decisions |
| `auth/schemas` | Zod: sign-in/up, reset, pro phone, customer profile; friendly auth error messages | legacy auth screens |
| `auth/deep-link` | Parses Supabase links (`#access_token=…&type=recovery`) | new |
| `provider/job-flow` | Button per step, the booking patch each button writes, decline, progress (x of 4 or 3), phone visibility, pro-side status wording | PDF p.7, legacy provider portal |
| `provider/request` | Open-request window (30 s), oldest-first pick, earning/fee/keep shown on the alert | PDF p.7 |
| `provider/wallet-view` | Live wallet summary → fee-rule state, launch status from approval date, accept-block text | PDF p.6-8 |
| `provider/eta` | Distance → ETA minutes | new |
| `catalog/availability` | Online + fresh-heartbeat rule (90 s), offers-service, serves-area | legacy `ServiceDetail` |
| `catalog/pricing` | Listed price per pro, booking quote (₹0 fee), `reconcileQuote` vs what the database saved | PDF p.2-3 |
| `catalog/display` | Service emoji, duration and rating text | legacy |
| `supabase/client` | `createHandyFixClient`: the only Supabase client factory; throws if config is missing | legacy clients |
| `supabase/edge` | `callEdge` with readable errors | legacy `wallet.ts` |
| `constants/cities` | Gujarat city list | legacy `constants.ts` |

## Assumptions to confirm

The PDF is silent or ambiguous here. Each is a named constant or parameter, so changing it is one line plus a test.

1. **Launch period** ends at whichever limit is hit first (3 months *or* 10 jobs). The clock starts when the provider is approved; `launchStartedAt = null` means not started, so fees apply.
2. **Wallet below the fee at completion:** with a hold (proposal 20261114) no due is ever created; a fee raised by extras past hold + balance is recorded as `uncollected` (at most ₹45). Without a hold (accepted before the change) the uncovered fee becomes a due, and a recharge clears dues first.
3. **"Similar price"** for next-best offers is ±25% (`SIMILAR_PRICE_TOLERANCE`), max 3 pros, same pincode or city, online and KYC-approved.
4. **"Late" cancellation** is not defined in the PDF. `instantBookingPause` takes the late-cancellation timestamps; the caller decides what counts.
5. **Repair quality** (48 h dispute window) is mapped to the `poor_work` reason; every other reason gets 24 h.
6. **Safety reports** (immediate suspension) are mapped to the `behaviour` reason.
7. **Providers** can cancel only a *pending* request (decline). Cancelling after accepting goes through admin.
8. **`arrived` status** is in the PDF lifecycle but not in the database yet. Provider helpers take `{ withArrivedStep: false }` until a migration adds it.
9. **ETA** assumes a steady 25 km/h until a routing service is added.
10. **Fee base** is rate + approved *service* extras. Approved parts are part of what the customer pays but never of the fee base.

## Deliberately not ported from the web apps

- The 12% customer fee (`platform_fee` / `provider_amount` maths): removed by the new model.
- `hashAadhaar`: a client-side SHA-256 with a hard-coded public salt protects nothing, and `crypto.subtle` is missing in React Native. Duplicate detection belongs on the server.
- `compressImage`, `loadRazorpay`, `localStorage` use: DOM-only; mobile uses `expo-image-manipulator`, the Razorpay native SDK and a secure storage adapter.
- The silent fallback to `https://example.supabase.co` when env vars are missing.
- The old date check `date < new Date()`, which disabled *today* once the picker returned midnight.

## Not built yet

React hooks and TanStack Query wrappers (they arrive with the mobile slices that use them); generated
`Database` types (the three copies in the legacy apps are partial and have drifted; regenerate once from
the live project with `supabase gen types`); urgent add-on, visit fee, subscriptions and featured-slot
purchase (the PDF schedules those after in-app payments).
