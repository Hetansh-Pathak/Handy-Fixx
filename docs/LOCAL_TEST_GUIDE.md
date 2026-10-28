# How to test HandyFix on your own computer and phone (Windows + VS Code)

Everything here is written for someone who has not done it before. Every command says **which folder** to open first.
Nothing in this guide changes your live database.

## Part 1: One-time check that your computer is ready

1. Open VS Code, then **File > Open Folder** and choose your HandyFix folder (the one that contains `CLAUDE.md` and `package.json`).
2. Open a terminal: **Terminal > New Terminal**. It opens in that folder. Call this **the main folder**.
3. Make sure you are on the right branch:

```powershell
git switch Ritesh
```

4. Install everything (main folder). This can take a few minutes:

```powershell
npm install
```

```powershell
npm run mobile:install
```

5. Check your settings files are in place (main folder). If it says something is missing, run the second command and then the first again:

```powershell
npm run env:check
```

```powershell
npm run env:fix
```

## Part 2: Quick automatic test (no phone, 3 minutes)

This runs all the checks that need no phone. All of them should say OK.

Main folder:

```powershell
npm run typecheck
```

```powershell
npm run lint
```

```powershell
npm run test
```

```powershell
npm run build
```

```powershell
npm run mobile:typecheck
```

`npm run test` should report about 630 passed. Lint prints a few yellow warnings in the admin app: those are old and harmless.

## Part 3: See the app in your browser (fake data, no phone)

This runs the real app against a pretend backend, so you can click through it safely.

1. One time only. In the folder `apps\mobile`:

```powershell
cd apps\mobile
npm i -D playwright
npx playwright install chromium
```

2. Start the app (folder `apps\mobile`), in PowerShell:

```powershell
$env:EXPO_PUBLIC_SUPABASE_URL="https://mock.supabase.co"; $env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="anon-key"; $env:EXPO_PUBLIC_ENABLE_SPIKE="0"; npx expo start --web --port 8099 --clear
```

3. Open a **second** terminal (folder `apps\mobile`) and run the automatic browser tests:

```powershell
npm run test:e2e-web
```

You should see lines starting with PASS. The picture of every screen is saved in `apps\mobile\e2e-web\shots`.

## Part 4: Test on your real phone (the real thing)

You need a **development build** of each app on an Android phone (Expo Go is not enough: Razorpay and Google sign-in need it).
The Pro app **must be rebuilt**: it now uses the camera for the identity photos.

Folder `apps\mobile`:

```powershell
npx eas-cli login
```

```powershell
npm run build:customer
```

```powershell
npm run build:provider
```

When a build finishes, EAS shows a link or QR code. Open it on the phone and install the app. Then start the app's server on your computer:

```powershell
npm run start:customer
```

or

```powershell
npm run start:provider
```

Keep the phone and the computer on the same Wi-Fi, open the installed app, and it connects.

Remember: the six values `EXPO_PUBLIC_*` must be set on expo.dev for the build (see `docs/LOCAL_SETUP.md`). The Pro app needs its own Expo project ID in `apps\mobile\app.config.ts` (see PROGRESS.md).

## Part 5: What to try on the phone

Use **two phones** or one phone plus the browser. Use a test customer and a test pro.

**Pro app (HandyFix Pro)**
1. Create an account, pick "I'm a pro". The Home screen says "Verify your identity to start". Tap **Start verification**.
2. Go through the 9 steps. Check: a wrong Aadhaar number is rejected; under 18 is rejected; the selfie opens the front camera; photos upload; closing the app and reopening continues from the same step; the last step shows your answers with a Change link for each.
3. Submit. The Home card says "Under review". Approve the pro in the admin app (`npm run admin`, then KYC review). Within about 30 seconds the Pro app shows Verified.
4. **Working hours** (Profile > Working hours): add Monday 9 AM to 5 PM, try adding an overlapping one (it must refuse), try "Copy to weekdays".
5. **Wallet**: top up, then add payout details (UPI) in the Payout details card. Withdrawal only opens when you are approved and have saved UPI or bank.
6. Go online. When a customer books you, accept, travel, "I've arrived", start, add extra work, enter the customer's code.
7. **Chat** from the job screen. Try to send a phone number: it must be refused.
8. **Notifications** (the bell on Home) and **My reviews** (Profile).
9. Profile > **Delete account** (it will say it is not switched on yet until the function is approved: that is expected).

**Customer app (HandyFix)**
1. Pick a service and a pro. Check **Nearest** appears only after pros share their area (needs database proposal 20261109).
2. Book. With a pro who set working hours, the time picker only offers times inside them.
3. After the pro accepts: tap **Message** and chat. Phone numbers must be refused; "1500, 2000 or 3000" must pass.
4. After the job: **rate** the pro (needs database proposal 20261108, otherwise you see "We could not save your rating"), and try **Book again**.
5. Cancel a booking that a pro accepted and that starts in under 2 hours: the screen warns it is a late cancellation.
6. Profile > **About HandyFix**, **Help & support**, **Delete account**.

## Part 6: The database changes that are waiting for your OK

Nothing has been applied. Each one is a **proposal** in `supabase\proposals\` with two helper files in `supabase\dryrun\`:
a **dry run** (it ends with ROLLBACK, so it saves nothing) and an **apply** file. They were tested only on a throwaway copy on my side, never on your live project.

To check one safely: open the Supabase dashboard, **SQL Editor**, paste the whole dry-run file and press Run. To apply it for real, paste the matching `apply_..._COMMIT.sql` file instead. Do them in this order and tell Claude which ones you approved:

| Order | Dry run file | What it fixes |
|---|---|---|
| 1 | `5_reviews_DRYRUN.sql` | Customers cannot rate today. Also stops fake reviews and double job counting. **Most urgent.** |
| 2 | `7_chat_hardening_DRYRUN.sql` | Closes a hole where anyone can post into anyone's chat; blocks phone numbers on the server. |
| 3 | `6_provider_location_DRYRUN.sql` | Lets customers sort by Nearest (pros share an area rounded to about 1 km). |
| 4 | `9_late_cancel_DRYRUN.sql` | Makes the late-cancel rule impossible to dodge. |
| 5 | `8_delete_account_DRYRUN.sql` | Account deletion (also needs the `delete-account` function in `supabase\proposals\functions\delete-account`, which I will deploy only when you say so). |

## If something looks wrong

- Services or pros missing: run `npm run env:check` in the main folder.
- A screen is blank: close the app and start the server again with `--clear`: `npm run mobile:start -- --clear`.
- A message you do not understand: take a screenshot and send it to Claude with the screen name.
