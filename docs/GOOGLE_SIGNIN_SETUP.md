# Google sign-in: exact setup steps

The app code is done (`apps/mobile/src/lib/google-auth.ts`). It needs three things from you: two OAuth clients in
Google Cloud, Google turned on in Supabase, and the Web client id in the app. Package name: `in.handyfix.app`.

Google sign-in only works in a **development build or release build on a phone/emulator**, not in Expo Go and not on web.

## 1. Google Cloud: consent screen
1. https://console.cloud.google.com → create (or pick) a project named `HandyFix`.
2. **APIs & Services → OAuth consent screen** (or "Google Auth Platform → Branding").
3. User type **External**. App name `HandyFix`, support email, developer contact email. Save.
4. Scopes: only the defaults (`email`, `profile`, `openid`). Nothing sensitive, so no Google verification is needed.
5. Publishing status: while it says **Testing**, only listed test users can sign in. Add your own Gmail(s) as test users now,
   and press **Publish app** before the closed test.

## 2. Google Cloud: the WEB client (this one goes in the app and in Supabase)
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type **Web application**, name `HandyFix web (Supabase)`.
3. Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (needed by Supabase even for the native flow).
4. Create. Copy the **Client ID** and the **Client secret**.

## 3. Google Cloud: the ANDROID client (proves the app is yours)
Create **one per signing key**. You need the SHA-1 of each:
1. **Credentials → Create credentials → OAuth client ID → Android**.
2. Package name: `in.handyfix.app`.
3. SHA-1:
   - Development/preview builds: run `eas credentials` (Android → the profile → Keystore) and copy the SHA-1 fingerprint.
   - Play Store builds: **Play Console → Setup → App signing → App signing key certificate → SHA-1**. This is a different SHA-1
     from the one EAS uses; make a second Android client for it, or Google sign-in fails only in the store build.
4. No client id from this step goes in the app. It only needs to exist.

## 4. Supabase
1. **Authentication → Providers → Google**: enable.
2. Paste the **Web** client id and secret from step 2.
3. Turn on **Skip nonce check** (the native library does not send a nonce).
4. Save.

## 5. The app
1. `apps/mobile/.env` (never committed): `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com`
2. For EAS builds, add the same value as an EAS environment variable (`eas env:create`, visibility "plain text", not a secret).
3. Rebuild the development build (`eas build --profile development --platform android`): the native module is part of the build.

## 6. Check it
Install the build, open Sign in, tap Continue with Google. Expected: Google account picker, then you land on role-pick
(new account) or your home screen (existing). Then run `apps/mobile/SPIKE.md` "Google sign-in".

| Symptom | Cause |
|---|---|
| `DEVELOPER_ERROR` / code 10 | Android client missing, or its package/SHA-1 does not match the build you installed |
| "Access blocked: app has not completed verification" | Consent screen in Testing and your account is not a test user |
| "Google did not return an identity token" | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is the Android client id, or empty |
| Supabase "Unacceptable audience" / nonce error | Web client id not saved in Supabase, or "Skip nonce check" is off |
| Button says "not configured yet" | The env var was not present at build time: rebuild |

## Notes
- No `google-services.json` is needed for sign-in. That file is only for Firebase push (slice 4b).
- Google accounts count as email-verified (the booking rule `is_customer_email_verified()` accepts them).
- A Google user still picks a role once on `/role-pick`.
