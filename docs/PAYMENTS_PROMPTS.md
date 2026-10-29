# In-app payments, wallet and payouts: prompts for Claude Code (VS Code)

Owner: paste **one section at a time** into Claude Code in VS Code, on branch `hetansh2`. Wait until a section is
finished, tested and pushed before you paste the next one. Start a **new chat for each section** (CLAUDE.md: one task
per session).

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Section 6 (encryption) can also run on its own at any time.

Before Sections 4 and 5: ask Razorpay to turn on **RazorpayX** (payouts) for your new account. It has its own test
mode at x.razorpay.com.

---

## What I checked about your Razorpay account change

- No Razorpay key is written in the code. Every server function reads `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
  `RAZORPAY_WEBHOOK_SECRET` from **Supabase secrets**. The app receives the key id from the server
  (`create-wallet-topup-order` returns `key_id`).
- So switching to the new account means **changing settings, not code**: new keys in Supabase secrets, plus a new
  webhook in the new account. Section 0 walks you through it.

---

## Section 0: switch to the new Razorpay account and get wallet recharge working (test mode)

**Do this yourself first (about 10 minutes):**

1. New Razorpay account → turn on **Test Mode** → Settings → API Keys → **Generate Test Key**. Save the Key Id
   (`rzp_test_…`) and the Key Secret.
2. Settings → Webhooks → **Add New Webhook** (in Test Mode):
   URL `https://jviwwhjwtyneqrguumro.supabase.co/functions/v1/razorpay-webhook`, a new long random secret,
   events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. In the **old** account: delete the webhook and regenerate (revoke) its keys, so nothing can call you from there.
4. Supabase → Edge Functions → Secrets: replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET` with the new values. Functions read secrets when they run, so there's no need to redeploy for this.

**Prompt to paste:**

```
We are on branch hetansh2. Follow CLAUDE.md exactly (sync first, database changes as proposals, ask before anything
touches the live Supabase project or deploys a function, run the full checks before saying done).

Task: SECTION 0 only. I moved to a NEW Razorpay account and want wallet recharge (₹49/₹99/₹199 packs) fully working in
Razorpay TEST mode with it. I have already put the new test keys and the new webhook secret in Supabase secrets and
added the webhook in the new account (events payment.captured, order.paid, payment.failed, refund.processed).

1. Confirm that no Razorpay key, account id or old webhook URL is hardcoded anywhere (apps, legacy, supabase, docs,
   .env examples). Report every place Razorpay config comes from.
2. With READ-ONLY queries on the live project, tell me whether proposal 20261114000000 (fee 3%, holds, recharge
   packs) and the tables record_wallet_topup / payment_events / wallet_transactions need are in place. Use
   supabase/verify and the proposals status query that already exist.
3. Prepare deployment of the proposal versions in supabase/proposals/functions/ (create-wallet-topup-order,
   verify-wallet-payment, razorpay-webhook): copy them over supabase/functions/, check they still typecheck, and give
   me the exact deploy commands. Do NOT deploy and do NOT apply SQL without asking me first.
4. Check the Pro app recharge screen end to end against docs/PAYMENTS_SETUP.md (pack only, polls the ledger, never
   credits locally, friendly errors). Fix only real bugs.
5. Update docs/PAYMENTS_SETUP.md with a short "switching Razorpay account" part.

Plan first and show me the plan. When the checks pass, commit, push to hetansh2, and give me the test table from
docs/PAYMENTS_SETUP.md section 4 to run on my phone (development build).
```

---

## Section 1: customer pays for a booking in the app (order creation)

```
We are on branch hetansh2. Follow CLAUDE.md exactly (sync first, plan first, database changes only as new files in
supabase/proposals/ with a ROLLBACK dry run, ask before touching the live project or deploying, shared logic +
Vitest tests in packages/shared before screens, full checks before done).

OWNER DECISION (update CLAUDE.md "Business model" to match): customers may now pay for a booking IN THE APP through
Razorpay, like Rapido, OR pay the pro directly (cash/UPI) as today. Platform fee for customers stays ₹0.

Task: SECTION 1 only = create and open the payment. Crediting the pro's wallet is Section 2; do not build it here.

1. Shared (packages/shared, with tests): the amount to pay for a booking = the locked service bill plus approved
   extras, in paise, computed from booking data only; which bookings can be paid online (which statuses, not already
   paid, not cancelled); a payment state type (unpaid / pending / paid / refunded / partially_refunded).
2. Database proposal: a booking_payments table (booking_id, razorpay_order_id UNIQUE, razorpay_payment_id UNIQUE,
   amount_paise, status, method, created_at, paid_at), payment_status and payment_method on bookings, RLS so a
   customer and the booking's pro can READ their own rows and NO client can insert/update/delete. A SQL function that
   returns the payable amount from the database, so the server never trusts an amount from the app.
3. Edge function proposal create-booking-payment-order: the caller must be the booking's customer; amount comes from
   the SQL function; reuse an unpaid open order for the same booking and amount instead of creating a new one; rate
   limit like create-wallet-topup-order; Razorpay notes { type: "booking_payment", booking_id }; returns order_id,
   amount_paise, key_id, prefill.
4. Mobile customer app: on the booking screen a "Pay ₹X online" button when the booking can be paid, which opens
   Razorpay through apps/mobile/src/lib/razorpay.ts (make its description configurable, keep wallet recharge
   working). After success, show "Payment received, confirming…" and poll payment_status. The app NEVER marks
   anything paid itself. Also keep a clear "I'll pay the pro directly" path.
5. Update the browser mock (apps/mobile/e2e-web/mock-supabase.cjs) and add a booking-payment test.

Show me the plan and the exact payment moment you suggest (when the button appears) before building. When the checks
pass, commit, push to hetansh2 and stop with a short report, including what must be applied/deployed and in what order.
```

---

## Section 2: webhook confirms booking payments and credits the pro's wallet

```
We are on branch hetansh2. Follow CLAUDE.md exactly (sync, plan first, proposals only, ask before live changes,
shared logic + tests first, full checks before done). Section 1 (booking payment orders) is already on this branch.

Task: SECTION 2 only = when a booking payment succeeds, record it once and credit the pro's wallet safely.

1. SQL function proposal record_booking_payment (SECURITY DEFINER, REVOKE from public/anon/authenticated, callable
   only by the service role). It must be IDEMPOTENT: one credit per razorpay_payment_id, whatever the number of times
   the webhook arrives, and only if the paid amount equals the order amount. In ONE transaction, with a row lock on
   the booking: mark booking_payments and the booking paid; write wallet_transactions rows: the pro's earning
   (service bill + approved extras) as a credit, and the platform fee (feeForServiceBill rules: 3%, min ₹5, max ₹50,
   parts excluded, waived in the launch period) as a debit taken from this payment; release the wallet_hold for this
   booking because the fee is now taken from the payment, not from the wallet. Mark the earning as ON HOLD with an
   available_at time (dispute window, read from the existing settings; Section 3 makes it withdrawable).
2. A refund function for booking refunds (refund.processed whose payment belongs to a booking): reverse the right
   share from the pro's wallet, idempotent per refund id, partial refunds supported.
3. Update the razorpay-webhook proposal: verify the HMAC as today, then route by notes.type: wallet_topup (unchanged),
   booking_payment (new), anything else logged and ignored. Log payment.failed. Out-of-order and duplicate events must
   be safe. Keep everything in payment_events.
4. Edge function proposal verify-booking-payment: checks the Razorpay signature from the app for an instant "paid"
   screen, but the wallet is still credited ONLY by the webhook.
5. A self-test SQL in supabase/verify (like 03_selftest_NOTHING_SAVED.sql, ends with ROLLBACK) proving: double
   webhook = one credit, wrong amount = no credit, refund reverses, fee is correct, a waived launch job takes ₹0 fee.

Show me the plan first. When the checks pass, commit, push to hetansh2 and stop with a short report.
```

---

## Section 3: hold period, available balance, disputes and negative balances

```
We are on branch hetansh2. Follow CLAUDE.md exactly. Sections 1-2 (booking payment + webhook credit) are on this branch.

Task: SECTION 3 only = money on hold vs money the pro can withdraw.

1. Shared (with tests): a wallet summary with spendable (for fee holds), on_hold (earnings not yet past
   available_at) and withdrawable; rules for a dispute freezing a held earning; a refund after the money was already
   withdrawn turns into a negative balance that is recovered from the next earnings before anything is withdrawable.
2. Database proposal: update get_wallet_summary() to return these numbers (computed from available_at, so no cron
   job is needed); request_payout must allow only the withdrawable amount; an open dispute on the booking keeps its
   earning on hold until an admin resolves it.
3. Pro app wallet tab: show "On hold ₹X (available on <date>)", "You can withdraw ₹Y", and a clear line when the
   balance is negative and why. Customer app: payment status and a simple receipt on the booking.
4. Admin app: show on-hold and withdrawable per provider on the Wallets page.
5. Extend the self-test SQL for these cases.

Plan first. When the checks pass, commit, push to hetansh2 and stop with a short report.
```

---

## Section 4: secure payout details (Razorpay fund accounts, no bank numbers in our database)

Needs RazorpayX turned on for your account (test mode is fine). Add `RAZORPAYX_ACCOUNT_NUMBER` (your RazorpayX test
account number) to Supabase secrets when Claude asks.

```
We are on branch hetansh2. Follow CLAUDE.md exactly. RazorpayX is enabled on my Razorpay account in test mode.

Problem found: service_providers.bank_account_number, bank_ifsc, upi_id (and the copies in the payouts table) are
stored as plain text. Task: SECTION 4 only = stop storing bank details ourselves.

1. Edge function proposal save-payout-details: the pro sends a UPI id or bank account + IFSC + name; the function
   creates (or reuses) a RazorpayX Contact and Fund Account, runs Fund Account Validation (penny drop for bank, VPA
   validation for UPI), and stores ONLY: fund_account_id, type, a masked label (last 4 digits / masked UPI),
   validated status, name returned by the bank, created_at. The full number is never written to our database or logs.
2. Database proposal: a provider_payout_accounts table (RLS: the pro reads own masked row, admin reads masked rows,
   no client writes). New payouts reference the fund account id instead of copying bank details. A plan (separate,
   NOT applied, ask me) to null out and later drop the old plaintext columns once every pro has re-saved.
3. Protection: changing payout details needs a fresh OTP (reuse the existing provider OTP functions) and blocks
   withdrawals for 24 hours after a change (shared rule + database check). Notify the pro when details change.
4. Pro app: update PayoutCard to use the new function, show the masked label and "Verified" / "Check failed".
5. Admin app: masked details only.

Plan first and list any Razorpay account setting I must turn on. When the checks pass, commit, push to hetansh2 and stop.
```

---

## Section 5: automatic withdrawals through RazorpayX Payouts

```
We are on branch hetansh2. Follow CLAUDE.md exactly. Sections 1-4 are on this branch (fund accounts exist).

Task: SECTION 5 only = the pro taps Withdraw and gets the money automatically, safely.

1. request_payout (proposal): in one transaction with a row lock on the wallet, check withdrawable balance, the 24 h
   change cooldown, minimum ₹100, a daily maximum amount and a maximum number of withdrawals per day (settings table,
   admin-editable); reserve the amount with a ledger row; create a payout row status 'queued'. Amounts above an
   admin threshold go to 'needs_approval' instead.
2. Edge function proposal process-payout: sends the payout to RazorpayX (mode UPI or IMPS) with header
   X-Payout-Idempotency = our payout row id, so a retry can never pay twice; stores the razorpay payout id; status
   'processing'. A global kill switch setting (payouts_auto_enabled) stops all automatic payouts.
3. Webhook: handle payout.processed (paid), payout.failed and payout.reversed (give the reserved money back to the
   wallet with a ledger row, idempotent). Tell me which payout events to add in the RazorpayX dashboard.
4. Pro app: withdrawal status (queued / processing / paid / failed with the reason) and the UTR when paid.
   Admin app: payouts queue with approve, retry and the kill switch.
5. Self-test SQL: double tap = one payout, failed payout returns money once, cannot withdraw on-hold money.

Plan first. When the checks pass, commit, push to hetansh2 and stop with a short report.
```

---

## Section 6: encryption of the remaining personal data and a security pass

```
We are on branch hetansh2. Follow CLAUDE.md exactly (proposals only, ask before live changes).

Task: SECTION 6 only = protect personal data at rest and check the basics.

1. provider_kyc.pan_number is stored as plain text. Encrypt it at the application level: AES-256-GCM in an Edge
   Function, key in Supabase secret PII_ENCRYPTION_KEY (I will create it), a key_version column for rotation, a
   masked value for display and an HMAC "blind index" for the duplicate check (like aadhaar_hash). Decrypt only in an
   admin-only Edge Function that checks the admin role and writes every access to a pii_access_log table. Include a
   backfill proposal for existing rows (NOT applied, ask me).
2. Check and fix where needed: the provider-kyc bucket is private and signed URLs expire within 5 minutes; no
   service-role key in any app or in git history of tracked files; the mobile Supabase session is stored with
   expo-secure-store; no personal data (phone, PAN, bank, UPI) is printed in console logs or error reports; every
   table holding money or personal data has RLS on with no client write policy.
3. Write docs/SECURITY.md: what is encrypted, where keys live, how to rotate the key, who can decrypt, and what to
   do if a key leaks.

Plan first. When the checks pass, commit, push to hetansh2 and stop with a short report.
```

---

## Section 7: daily reconciliation and alerts

```
We are on branch hetansh2. Follow CLAUDE.md exactly. Sections 1-5 are on this branch.

Task: SECTION 7 only = catch any money mismatch the same day.

1. Edge function proposal reconcile-payments, run daily (pg_cron or a Supabase schedule, tell me how to enable it):
   fetch Razorpay payments, refunds and payouts for the last 48 hours and compare them with payment_events,
   booking_payments, payouts and wallet_transactions. Write every mismatch to a reconciliation_issues table (paid in
   Razorpay but not credited, credited twice, payout stuck in processing over 2 hours, amount differs).
2. A ledger check: each wallet's balance equals the sum of its wallet_transactions; report any difference.
3. Admin app: a "Reconciliation" page listing open issues with a "mark resolved" note.
4. An alert (email to the admin, using the existing email function setup) when a new issue appears or the webhook
   has failed several times.

Plan first. When the checks pass, commit, push to hetansh2 and stop with a short report.
```

---

## Section 8: full end-to-end test and go-live checklist

```
We are on branch hetansh2. Follow CLAUDE.md exactly. Sections 0-7 are on this branch.

Task: SECTION 8 only = prove the whole money flow works in Razorpay TEST mode and prepare going live. No new features.

1. Run all checks and every browser mock test; fix only real bugs.
2. Write docs/PAYMENTS_TEST_PLAN.md: a step-by-step phone test table covering recharge, booking payment online and
   cash, closing the app right after paying, airplane mode after paying, double tap, resent webhook, refund before
   and after withdrawal, dispute holding the money, withdrawal success / failure / reversal, payout detail change
   cooldown, and the expected wallet numbers after each step.
3. List every proposal and function in the order they must be applied/deployed, with the verify query after each.
4. Update docs/PAYMENTS_SETUP.md with the going-live steps: Razorpay and RazorpayX KYC, live keys, a separate live
   webhook and secret, Supabase point-in-time backups, a ₹10 real test and refund, and a note to confirm TDS
   (section 194-O) and GST on the platform fee with a CA.

Commit, push to hetansh2 and give me a short report.
```
