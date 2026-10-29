# Web end-to-end smoke test (mocked backend)

Runs the **real app** (React Native Web in Chromium) against a **fake Supabase HTTP API** built into
the script, so it needs no Supabase project, phone or network. Two suites:
- `auth-flow.cjs`: sign-up and sign-in validation (and that every radio button exposes its checked state), route guards, role pick (including "an account with bookings cannot become a pro"), the customer profile, email OTP, sign-out, session persistence, forgot / reset password.
- `booking-flow.cjs`: services and search (response-time line shown only with enough replies), sub-items, availability and area rules, per-pro prices and sorting, the 3-step booking with validation, the email-verification gate, the saved-price check (PDF and legacy 12% modes) and cancel.

- `provider-flow.cjs`: approval gate, going online (heartbeat), the "Problem closing the job?" prompt after 2 hours and the arrival record, locked requests (wallet too low: Locked popup, 3 locked cards plus a counter in Jobs > New, address hidden until accepted), a request arriving by Realtime and by the polling fallback as a popup with no timer, accept and decline on the request screen, the job steps, the completion code with wrong-code feedback, the flat fee (waived in launch, charged after), the client-side and server-side wallet block, and the jobs list by stage.
- `status-flow.cjs`: the customer's bookings list and status screen through a booking's life (including the "Problem closing the job?" card after 2 hours): waiting with no countdown (and "choose another pro instead"), acceptance over Realtime, ETA/distance/live and stale position, the completion code card, done, the "next best pros" offer when the customer asks, after a decline or once the booked time has passed (one-tap rebook of the same job), cancel, the hidden Call button when the contact function is missing, and the saved-price warning.

- `wallet-flow.cjs`: the pro's wallet: balance and dues, history, earnings, top-up validation and order creation (native Razorpay checkout cannot run on web), quick-pick amounts, withdrawal rules and the dues lock.

- `features-flow.cjs`: the legacy port: the pro's 9-step identity check (validation, saving, resume), working hours, reviews (names shown safely), notifications, and the customer's chat (phone numbers refused, price lists allowed, read-only after the job), rating and the late-cancel warning and marking.
- `services-flow.cjs`: the pro's My services screen (services, ticking jobs, own price inside the band, saving, the screen before the database change) and the customer list honouring it (unticked pro hidden, own rate shown).
- `variant-flow.cjs customer|provider`: the two store apps. Start the dev server with `EXPO_PUBLIC_APP_VARIANT=customer` (or `provider`) first. Checks that the customer app skips the role question, the Pro app only asks for pro details, and a pro opening the customer app is sent to the Pro app.
- `preview.cjs customer|provider`: not a test; writes phone-size screenshots of the main screens to `e2e-web/shots/preview/<variant>/`.

`mock-supabase.cjs` is the shared fake backend (catalogue, pros, bookings, auth, wallet, completion code, and a Realtime WebSocket speaking protocol 2.0.0).

It is a regression net for navigation and form logic. It does **not** replace testing on a real phone
(native storage, Google sign-in, notifications, location).

```bash
cd apps/mobile
npm i --no-save playwright && npx playwright install chromium     # once

# terminal 1: the app on the web with the fake backend (sets the mock values itself and sets .env.local aside until Ctrl+C)
npm run web:e2e

# terminal 2
npm run test:e2e-web            # runs all suites; screenshots go to e2e-web/shots/
```

Notes:
- Restart the dev server after adding, renaming or moving route files (file-based routes are read at startup).
- Set `E2E_BASE_URL` if the app is not on `http://localhost:8099`.
- The mocked API keeps all state in memory, so every run starts from a clean slate.
