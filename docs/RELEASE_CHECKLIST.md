# Release checklist (Play Store closed test, then production)

Written 2026-10-29 for branch `Ritesh`. Source of truth for what is done is `docs/PROGRESS.md`; this file is the go / no-go list. Phone steps are in `docs/PHONE_TEST_CHECKLIST.md`.

## A. Verified by Claude (computer side)

Run again any time with one command from the main folder:

```powershell
npm run check
```

That runs typecheck (shared, admin, mobile), lint, 736 unit tests and the builds. Last result: **0 errors, 736 tests passed**, lint 7 old warnings, builds OK.

| Check | Result (2026-10-29) | How |
|---|---|---|
| Unit tests (fee, launch, wallet, ranking, locks, watchlist, evidence ...) | 736 pass | `npm run test` |
| Browser suites on the real screens with a fake backend | 7 suites, 197 checks pass | `apps\mobile`: `npm run test:e2e-web` (needs the web app running, see `e2e-web\README.md`) |
| Android bundle, **customer** app | builds (8.4 MB Hermes bundle) | `expo export --platform android` with `EXPO_PUBLIC_APP_VARIANT=customer` |
| Android bundle, **Pro** app | builds (8.4 MB) | same with `provider` |
| Web export | builds | `expo export --platform web` |
| Native project generation (both apps) | OK; app ids `in.handyfix.app` / `in.handyfix.pro` | `expo prebuild` in a throwaway copy |
| Android permissions, **customer** | location (when in use), microphone (voice note), internet, vibrate. Background location, foreground service, external storage and full-screen intent are **removed** | read the generated manifest |
| Android permissions, **Pro** | location incl. background, foreground service, notifications, boot, internet, vibrate. **No microphone, no storage** | same |
| Dependency health | `expo-doctor` 18 of 20 checks pass; the other 2 only need internet to Expo and could not run in my sandbox | `npx expo-doctor` in `apps\mobile` (please run it once on your computer) |
| Accessibility (WCAG A and AA, light and dark, both apps) | Pro: 0 findings. Customer: 0 real findings (2 known false alarms, see PROGRESS.md) | axe-core on the real screens |
| Small phones (320 px wide) | no screen overflows. Every tap target is at least 28 px wide and 36 px tall (the WCAG minimum is 24); the offer-carousel dots are 28 x 44 px by design | scripted check |
| Two store apps are really separate | different names, packages, URL schemes, permissions | `expo config` per variant |

Not verified (cannot be, without a phone): real sounds, GPS, camera, Razorpay, Google sign-in, TalkBack, speed on a low-end phone. These are exactly the boxes in `docs/PHONE_TEST_CHECKLIST.md`.

## B. Database: what must be applied before real users

1. Run `supabase\verify\10_proposals_status_READONLY.sql` (read only). It lists every proposal with `applied` true or false.
2. Anything that matters for launch and is still `false` must be applied with its dry run first (`supabase\dryrun\N_..._DRYRUN.sql`, then `apply_N_..._COMMIT.sql`). Must-haves:

| Proposal | Why it matters for launch |
|---|---|
| `20261113000000` arrived-step guard | Without it the Pro button "I've arrived" does nothing. Set `EXPO_PUBLIC_ARRIVED_STATUS=1` in the Pro build once applied. |
| `20261108` reviews fix | Without it customers cannot rate. |
| `20261110` chat hardening | Closes a hole: anyone could post into any chat. |
| `20261114` fee 3%, fee held at accept, 24 h auto-close | Without it the live database still charges the old slabs while the apps show 3%. Apply the same day as the new Pro build. |
| `20261115` launch = 10 jobs or 1 month | Otherwise the database keeps the 3-month rule while the apps say 1 month. |
| `20261111` delete account (+ its function) | Play requires in-app account deletion to work. |
| `20261112` late-cancel limit | Makes the rule impossible to dodge. |
| `20261103` Call button, `20261109` Nearest, `20261113000002` pro jobs and rates | Features; apps work without them (the feature is simply hidden). |

3. Set price bands on the admin **Price bands** page (10 of 11 services have none).
4. Decide about the live cron job `expire-stale-bookings` (cancels a request pending for 30 minutes; it conflicts with your "stays open until answered" rule).

## C. Accounts and values only you can supply

| Item | Needed for | Notes |
|---|---|---|
| Expo (EAS) **Pro project id** | Pro builds | Run `eas init` once with `EXPO_PUBLIC_APP_VARIANT=provider`, put the id in `apps\mobile\app.config.ts` (customer id is already set). |
| Google Play Console account | any store release | One-time fee; verification can take days, so start early. |
| Hosted **privacy policy** and **terms** pages | Play and App Store require a link | Set `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL`; the rows in Help appear only when set. |
| Support email / phone | Help screens | `EXPO_PUBLIC_SUPPORT_EMAIL` (default support@handyfix.in), optional `EXPO_PUBLIC_SUPPORT_PHONE`. |
| Google sign-in | "Continue with Google" | Android OAuth client per package with the **release** SHA-1; `docs\GOOGLE_SIGNIN_SETUP.md`. |
| Razorpay **live** keys and webhook | wallet recharge | `docs\PAYMENTS_SETUP.md`. Keys live only in Edge Function secrets. Deploy the pack-only `create-wallet-topup-order` function from `supabase\proposals\functions`. |
| Google Maps key (optional) | embedded live map | `GOOGLE_MAPS_API_KEY` as an EAS secret plus `EXPO_PUBLIC_MAPS_ENABLED=1`; without it the screen shows ETA and "Open in Google Maps". |
| Firebase project (later) | push to a closed app | Without it a closed Pro app gets no request. Tell testers to keep the app open or recently used. |
| New app icon and splash (apnabanda) | store listing | The icon files in the app are still the old ones (see PROGRESS.md follow-ups). |

## D. Values to set in the build (expo.dev > project > Environment variables, for the production profile of **each** app)

`eas.json` only sets `EXPO_PUBLIC_APP_VARIANT`. Everything else must be added on expo.dev or the production build will not work:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your project's public values |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | from Google Cloud |
| `EXPO_PUBLIC_PDF_PRICING_LIVE` | `1` (without it real customers **cannot confirm a booking**) |
| `EXPO_PUBLIC_ARRIVED_STATUS` | `1` in the Pro app, only after `20261113000000` is applied |
| `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL` | your pages and address |
| `EXPO_PUBLIC_PRO_APP_URL`, `EXPO_PUBLIC_CUSTOMER_APP_URL` | the store links, once they exist |
| `EXPO_PUBLIC_MAPS_ENABLED` | `1` only when the Maps key is in the build |
| `EXPO_PUBLIC_ENABLE_SPIKE` | leave unset (hides the developer screens) |

Never put a secret in an `EXPO_PUBLIC_*` value: they are visible inside the app.

## E. Steps, in order

1. Section B (database) and the must-have items of section C.
2. `docs\PHONE_TEST_CHECKLIST.md` on a real phone with preview builds. Fix what fails.
3. Preview builds for testers (installable APK, no computer needed). In `apps\mobile`:

```powershell
npm run build:customer:preview
```

```powershell
npm run build:provider:preview
```

4. Production bundles for the store (Google Play wants an app bundle):

```powershell
npm run build:customer:release
```

```powershell
npm run build:provider:release
```

5. Upload to a Play Console **closed test** for each app. Google's rules for new personal developer accounts require a minimum number of testers for a minimum number of days before production access (at the time of writing, 12 testers for 14 days; check Play Console, the numbers change). Start this clock as early as possible.
6. Fill in each store listing: short and long description, screenshots (phone size; `apps\mobile\e2e-web\preview.cjs` can generate them), content rating, target audience, and the **Data safety** form. Things the forms will ask about: name, email, phone, precise location (Pro: also in the background, for live tracking), photos, voice notes, identity documents and selfie (Pro identity check), payments through Razorpay, and that users can delete their account in the app.
7. After the closed test: production release, staged rollout (start with a small percentage).
8. Delete the `legacy\` folder at mobile parity (project rule).

## F. Known limits at launch (be honest in the closed test)

- No push to a closed app (needs Firebase): pros must have the app open or recently used.
- Hiding the customer's street address before a pro accepts is on the screen only (server-side needs a database change).
- No in-app customer payment: customers pay the pro directly by UPI or cash (decision pending on Razorpay Payouts and the refund rule).
- No masked calling: numbers are shared only after acceptance.
- Hindi and regional text is not done (needs a native speaker to check).
- Complex-job quote with a visit-fee share, "lady worker only" and daily labour are not built yet.

## G. Go / no-go

Go for the closed test when: section B must-haves are applied, the phone checklist has no failure in sections 1 to 3, `npm run check` passes, and `EXPO_PUBLIC_PDF_PRICING_LIVE=1` is set in both production builds.
