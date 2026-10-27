# Native risk check (week-1 spike)

Goal: find out in week 1, not week 6, whether the four risky native features work on a **real Android
phone**. The app and screens are ready; you run them on a device. The checks live in the app under
**Native checks** (`src/app/(dev)/spike`).

What was verified without a phone (so you can skip it): the app type-checks, Metro bundles it for Android
(one React copy, shared logic and the alert sound included), and `expo prebuild` generates an Android project
with the right permissions and the notification sound packaged. What needs a phone is below.

## One-time setup

1. **Expo account + EAS CLI**: `npm i -g eas-cli`, then `eas login` and, from `apps/mobile`, `eas init`
   (creates the EAS project; put its id in `EAS_PROJECT_ID` / `EXPO_PUBLIC_EAS_PROJECT_ID`).
2. **Package name**: `com.handyfix.app` in `app.config.ts` is a placeholder. Change it now if you want a different
   one: it must match Firebase, the Google OAuth Android client and the Play listing, and cannot change after publishing.
3. **Firebase (push)**: create a Firebase project, add an Android app with that package name, download
   `google-services.json` into `apps/mobile/` (gitignored; on EAS upload it as a file secret named
   `GOOGLE_SERVICES_JSON`). Then give EAS the FCM v1 service-account key: `eas credentials` → Android → Google Service Account.
4. **Google sign-in**: in Google Cloud (same project as Firebase) create two OAuth clients: **Android** (package name +
   the SHA-1 of the build's signing key: `eas credentials` shows it) and **Web application**. Put the *web* client id
   in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. In Supabase → Authentication → Providers → Google, enable it with the web
   client id and secret.
5. **Env**: copy `.env.example` to `.env.local` and fill in the public values.
6. **Install**: from the repo root, `npm run mobile:install`.

## Build and run

```bash
cd apps/mobile
eas build --profile development --platform android     # installable .apk, ~15 min
# install the APK on the phone, then:
npm run start -- --dev-client
```

Expo Go cannot be used: it has no background location, no custom notification sound and no FCM.

## The four checks

Write PASS or FAIL and a note in the table at the end. Test on a mid-range phone, not only a flagship, and on
at least one phone from a brand with aggressive battery management (Xiaomi, Oppo, Vivo, Realme, Samsung).

### 1. Background location
Open **Native checks → Background location → Start sharing location**. Grant *While using*, then *Allow all the time*.
Lock the phone and walk or drive for at least 3 minutes. Reopen the app → **Refresh points**.
**PASS** = points were stored with timestamps from while the screen was off (roughly one every 10 s), and a
"HandyFix: sharing your location" notification was visible. Also note whether the points stop after 10 to 15 minutes
on battery-aggressive brands.

### 2. New-request alert
- **A** (app open): tap *Simulate request now*. **PASS** = full-screen takeover, looping ring, vibration, 30 s countdown,
  Accept/Decline work, and the wallet-too-low state ("Top up ₹100 to accept") shows when the demo wallet is ₹0.
- **B** (background): tap *Send request notification in 10 s*, then lock the phone. **PASS** = heads-up banner on the lock
  screen with the custom ring tone within a second or two of the 10 s mark. Also try with Do Not Disturb on and with
  the app swiped away.
- A **true** lock-screen takeover is deliberately not tested: Google Play only grants `USE_FULL_SCREEN_INTENT`
  by default to calling and alarm apps. Decide after seeing B whether the heads-up alert is good enough.

### 3. Push (FCM)
**Native checks → Push → Register for push**, grant the permission. **PASS** = an FCM device token appears. Then in the
Firebase console → Messaging → *Send test message*, paste the token (use *Share full token* to send it to yourself). Test
with the app open, in the background, and fully closed. Tap the notification: it should open the app.

### 4. Google sign-in
**Native checks → Google sign-in → Sign in with Google**. **PASS** = the native account sheet appears (no browser tab),
and the log shows "Supabase session created for <your email>".

## Results

| Check | Phone / Android version | PASS / FAIL | Notes |
|---|---|---|---|
| 1. Background location | | | |
| 2A. Alert, app open | | | |
| 2B. Alert, background / locked | | | |
| 3. Push (open / background / closed) | | | |
| 4. Google sign-in | | | |

## If something fails

- **Location stops in the background**: check battery optimisation for the app; if it only fails on some brands, we add an
  in-app "keep running" guide for providers.
- **Notification has no custom sound**: Android locks a channel's settings at first creation. Uninstall the app (or change
  `REQUEST_CHANNEL` in `src/lib/notifications.ts`) and retry.
- **No FCM token**: `google-services.json` is missing from the build or the package name does not match Firebase.
- **Google sign-in `DEVELOPER_ERROR`**: the Android OAuth client's package name or SHA-1 does not match the installed build.
