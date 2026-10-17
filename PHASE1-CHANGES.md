# Phase 1 — Customer app: mobile-first speed & feel

## What changed
- **Persistent app shell** (`components/shell/AppShell.tsx`): navbar, bottom tab bar and footer mount once; only page content swaps with a 160ms fade. Navbar/Footer removed from every page.
- **Mobile tab bar** (`BottomNav.tsx`): Home / Services / Bookings / Alerts / Profile, live badges, safe-area aware, tap-active-tab scrolls to top. Hidden on auth and the booking flow.
- **Splash**: was a forced 2.4s on every load. Now cold-start only, 0.7s, never blocks the app.
- **Caching** (`lib/queryClient.ts`, `lib/queries.ts`): 24h in-memory cache; public catalogue (services, sub-items, home sections) persisted to localStorage; **user data (profile, bookings, notifications) is never written to disk**; everything wiped on sign-out.
- **Bug fixed**: Service page re-fetched with a loading state every 15s, blanking the screen. It now refreshes silently in the background.
- **Prefetching** (`lib/routeModules.ts`, `hooks/usePrefetchService.ts`): page code is warmed on idle (skipped on data-saver/2G), and a service card's page + data load on hover/touch-start.
- **AppContext** moved to cached queries, one realtime channel instead of two.
- **Home page**: below-the-fold sections split into a lazy chunk. Entry JS 351 kB → 209 kB (gzip 111 → 67 kB).
- **PWA**: manifest, icons (incl. maskable), service worker precaching the app shell, font + map-tile caching. Supabase API responses are deliberately not cached by the service worker.
- **Mobile polish**: viewport-fit=cover + safe-area insets, 100dvh, 16px inputs (stops iOS zoom), no tap delay, no overscroll bounce, reduced-motion respected, fonts via preconnect instead of CSS @import.

## Not done / needs your eyes
- Not visually tested in a real browser (no headless browser in my sandbox). Please run `npm run dev` and check on a phone-sized viewport.
- Booking.tsx, MyBookings.tsx, Notifications.tsx, Profile.tsx still fetch with their own effects; they benefit from the shell and prefetch but not yet from the query cache.
- Provider app and admin app are untouched.
