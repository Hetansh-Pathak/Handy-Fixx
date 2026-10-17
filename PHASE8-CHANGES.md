# Phase 8: Auth, Profile and Brand (customer app)

Not run in a browser or built here (no node_modules / network). Please run in `customer-app`:
`npm install && npm run build && npm test && npm run dev`, then check at 390px wide.

## Brand
- New flat house-and-wrench mark (gold on ink). One geometry drives every asset.
- `src/lib/brand.ts`: product name lives in one place (name is still undecided).
- `src/components/brand/Logo.tsx`: `LogoMark`, `LogoTile`, `BrandLockup` (inline SVG, crisp at any size).
- Regenerated: `favicon.svg`, `favicon.ico`, `icon-192/512`, `icon-maskable-512` (mark inside Android safe zone),
  `apple-touch-icon`, `logo.png`, `src/assets/logo.svg|png`. Provider and admin apps got the same logo files.
- Splash: ink background, gold mark; reduced-motion aware.
- PWA manifest colors fixed (were the old cream `#faf6ef`); favicon.svg linked in `index.html`.

## Auth (login, sign up, forgot, reset)
- Shared `AuthLayout`: ink header + white sheet on phones, split panel on desktop.
- Inline validation, plain-language errors (`src/lib/authErrors.ts`), correct autocomplete/keyboard hints,
  show/hide password, "Log in instead" / "Reset your password" shortcuts, "Browse as guest".
- Kept: `?redirect=`, `?mode=signup`, Google flow + `handyfix_google_auth_mode` key, welcome email, profile-setup redirect.
- Fixed: the "already signed in" redirect could race the profile-setup redirect right after login.
- Hardened: `?redirect=` only accepts in-app paths.
- Reset password: no longer depends on the URL hash (the Supabase client can clear it first). Expired links get a clear
  screen with "Request a new link". Added confirm field. Forgot password: resend with 30s cooldown, email prefill.

## Profile
- Ink identity card with real booking counts (the old page counted only the last 3 bookings).
- Setup checklist, grouped fields, save bar that appears only when something changed, discard, unsaved-safe.
- Validation (name, 10-digit mobile, 6-digit pincode); detects a missing profile row instead of a false "saved".
- Shortcuts with live badges, log-out confirmation (there was no mobile log-out before).
- Removed: the "Recent bookings" list (My Bookings is one tap away).

## Tests
`src/test/authErrors.test.ts`, `src/test/profileForm.test.ts` (13 cases).

## Before the Play Store
- In-app account deletion is required by Google Play for apps with sign-up (needs a backend function).
- Privacy policy + terms pages and URLs.
- Google sign-in is blocked inside a WebView: use a native Google sign-in plugin in the Capacitor build.
