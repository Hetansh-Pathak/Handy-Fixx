# Push notifications to a closed app: setup guide

**What you get:** a pro whose app is shut still gets a loud "New job request" alert on the phone. A customer gets "Your pro accepted", "on the way", "started the job", "completed" and chat messages. Tapping an alert opens that booking.

**How it works (one paragraph):** HandyFix already writes a row into a notifications table for every booking event. A database trigger (using the `pg_net` extension) calls the small `notify-push` function each time a row appears; the function looks up the person's phone and sends the alert through **Expo's free push service**, which hands it to Google's Firebase Cloud Messaging (FCM). It sends each event **once** (the live database writes several rows per event; the function removes the repeats).

Everything in the code is built and tested (793 tests, including the real function run against fakes). What is left is the accounts and keys that only you can create, then the steps in Part B. **Nothing is sent until all of it is in place, and until then the apps work exactly as before.**

---

## Part A: what you do (about 20 minutes, one time)

### A1. Firebase project (free)
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Add project**, name it `HandyFix`. You can switch Google Analytics off.
3. In the project, click the Android icon (**Add app**) and add the **customer** app. Android package name: `in.handyfix.app`. Skip the other steps.
4. Add a **second** Android app, the **Pro** app. Android package name: `in.handyfix.pro`.
5. Project settings (gear icon) > General > scroll to **Your apps** > download **google-services.json**. One file covers both apps.

### A2. Put `google-services.json` where the builds can use it
- For your own computer: copy the file to `apps\mobile\google-services.json`. It is already ignored by git, so it is never uploaded.
- For the real builds on Expo: open https://expo.dev, choose the project, then **Environment variables** (or **Secrets**) > **Create**. Name `GOOGLE_SERVICES_JSON`, type **File**, upload the file. (From a terminal the same is done with `npx eas-cli env:create`; follow the prompts. Expo has renamed these menus before, so if a name differs, look for "file environment variable" in Expo's documentation.)

  Do this once for the customer project and once for the Pro project (see A4 for the Pro project).

### A3. Let Expo send through Firebase (the "FCM key")
1. Firebase > Project settings > **Service accounts** > **Generate new private key**. A `.json` file downloads. **Treat it like a password. Never share it or put it in the repository** (the repository ignores it, but keep it safe).
2. In a terminal in `apps\mobile`:

```powershell
npx eas-cli credentials
```

3. Choose **Android**, then the build profile (`customer-production`), then **Google Service Account**, then the option about **Push Notifications (FCM V1)**, then set it up and give it the downloaded file. (The menu wording changes a little between versions; Expo's guide is called "Add Android FCM V1 credentials" if you get lost.)
4. Repeat for the Pro project (`provider-production`, see A4).

### A4. The Pro app's Expo project (also needed for the Pro app builds)
The Pro app is its own app, so it needs its own Expo project number, created once:

```powershell
$env:EXPO_PUBLIC_APP_VARIANT="provider"; npx eas-cli init
```

It asks you to log in to your Expo account and create the project, then prints a project id (a long code like `2caf96cd-ed45-433c-bba1-721466583e22`). **Send me that code** (it is not a secret) and I put it in the config. Without it the Pro app cannot get a push address.

---

## Part B: the server side (Claude did the code; you do the secret and the SQL)

| # | Step | Who | Notes |
|---|---|---|---|
| 1 | Deploy the function `notify-push` | **Done** (2026-10-29, version 1, live project) | Code: `supabase\proposals\functions\notify-push`. It refuses every call without the secret, so it does nothing until step 3 and step 5. |
| 2 | Apply the database proposal `20261120` (push tokens and the repeat filter) | you paste `supabase\dryrun\19_push_notifications_DRYRUN.sql` (prints `true, true, true`), then `apply_19_push_notifications_COMMIT.sql` in Supabase > SQL Editor | Tested on a throwaway database, 15 cases. |
| 3 | Set the function's secret `PUSH_WEBHOOK_SECRET` | **you, in the dashboard**: Supabase > Edge Functions > Secrets > add | Make up a long random value (30+ letters and digits). **Type it yourself; do not send it to me.** Keep a copy for step 4. |
| 4 | Store the same value in the database vault | you, SQL Editor, run once: `SELECT vault.create_secret('PASTE THE SAME VALUE', 'push_webhook_secret');` | The database reads it from the vault when it calls the function. It is never in a file. |
| 5 | Apply the database proposal `20261121` (the push webhooks) | you paste `supabase\dryrun\20_push_webhooks_DRYRUN.sql` (check it prints `true`), then `apply_20_push_webhooks_COMMIT.sql` | Turns on the `pg_net` extension and adds one trigger on each notification table. It cannot block a booking: any failure is swallowed. If the vault secret is missing it does nothing. |

There is **no need to click Database Webhooks in the dashboard**: step 5 does the same job in SQL (the dashboard feature was never enabled on this project).

**To switch push off again:** `DROP TRIGGER push_webhook ON public.provider_notifications; DROP TRIGGER push_webhook ON public.customer_notifications;` (ask me and I give you the exact text).

## Part C: test it on a real phone

1. Build and install both apps again (they need the Firebase file): `npm run build:customer` and `npm run build:provider` (or the preview builds), in `apps\mobile`.
2. Sign in on both phones (customer, and a test pro). Allow notifications when asked (the pro is asked straight away; the customer is asked right after their first booking).
3. Optional check that the phone can get a push address: open the app's developer screen **Developer: native checks > Push** and tap register; it shows the Expo token.
4. **Close the Pro app completely** (swipe it away). From the customer app, book that pro.
5. Within a few seconds the pro's phone rings with **"New job request"**. Tap it: the Pro app opens on that request.
6. Accept it on the pro phone; the customer's phone gets **"Your pro accepted"** (even with the customer app closed). Tap: the booking opens.

## What to know (honest limits)

- **Android only for now.** iPhones also need an Apple developer account and key; that comes with the iOS release.
- **A request is announced loudly even if the pro cannot accept it** (wallet too low). The in-app popup and Jobs list still show the lock and the "Recharge ₹X to accept" button; the server cannot see the wallet.
- **A rare double alert** is possible when the app is shut down only a moment ago and also announces locally. When the app is open, the server alert is hidden on purpose (the popup is enough).
- A phone that is switched off gets the alert when it comes back, for up to one hour (after that a stale request alert is dropped).
- The alerts use fixed wording written in the apps' code (`packages/shared/src/push`). To change the words, change that file and run `npm run push:build`; a test fails if the function's copy is out of date.
- Nothing personal is in the alert text except, for chat, the first part of the message.

## If something does not work

| What you see | Likely reason |
|---|---|
| Nothing arrives, ever | The trigger (proposal 20261121), the vault secret or the function secret is missing (Supabase > Edge Functions > notify-push > Logs shows calls and `401` means the secret differs). Or the phone never registered: Pro app needs the Pro Expo project id (A4). |
| "forbidden" / `401` in the function logs | The vault value (`push_webhook_secret`) is not exactly the same as the function secret `PUSH_WEBHOOK_SECRET`. |
| `skipped: no phone registered` | The phone did not register: notifications not allowed, no `google-services.json` in that build, or the database proposal 20261120 not applied (check the SQL files 19 and 20 are both applied). |
| Alert arrives only when the app is open | The FCM key was not uploaded to Expo for that project (A3). |
| Two alerts for one request | Tell me the time and I check the function log. One event should always produce one alert. |
