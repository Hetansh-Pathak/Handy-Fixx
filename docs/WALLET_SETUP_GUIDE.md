# HandyFix Wallet + Razorpay: Complete Setup Guide

Follow the steps **in order**. Do not skip ahead. Every step says what you should see.
Use a **staging Supabase project first** if you have one. If not, do it in production at a quiet time (check "open jobs" in Step 3).

## What you get

| Flow | What happens |
|---|---|
| OTP | Customer gives the 4-digit code, provider enters it, job = completed |
| Payment screen | Provider sees **Customer pays ₹560** (₹500 service + ₹60 fee) with **QR** or **Cash** |
| QR | Customer scans, pays online. Wallet **+₹500**. Platform keeps ₹60 |
| Cash | Provider taps "I collected ₹560 cash". Wallet **-₹60** (dues). Customer sees "Paid ₹560 by cash" + **Report a problem** |
| Dues limit | Dues reach ₹300 → provider forced **offline** and cannot accept jobs (enforced in the database) |
| Next QR job | Old dues are subtracted automatically (-60 then +500 = +440) |
| Pay dues | Provider can pay dues by UPI from the Wallet page |
| Withdraw | Provider requests withdrawal of positive balance. Admin pays manually and marks it paid |
| Admin | New page **Dues & Payments**: provider wallets, disputes, withdrawals, payment issues |

Defaults I chose (all changeable with one SQL line, see "Settings"): dues limit ₹300, fee 12%, minimum withdrawal ₹100, dispute window 7 days, a completed job with no recorded payment blocks new jobs after 24 hours.

## Bugs found in your code and fixed by this update

1. **Completing a job would fail** with "Cannot change total_earnings directly": the earnings trigger collided with the KYC "privileged column" guard. Reviews had the same problem (rating). Fixed.
2. **OTP completion could be bypassed**: the old guard's role check was always true. A provider could set `status='completed'` directly. Fixed: only the OTP function (or an admin) can complete.
3. **Fee math**: earnings used a 80/20 split of the total (₹448 instead of ₹500). Now uses the real service charge and fee.
4. **Price came from the browser** (`sub_price` in the URL could be edited). The database now sets the price and the 12% fee itself.
5. **Open policies**: providers could UPDATE their own earnings and payouts, and anyone could INSERT earnings. All client writes to money tables are removed.
6. Providers and customers can no longer edit `total_amount`, `platform_fee`, `provider_amount` or `payment_status` on a booking.

---

## STEP 1: Back up and unzip (about 5 minutes)

1. Copy your project folder somewhere safe, **or** in the project folder run: `git checkout -b feature/wallet` (commit your current work first).
2. Unzip `Handy-Fixx-my-fix-branch-WALLET.zip` and **replace** your project folder with it (or copy over the files listed in `docs/CHANGED_FILES.txt`).
3. Your `.env` files are not touched.

## STEP 2: Check the apps build (about 10 minutes)

Open a terminal in each folder (`legacy/provider-app`, `legacy/customer-app`, `apps/admin`) and run:

```
npm install
npm run build
```

You want the build to finish with **no red errors**. If you see an error, send me the text.

## STEP 3: Supabase pre-flight check (READ-ONLY, 2 minutes)

1. Supabase → **SQL Editor** → **New query**.
2. Open `supabase/verify/01_preflight_check_READONLY.sql`, copy everything, paste, **Run**.
3. Look at the `result` column. `OK`, `OK (fresh)`, `INFO` are good. `WARN` = read the detail. **`MISSING` = stop and send me the row.**
4. Note the "Open jobs right now" row. Run the real migration when it is low.

This step changes nothing.

## STEP 4: Dry run of the migration (saves NOTHING, 2 minutes)

1. New query. Open `supabase/migrations/provider/20261015000000_wallet_ledger.sql`, copy everything, paste.
2. Scroll to the **very last line**. Change `COMMIT;` to `ROLLBACK;`.
3. **Run**. You should see "Success. No rows returned". Nothing was saved.
4. If you see an error, copy the exact text and send it to me. Do not continue.

## STEP 5: Real migration (2 minutes)

1. New query, paste the migration file again, this time **leave `COMMIT;`** at the end. **Run**.
2. Expected: "Success. No rows returned".
3. It is one transaction: if anything fails, nothing is applied. It is also safe to run twice.

## STEP 6: Verify (READ-ONLY, 2 minutes)

1. New query → paste `supabase/verify/02_after_migration_check_READONLY.sql` → Run.
2. **Every row must say OK.**

## STEP 7: Self-test (saves NOTHING, 2 minutes)

1. New query → paste `supabase/verify/03_selftest_NOTHING_SAVED.sql` → Run.
2. A **red error box appears on purpose**. It contains lines starting with `PASS` or `FAIL`. All should be `PASS`.
3. This proves in your real database: cash dues post once (replays ignored), the limit forces offline, going online is refused over the limit, a top-up clears it, the ledger cannot be edited, and clients cannot write money tables.

## STEP 8: Razorpay account (10 minutes)

1. Log in to the Razorpay Dashboard. Start in **Test Mode** (toggle at the top).
2. **Settings → API Keys → Generate Test Key.** Copy **Key Id** and **Key Secret**.
3. Make up a long random **webhook secret** (for example 40 random letters and numbers). Save it. You will use it twice.
4. **Settings → Webhooks → Add New Webhook** (in Test Mode):
   - URL: `https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/razorpay-webhook`
     (your project ref is the part of your Supabase URL before `.supabase.co`)
   - Secret: your webhook secret
   - Tick events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `qr_code.credited`
   - Save.
5. **QR Codes:** In the Dashboard look for **QR Codes**. If you do not see it, ask Razorpay support to enable UPI QR Codes for your account. (Needed for the QR flow.)

> Razorpay's docs state that UPI QR payments can only be tested in **Live Mode**. Test Mode works for the dues top-up (UPI id `success@razorpay`). See Step 12.

## STEP 9: Supabase secrets (3 minutes)

Supabase → **Edge Functions → Secrets** (or CLI `supabase secrets set NAME=value`). Add:

| Name | Value |
|---|---|
| `RAZORPAY_KEY_ID` | your Key Id (starts with `rzp_test_`) |
| `RAZORPAY_KEY_SECRET` | your Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook secret you made up |

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` already exist automatically.)

## STEP 10: Deploy the 4 functions (5 minutes)

Install the Supabase CLI if you do not have it. Open a terminal in the `database` folder:

```
supabase login
supabase link --project-ref <YOUR-PROJECT-REF>
supabase functions deploy create-qr-payment
supabase functions deploy close-booking-qr
supabase functions deploy create-wallet-topup-order
supabase functions deploy razorpay-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is required. Razorpay does not send a Supabase login. The webhook is protected by the signature check instead.

**Check:** Supabase → Edge Functions should list all four.

## STEP 11: Deploy the 3 apps

Deploy `legacy/provider-app`, `legacy/customer-app`, `apps/admin` (update the Root Directory in each Vercel project) the way you do now (Vercel). No new environment variables are needed.

## STEP 12: Test before real users

Use one **approved test provider** and one **test customer** (verified email).

**Test mode (test keys):**
1. **Cash job.** Customer books, provider accepts, starts, customer gives the code, provider enters it. The Payment screen opens. Tap **Customer paid cash → I collected**. Expect: Wallet shows dues = the fee (₹60 on ₹500), customer sees "Paid ₹560 by cash" with **Report a problem**.
2. **Customer dispute.** Tap **Report a problem**, write a reason. In the admin app → **Dues & Payments → Disputes**, resolve it.
3. **Dues limit.** In Supabase SQL: `UPDATE public.wallet_settings SET dues_limit = 60, updated_at = now();`. Do one more cash job. Expect: provider forced offline, cannot go online, cannot accept a new job (error message). Then reset: `UPDATE public.wallet_settings SET dues_limit = 300, updated_at = now();`
4. **Pay dues.** Wallet → **Pay dues by UPI** → in the Razorpay window choose UPI and enter `success@razorpay`. Expect: dues drop, toast "Payment received". The provider stays offline until they switch online themselves.
5. **Admin.** Open **Dues & Payments** and check the provider wallet shows there.
6. **Withdraw.** Give a provider a positive balance (admin → Adjust +200), request a withdrawal, then in admin mark it paid.

**QR test (needs LIVE keys, real money, small):**
1. Switch Supabase secrets to your **live** Key Id / Key Secret, and add the same webhook (Step 8.4) in **Live Mode** with a live webhook secret (update `RAZORPAY_WEBHOOK_SECRET`). Test and Live keys and webhooks are separate.
2. To keep the test amount tiny, temporarily set one test service to a low price and restore it after:
   `UPDATE public.services SET base_price = 10 WHERE name = 'YOUR TEST SERVICE';`  (customer pays ₹10 + ₹1 fee = ₹11)
   Restore afterwards with the original price.
3. Book it, finish with the OTP, tap **Collect via QR**, pay ₹11 from your own UPI app.
   Expect: the screen says "Payment received", wallet credited ₹10, customer sees "Paid online".
4. **Double payment test:** generate a QR, tap **Customer paid cash** instead, then scan the old QR. Expect: payment is refunded automatically (see admin → Payment issues, "duplicate refunded").
5. In Razorpay, refund the ₹11 payment. Expect: wallet debit "Customer refund reversed".

## STEP 13: Go live checklist

- [ ] Live Key Id / Secret in Supabase secrets
- [ ] Live webhook added in Razorpay **Live Mode** with the same secret as `RAZORPAY_WEBHOOK_SECRET`
- [ ] QR Codes enabled on the live account
- [ ] Test price restored (`SELECT name, base_price FROM public.services;`)
- [ ] `dues_limit` back to 300
- [ ] At least one admin user exists in `user_roles`

## Settings (change with SQL, no code deploy)

```sql
UPDATE public.wallet_settings SET
  dues_limit = 300,            -- provider goes offline at this much dues
  fee_rate = 0.12,             -- platform fee (applies to NEW bookings only)
  min_payout = 100,            -- minimum withdrawal
  unsettled_grace_hours = 24,  -- hours a completed job may stay without payment recorded
  updated_at = now();
```

## Things to know

- **Gateway cost.** Razorpay charges you a fee (and GST on it) on QR/online payments. It comes out of your ₹60, so check what you keep per online job. Cash jobs cost you nothing.
- **Cash disputes** do not move money automatically. Admin resolves in the Disputes tab and can add a wallet adjustment (for example -60 penalty). That is deliberate: a human should decide.
- **After dues are cleared** the provider goes online manually. It never switches itself on.
- **Withdrawals are manual**: the admin transfers the money from the bank and then taps "Mark paid". If the transfer fails, tap Failed and the money returns to the wallet.
- **Old completed jobs** (before this update) are never asked for payment. Only jobs completed after the migration are.
- **Records are kept for accounting**: ledger rows cannot be deleted, so a provider with wallet history cannot be hard-deleted from the database.

## Before the Play Store launch (not part of this zip)

1. **Push notifications** (Firebase FCM). Providers only see new jobs while the app is open.
2. **Wrapper choice.** The Razorpay window works in a Chrome-based wrapper (TWA). In a Capacitor WebView, opening UPI apps for the dues top-up can be unreliable and may need Razorpay's native plugin. The QR flow is unaffected.
3. **Account deletion** inside the app (Play requires it for apps with sign-up), handling dues and KYC records.
4. Remove the placeholder `'__admin__'` provider id in `CompleteJobDialog` "Report Issue" (it fails silently today).

## Troubleshooting

| Problem | Where to look |
|---|---|
| "Could not create the QR" | Edge Functions → `create-qr-payment` → Logs. Usually QR Codes not enabled or wrong keys |
| Paid but wallet not credited | Edge Functions → `razorpay-webhook` → Logs. 401 = webhook secret mismatch. Admin → Payment issues |
| "Complete the job with the customer code first" | The booking is not `completed` yet |
| Provider cannot go online | Wallet page shows the reason (dues limit, or a job with no payment recorded) |
| Migration error | Copy the exact error text and send it to me |
