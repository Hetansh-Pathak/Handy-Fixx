# Changes: animated opening screen and login poster (2026-11-01)

Branch `hetansh2`. UI only, for **both store apps** (customer "apnabanda", Pro "apnabanda Pro"). No business logic, auth logic, database,
Supabase, route behaviour or `legacy/` was touched. **Nothing is pushed.**

Four commits: the words and timing rules (shared), the animated opening screen, the login poster, and this document with the screenshots.

---

## 1. The opening screen: "Black + Blur slap"

`apps/mobile/src/features/splash/` (`AnimatedSplash.tsx`, `Sticker.tsx`, `StickerMotion.tsx`, `splash-host.tsx`), wired in `app/_layout.tsx`.

### Timeline (milliseconds from the moment the splash is on screen)
| At | What | How |
|---|---|---|
| 0 | Two soft glows (blue top-left, amber lower-right) drift into place, 1.2 s | the existing `ScreenBackground` drawing, moved with transform only |
| 200 | The logo **sticker** (white rounded border, drop shadow, tilt) slaps down: from translateY -260, rotate 20 deg, scale 1.4 to rotate -5 deg with a springy overshoot | spring (damping 9, stiffness 140) |
| 800 and 1000 | Two rounded-square rings in brand blue pulse out from behind it (scale 0.9 to 2.1, opacity 0.9 to 0, 700 ms each) | invisible until their moment |
| 850 | A short shake: rotate -5, -1, -8, -5 deg and a 3 px shift, 250 ms | timing sequence |
| 1200 | The wordmark **apna** (white) + **banda** (amber) fades and scales in (0.9 to 1), 500 ms | opacity + scale only |
| 1600 | The tagline fades up (12 px rise), 400 ms | |
| 2000 | The pill fades up, 400 ms. Customer: frosted pill. Pro: the dark PRO logo pill (`AppLogo pro`) | |
| about 2500 | The animation is done. It **leaves** when the app is also ready: a 200 ms fade into the first route | |

**No blur is animated** (CLAUDE.md: never animate blur). The "sharpen" of the wordmark is opacity plus scale. Everything is transform and
opacity through Reanimated (already a dependency, already used by the app), so it stays on the UI thread on a low-end Android phone.
The splash is always dark, **also when the phone is in the Light theme**: a new `DarkScope` in `theme/theme.tsx` gives everything inside it the Dark
palette (classes and `useThemeColors()` alike). The only colours come from the palette.

### The gate (when it leaves) and the rules
Pure functions in `packages/shared/src/splash/gate.ts`, tested:
- It **plays while** fonts, theme and the auth/session check load. It leaves only when **both** the animation has finished **and** the app is ready.
- Animation 2.5 s. If the app is still loading after **3.5 s** the final frame stays and a **small spinner** appears (never a blank wait). Fade-out 200 ms.
- **Cold start only.** The JS process outlives a trip to the background, so a module flag means "not again". (The OS killing the app counts as a cold start.)
- **Reduced motion** (`useReducedMotion`, the phone's setting): no movement. The final frame is shown at once and held about **600 ms**, then the same fade.
- `EXPO_PUBLIC_SKIP_SPLASH=1` turns it off (the browser tests use it).
- The **native splash** (`expo-splash-screen`) keeps the same `#05070D` background, so there is no white flash. It is hidden as soon as the JS splash is
  on screen (its first `onLayout`). With the splash off, the native splash is hidden when the app is ready, exactly as before. Fonts moved from
  `Navigator` up to `RootLayout` (same fonts, same fallback) so the splash can wait for them; `Navigator` shows nothing until the session and fonts are ready, as before.
- It also works in the **web build** (it was checked there, for both apps).

---

## 2. The login poster: "Black + Blur sticker collage"

`apps/mobile/src/features/auth/AuthPoster.tsx`, used by `AuthShell` (`components/brand.tsx`) through a new optional `poster` prop.

- **Sign in**: the full poster. **Create account** and **Forgot password**: the compact poster (the logo sticker and the headline), because those forms are longer.
  `reset-password` and `role-pick` have no poster and are unchanged.
- **Always dark** (Dark = "Black + Blur", and also in the Light theme), static glows, rounded bottom corners. Under it, the **same form card** as before, in the
  active theme: Light = Blue + White, Dark = Black + Blur. The form, validation, OTP and Google sign-in code were not touched; the form is exactly the `children`.
- The full poster is about 55% of the screen height, clamped to 330 to 430 px. Headline 28 px extra-bold with one amber word; sub line 13 px; the collage: wrench sticker
  (left, -14 deg), the **logo sticker** (centre, -4 deg), brush sticker (right, +12 deg), each a white rounded square with a shadow; and a **frosted pill** (`Glass`; blur is
  never animated, Android and browsers without backdrop-filter get the solid fallback).
- **Motion**: the wrench pops in (scale 0 to 1, spring) at 0 ms, the brush at 100 ms, the logo last at 200 ms with a short version of the splash slap. **Reduced motion: nothing moves.**
- **Keyboard and small phones**: the poster shrinks to the compact one while the keyboard is open (iOS `keyboardWillShow`, Android `keyboardDidShow`) or when the window
  is shorter than 520 px (Android resizes the window for the keyboard). The page is a `ScrollView` inside a `KeyboardAvoidingView` (iOS padding), with
  `keyboardShouldPersistTaps="handled"`, so the field and the Sign in button stay reachable. Checked at 360 x 640 and with a keyboard-sized window.
- 44 px touch targets are the existing form's; every caption is 12 px or more.

---

## 3. Words, in one place
`packages/shared/src/brand.ts`: `BRAND_COPY` (and `brandCopy(variant)`, `APP_WORDMARK`, the existing `APP_NAME` / `APP_NAME_PRO`). The dev build with both roles shows the customer copy.

| Where | Customer app | Pro app |
|---|---|---|
| Opening screen tagline | Trusted pros. Lower prices. | More jobs near you |
| Opening screen pill | Ghar ka kaam, sahi daam (frosted) | the dark pill with the amber PRO badge (existing Pro logo) |
| Poster headline (amber word) | Your **banda** for every home job. | More jobs. **Fair** fee. Your area. |
| Poster sub line | Verified, rated, and at a fixed price. | Get requests near you. Pay a small fee only on completed jobs. |
| Poster pill | Customer fee ₹0 | First 10 jobs or 1 month fee-free (the numbers are read from `LAUNCH_PERIOD`, never typed) |

A test fails if any of these lines contains a percent sign, "minutes" or "discount" (the model has no percent discounts and no delivery-time promise).
**Two wording decisions to confirm**: the Pro pill says "10 jobs **or 1 month**" because the real rule is whichever ends first (your brief said "First 10 jobs fee-free");
and "Lower prices" is a price claim (it is not a percent discount) that I kept as you wrote it.

---

## 4. Do you need a new development build?
**No.** `app.config.ts` is unchanged. The splash plugin config was verified, not changed: `backgroundColor #05070D`, `splash-icon.png`, `imageWidth 76`, one config for both variants.
No native module was added: `react-native-reanimated`, `react-native-svg`, `expo-blur`, `expo-splash-screen` and `lucide-react-native` were already installed. It is JavaScript only, so
it arrives with the next normal build or update. (Fonts, theme, routes and the store config did not change.)

---

## 5. Files touched

**The words and the timing rules (shared), commit `f770a98` (6 files):**
- `packages/shared/src/brand.test.ts`
- `packages/shared/src/brand.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/splash/gate.test.ts`
- `packages/shared/src/splash/gate.ts`
- `supabase/proposals/functions/notify-push/shared-push.js`

**The animated opening screen, commit `5281f08` (14 files):**
- `apps/mobile/e2e-web/README.md`
- `apps/mobile/e2e-web/serve.cjs`
- `apps/mobile/e2e-web/splash-flow.cjs`
- `apps/mobile/package.json`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/features/splash/AnimatedSplash.tsx`
- `apps/mobile/src/features/splash/Sticker.tsx`
- `apps/mobile/src/features/splash/StickerMotion.tsx`
- `apps/mobile/src/features/splash/splash-host.tsx`
- `apps/mobile/src/lib/env.ts`
- `apps/mobile/src/theme/theme.tsx`
- `packages/shared/src/brand.test.ts`
- `packages/shared/src/brand.ts`
- `packages/shared/src/kyc/kyc.test.ts`

**The login poster, commit `84eefa3` (6 files):**
- `apps/mobile/e2e-web/login-poster-flow.cjs`
- `apps/mobile/src/app/(auth)/forgot-password.tsx`
- `apps/mobile/src/app/(auth)/sign-in.tsx`
- `apps/mobile/src/app/(auth)/sign-up.tsx`
- `apps/mobile/src/components/brand.tsx`
- `apps/mobile/src/features/auth/AuthPoster.tsx`

**This commit:** `docs/CHANGES_SPLASH_LOGIN.md` (new), `docs/PROGRESS.md`, and the 22 screenshots in `docs/screens/splash-login/`.

---

## 6. Tests and results (real output)

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 7 warnings (the old `any` warnings in the admin; none new) |
| `npm run test` (Vitest) | **968 passed, 75 files** (was 956: the copy tests and `splashState` / `shouldShowSplash` tests are new) |
| `npm run build` (admin) | passes |
| `npm run mobile:typecheck` | 0 errors |
| Browser, main suites (`npm run test:e2e-web`, splash off) | auth 30, booking 32, provider 41, status 28, wallet 24, features 39, services 17, booking-payment 14 = **225 of 225**, exit 0 |
| Browser, instant dispatch (`npm run test:e2e-dispatch`) | customer 23 of 23, Pro 15 of 15 |
| Browser, store variants (`variant-flow.cjs`) | customer 4 of 4, provider 4 of 4 |
| Browser, **opening screen** (`splash-flow.cjs`, splash on) | customer **10 of 10**, Pro **10 of 10** |
| Browser, **login poster** (`login-poster-flow.cjs`) | customer **12 of 12**, Pro **12 of 12** |

What the new browser suites check: the splash appears, the tagline is not there yet at 1.5 s, the wordmark, tagline and pill fade in (fully opaque), it leaves by itself into Sign in
(about 2.5 to 4 s after it mounts), no page errors, it is still the dark poster when the phone is in the Light theme, and with reduced motion the final frame is there at once and it
leaves after about 0.6 s. The poster: headline, sub line and fee pill are there, the form is still complete, no percent or minutes in the copy, dark poster in Light with the form following
Light, the Sign in button reachable at 360 x 640 and at least 44 px tall, the poster shrinking while a keyboard-sized window is open with Email and Sign in still reachable, reduced motion,
and the compact poster on Create account.

Failures along the way, all fixed: the first e2e run lost its `playwright` package and then needed a newer Chromium (re-installed, not saved); my first splash checks used fixed times and a selector
that also matched the Sign in logo (now a test id and "fully opaque" polling); a slow whole-package Vitest import went over its 5 s timeout (now 30 s); and the generated push-function file had to be rebuilt
once because `brand.ts` gained an import. The SQL and the database were not touched.

### Screenshots (`docs/screens/splash-login/`, 390 x 844 at 2x unless noted)
- Opening screen, customer and Pro: `splash-<app>-1-slap.png` (about 0.45 s), `splash-<app>-2-wordmark.png` (about 1.5 s), `splash-<app>-5-reduced-motion.png` (the **final frame**),
  `splash-<app>-4-final-in-light-theme.png` (still dark when the phone is in Light).
- Login, Dark and Light: `login-<app>-dark.png`, `login-<app>-light.png`.
- Login at 360 x 640: `login-<app>-360x640.png`, `login-<app>-360x640-scrolled.png`; with the keyboard area (a 360 x 330 window): `login-<app>-360-keyboard.png`.
- Reduced motion: `login-<app>-reduced-motion.png`. Create account (compact poster): `signup-<app>-compact.png`.

### Not done / limits
- **Not tried on a real phone.** Everything was checked in the web build (React Native Web in Chromium). Native-only things are unverified: the iOS blur, the Android solid
  fallback look, Reanimated frame rate on a low-end Android phone, `keyboardDidShow` timing, and the hand-over from the native splash (a flash-free cut to the same dark colour is
  expected, but the small native logo disappears for a moment before the sticker slaps in).
- On the web build the frosted pill shows a faint lighter edge at its corners (the browser's backdrop-filter); the splash pill does not. Cosmetic, left as is.
- Only the sign-in family has the poster. `reset-password` and `role-pick` keep the old frame.
- The animation is not played again when the app comes back from the background (by design), and there is no way to replay it on purpose.
- The browser tests skip the splash (`EXPO_PUBLIC_SKIP_SPLASH=1` in `serve.cjs`); `splash-flow.cjs` is the one suite that runs it.
- Housekeeping: `npm run mobile:install` added a bogus self-dependency (`"handyfix": "file:../.."`) to `apps/mobile/package.json` and its lockfile; I reverted it and did not commit it,
  but it will reappear on the next `mobile:install`. It also removed the throw-away `playwright` package (re-added with `--no-save`). One Vitest test that imports the whole shared package
  got a 30 s timeout because it took 5.1 s of its 5 s under load.
