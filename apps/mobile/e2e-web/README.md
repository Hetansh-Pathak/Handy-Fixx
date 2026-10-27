# Web end-to-end smoke test (mocked backend)

Runs the **real app** (React Native Web in Chromium) against a **fake Supabase HTTP API** built into
the script, so it needs no Supabase project, phone or network. It covers sign-up and sign-in
validation, route guards, role pick (including "an account with bookings cannot become a pro"), the
customer profile, email OTP, sign-out, session persistence, and forgot / reset password.

It is a regression net for navigation and form logic. It does **not** replace testing on a real phone
(native storage, Google sign-in, notifications, location).

```bash
cd apps/mobile
npm i -D playwright && npx playwright install chromium     # once

# terminal 1: the app on the web, pointed at the mock host the script intercepts
EXPO_PUBLIC_SUPABASE_URL=https://mock.supabase.co \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=anon-key \
EXPO_PUBLIC_ENABLE_SPIKE=0 \
npx expo start --web --port 8099 --clear

# terminal 2
npm run test:e2e-web            # screenshots go to e2e-web/shots/
```

Notes:
- Restart the dev server after adding, renaming or moving route files (file-based routes are read at startup).
- Set `E2E_BASE_URL` if the app is not on `http://localhost:8099`.
- The mocked API keeps all state in memory, so every run starts from a clean slate.
