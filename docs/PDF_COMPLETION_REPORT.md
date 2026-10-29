# apnabanda pitch document vs the apps: completion report

Measured 2026-10-29 on branch `Ritesh`, against `apnabanda-detailed-document_2.pdf`. Every requirement in the pitch document was turned into one line below (62 lines) and scored by reading the code and checking the live database, not by guessing.

- **Built** = is it in the code, tested on the computer (Vitest + browser suites)?
- **Works live today** = would it work for a real user on the live Supabase project right now? (A feature can be fully built but wait for a database step, a key or an account that only the owner can supply.)
- Score per line: Done = 100%, Partly = 50%, Not built = 0%.
- **Phone-verified is 0%.** Nothing has been walked through on a real phone yet (`docs/PHONE_TEST_CHECKLIST.md`). Treat every number as "ready to test", not "proven".

## Summary

| Area | Lines | Built | Works live today |
|---|---|---|---|
| Customer app | 19 | 84% | 68% |
| Pro app | 13 | 85% | 62% |
| Admin panel | 9 | 100% | 94% |
| Job flow and trust | 10 | 90% | 80% |
| Business model | 5 | 100% | 50% |
| Platform | 5 | 100% | 40% |
| Release | 1 | 0% | 0% |
| **All** | **62** | **89%** | **68%** |

Of 62 lines: **54 fully built, 2 partly built, 6 not built**. **35 work fully on the live project today.** The gap between 89% built and 68% live is almost all "apply a database proposal" and "supply a key or account" (sections 2 and 3).

The pitch PDF itself still shows the old rules (flat fee slabs, 3-month launch, 30-second accept timer). The app follows your later decisions: 3% fee (min ₹5, max ₹50), 10 jobs or 1 month, no timer. Consider updating the PDF before sharing it.

## 1. What is not built yet (6 lines)

- **Trust cues strip on Home (Verified, Locked, Live)** (Customer app, p.11): Not built (small)
- **Masked calls (numbers hidden, call through the app)** (Customer app, p.12): Not built: the real number shows after acceptance (needs a telephony provider)
- **Weekly earnings chart** (Pro app, p.14): Not built (small)
- **SMS OTP to confirm the pro's phone** (Pro app, p.15): Not built (needs DLT registration and an SMS provider)
- **Featured slots (rating 4.3+)** (Job flow and trust, p.20): Planned for after ~40 pros (not a launch item)
- **Play Store release of both apps (builds, listing, closed test)** (Release, p.26): Not started: needs accounts, builds, phone test

### Partly built (2 lines)

- **Home: services, popular services, area; search** (Customer app, p.11): Search lives on the Services tab, not on Home
- **"Book again" card on Home** (Customer app, p.11): Book again exists after a job; not as a Home card

## 2. Built, but waiting for a database step or data (you paste the SQL; I supply dry run + apply file)

Run `supabase/verify/10_proposals_status_READONLY.sql` first; it shows which of these are already applied. Dry run first (it ends with ROLLBACK), then the `apply_..._COMMIT.sql` file.

| Proposal | What it unlocks |
|---|---|
| `20261118` requests stay open | Replaces the 30-minute auto-cancel with "open until a pro accepts" |
| `20261119` daily labour | Editable default wages |
| `20261120` push tokens and repeat filter | Phone registers for alerts |
| `20261121` push webhooks | Database calls the `notify-push` function (needs the vault secret first) |
| `20261114` fee 3% + hold at accept | Database charges 3% instead of old slabs (apply the same day as the new Pro build) |
| `20261108` reviews | Customers can save a rating |
| `20261110` chat hardening | Server-side phone-number block, closes posting into other chats |
| `20261113000002` pro jobs and own rates | Pros' own price per job |
| `20261109` / `20261103` | Nearest sort / Call button |
| `20261111` (+ `delete-account` function) | In-app account deletion (Play requires it) |
| `20261112` | Late-cancel limit that cannot be dodged |
| `20261113000000` | The "I've arrived" step guard |

Data: set admin **Price bands** for 10 of 11 services.

## 3. Work only you can do

### PART A: push alerts to a closed app (details: `docs/PUSH_SETUP.md`)
1. Firebase project, add both Android apps (`in.handyfix.app`, `in.handyfix.pro`), download `google-services.json`.
2. Put the file in `apps\mobile\google-services.json` and as the Expo file variable `GOOGLE_SERVICES_JSON`.
3. Firebase > Service accounts > new private key; upload it to Expo with `npx eas-cli credentials` (FCM V1), for each app.
4. Create the Pro Expo project: `$env:EXPO_PUBLIC_APP_VARIANT="provider"; npx eas-cli init` and send me the project id.
5. Supabase > Edge Functions > Secrets: add `PUSH_WEBHOOK_SECRET` (a long random value **you type yourself**; it never passes through me).
6. In the SQL Editor run once: `SELECT vault.create_secret('<the same value>', 'push_webhook_secret');`
7. Run the SQL files in order: `19` (dry run, then apply), then `20` (dry run, then apply).

The function `notify-push` is **already deployed** to the live project (version 1). It refuses every call that lacks the secret, so it is harmless until step 5.

### Accounts and keys
- Google Play Console account (start early: closed test needs testers for 14 days).
- Razorpay live keys + webhook, and deploy the pack-only `create-wallet-topup-order` function.
- Google Maps key (optional; map card falls back to ETA + "Open in Google Maps").
- Host the `site/` folder (privacy, terms, account deletion) and give the three links to Play Console.
- Google sign-in release SHA-1.
- New apnabanda icon and splash files.

### Decisions
- Refund rule (`docs/REFUND_POLICY_DRAFT.md` is a draft, not enforced).
- In-app customer payment and payouts (deferred; needs Razorpay Payouts decision).
- Old QR-payment functions still live (`create-qr-payment`, `close-booking-qr`): remove or keep.
- Lawyer read of the legal pages.

### Testing
- Walk through `docs/PHONE_TEST_CHECKLIST.md` on a real phone. Until then phone-verified stays 0%.

## 4. Every line

| Area | Requirement | Page | Built | Live today | Note |
|---|---|---|---|---|---|
| Customer app | Home: services, popular services, area; search | p.11 | Partly | Yes | Search lives on the Services tab, not on Home |
| Customer app | Promise on screen: ₹0 platform fee, one locked price | p.11 | Done | Yes |  |
| Customer app | Trust cues strip on Home (Verified, Locked, Live) | p.11 | Not built | No | Not built (small) |
| Customer app | "Book again" card on Home | p.11 | Partly | Yes | Book again exists after a job; not as a Home card |
| Customer app | Choose a pro: own price, verified tick, rating, jobs done | p.11 | Done | Partly | Pros' own per-job rates need proposal 20261113000002 |
| Customer app | Fair price range shown before booking | p.11 | Done | Partly | Only 1 of 11 services has a band set yet (admin data) |
| Customer app | Sort by cheapest, top rated, nearest | p.11 | Done | Partly | Nearest needs proposal 20261109 |
| Customer app | Confirm screen: locked price, ₹0 fee, pay the pro directly | p.11 | Done | Yes |  |
| Customer app | If a pro declines: next best pros at once, cancel free | p.11 | Done | Yes |  |
| Customer app | Live tracking: ETA and distance | p.12 | Done | Yes |  |
| Customer app | Live tracking: embedded map | p.12 | Done | No | Needs your Google Maps key |
| Customer app | Masked calls (numbers hidden, call through the app) | p.12 | Not built | No | Not built: the real number shows after acceptance (needs a telephony provider) |
| Customer app | Chat with the pro (phone numbers blocked) | p.12 | Done | Partly | Server-side block needs proposal 20261110 |
| Customer app | Approve extra work with a bill photo | p.12 | Done | Yes |  |
| Customer app | 4-digit completion code (hashed, attempts limited) | p.12 | Done | Yes |  |
| Customer app | Done: final bill, one rating, Report a problem (24 h) | p.12 | Done | Partly | Rating cannot save until proposal 20261108 |
| Customer app | Email OTP before the first booking | p.18 | Done | Yes |  |
| Customer app | Cancel rules; 3 late cancels in 30 days pauses booking | p.13 | Done | Partly | Tamper-proof version needs proposal 20261112 |
| Customer app | Notifications inside the app | - | Done | Yes |  |
| Pro app | Dashboard: online switch and wallet | p.14 | Done | Yes |  |
| Pro app | Earned today, acceptance rate | p.14 | Done | Yes |  |
| Pro app | Weekly earnings chart | p.14 | Not built | No | Not built (small) |
| Pro app | Launch-period note (fee waived) | p.14 | Done | Yes |  |
| Pro app | New request: earning and fee first, address after accept, decline costs ₹0 | p.14 | Done | Partly | App shows the 3% fee; database charges old slabs until proposal 20261114 |
| Pro app | Request alert (decided: no 30-second timer, request stays open) | p.14 | Done | Partly | Open-until-accepted needs proposal 20261118 |
| Pro app | Active job: start trip, arrived, start job, enter code | p.14 | Done | Yes |  |
| Pro app | Extra work / parts with bill photo; fee never taken during the job | p.14 | Done | Yes |  |
| Pro app | Wallet: balance, recharge, withdraw, list of fees | p.14 | Done | Partly | Live Razorpay keys and the new recharge function still to deploy |
| Pro app | 9-step ID check with admin approval | p.15 | Done | Yes |  |
| Pro app | SMS OTP to confirm the pro's phone | p.15 | Not built | No | Not built (needs DLT registration and an SMS provider) |
| Pro app | Own rate inside the admin band | p.13 | Done | No | Needs proposal 20261113000002 |
| Pro app | Working hours, reviews, notifications, My services | - | Done | Partly | My services needs 20261113000002 |
| Admin panel | KYC review: approve, reject with reason | p.16 | Done | Yes |  |
| Admin panel | Price bands per service | p.16 | Done | Partly | Bands still to be set for 10 of 11 services |
| Admin panel | Watch requests pending over 15 minutes | p.16 | Done | Yes | Watchlist page |
| Admin panel | Cancel or reassign a booking | p.16 | Done | Yes |  |
| Admin panel | Help when the code is not shared in 2 hours | p.16 | Done | Yes | Needs-help tab |
| Admin panel | Decide disputes in 48 h, one appeal | p.16 | Done | Yes |  |
| Admin panel | Flag suspicious patterns | p.16 | Done | Yes | Watchlist page |
| Admin panel | Suspend a pro | p.16 | Done | Yes |  |
| Admin panel | Audit log | p.16 | Done | Yes |  |
| Job flow and trust | Six stored statuses incl. arrived | p.17 | Done | Yes |  |
| Job flow and trust | Arrival location logged as evidence | p.17 | Done | Yes | Proposal 20261116 applied |
| Job flow and trust | Fee record written at completion | p.17 | Done | Partly | Records the old slab fee until proposal 20261114 |
| Job flow and trust | Dispute timeline: price lock, trip, arrival, code, extras, chat | p.19 | Done | Yes |  |
| Job flow and trust | Dispute outcomes (dismiss, redo, partial refund, penalty), appeal, safety suspension | p.19 | Done | Yes |  |
| Job flow and trust | Report window 24 h (48 h repair quality) | p.19 | Done | Yes |  |
| Job flow and trust | Ranking by rating, distance, response speed (never money) | p.20 | Done | Yes | Response speed live since 20261117 |
| Job flow and trust | Featured slots (rating 4.3+) | p.20 | Not built | No | Planned for after ~40 pros (not a launch item) |
| Job flow and trust | Phone numbers revealed only after confirmation | p.20 | Done | Partly | On screen only; server-side hiding needs a database change |
| Job flow and trust | Book again with the same pro | p.20 | Done | Yes |  |
| Business model | Pro fee on completed jobs only (decided: 3%, min ₹5, max ₹50) | p.21 | Done | No | Proposal 20261114 not applied yet |
| Business model | Fee-free launch (decided: 10 jobs or 1 month) | p.21 | Done | Yes | Proposal 20261115 applied |
| Business model | Wallet check at Accept ("Top up ₹X to accept"), locked requests | p.21 | Done | Partly | Database twin comes with 20261114 |
| Business model | Declined, missed or cancelled jobs cost ₹0 | p.21 | Done | Yes |  |
| Business model | Razorpay wallet top-up | p.21 | Done | No | Needs live Razorpay keys, deployed function, webhook |
| Platform | Push alerts to a closed app | p.8 | Done | No | Function deployed; needs your Firebase steps and 2 proposals |
| Platform | Account deletion works | - | Done | No | Needs proposal 20261111 and its function |
| Platform | Privacy policy, terms, account-deletion pages | p.25 | Done | No | Built; needs hosting |
| Platform | One codebase, two store apps, admin on the same backend | p.8 | Done | Yes |  |
| Platform | Accessibility and small-screen polish | - | Done | Yes |  |
| Release | Play Store release of both apps (builds, listing, closed test) | p.26 | Not built | No | Not started: needs accounts, builds, phone test |
