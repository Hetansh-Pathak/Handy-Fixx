# Phone test checklist (what only a real phone can prove)

For the owner. Plain steps, tick each box (`[x]`) as you go. If something fails, write down **the screen, what you tapped and what you saw**, take a screenshot, and send it. That is all I need.

The computer-side checks (typecheck, 736 unit tests, 7 browser suites with 197 checks, Android and web bundles, accessibility scan) are already done and listed in `docs/RELEASE_CHECKLIST.md`. This list covers what they cannot: the real phone, real sound, real GPS, real permission pop-ups.

## 0. Before you start

- [ ] Rebuild **both** apps. The latest changes added a new notification channel and the camera/image code, so old installs are out of date. In the folder `apps\mobile`:

```powershell
npm run build:customer
```

```powershell
npm run build:provider
```

  (These are the development builds from `docs/LOCAL_TEST_GUIDE.md` Part 4. For a build you can install and test **without** your computer running, use `npm run build:customer:preview` and `npm run build:provider:preview` instead.)
- [ ] The `EXPO_PUBLIC_*` values are set on expo.dev for the build (`docs/LOCAL_SETUP.md`).
- [ ] You have a **test customer** and a **test pro**. Name them "TEST ...". They use your real database, so turn the test pro **offline** when you finish.
- [ ] Ideally two phones (one per app). One phone works if you switch accounts.
- [ ] Run this once in Supabase > SQL Editor and tell me the result, so we both know which database changes are live: `supabase\verify\10_proposals_status_READONLY.sql` (it only reads).

## 1. Both apps: the basics

| ☐ | Try this | Good looks like |
|---|---|---|
| ☐ | Open the app for the first time | The permission pop-ups appear one at a time, only when a feature needs them. **The customer app never asks for location "Allow all the time".** The Pro app may ask for it only when you go online or start a trip. |
| ☐ | Profile > Appearance: Light, Dark, System | The whole app changes at once. Text is readable in both. System follows the phone. |
| ☐ | Phone Settings > Display > Font size: **Largest**, then open each main screen | Nothing is cut off or overlapping; buttons still tappable. (Tell me which screen if not.) |
| ☐ | Turn on Airplane mode, tap around, then turn it off | Plain messages like "Could not load..." (never codes or raw database text). The app recovers by itself when the network returns. |
| ☐ | Press the phone's Back button on every screen you visit | It goes back one step, never closes the app unexpectedly or shows a blank screen. |
| ☐ | Kill the app and reopen it | You are still signed in; the screen you were on is sensible. |
| ☐ | Slow phone check (any older Android): scroll the service list and the Jobs list | Scrolling follows your finger without long freezes. First opening takes under about 5 seconds. |

## 2. Customer app (HandyFix)

1. **Home and services**
   - [ ] Offers carousel: swipe, tap the dots (they are easy to hit), tap an offer button.
   - [ ] Pick Plumbing. **Each job card shows a price and, when the admin set a band, "Range ₹249–₹449".**
   - [ ] **"Not sure what's wrong?"** card at the top offers the check-up visit with its price. Tap it: a note says the visit fee is always charged and repairs are added as extra work you approve. The check-up appears first in each group.
2. **Choose a pro**
   - [ ] The list shows only pros who are online right now, each with their own price.
   - [ ] After a few jobs are accepted by a pro, their card says **"Replies in about N min"** (needs database change `20261117`, applied). Pros with fewer than 3 replies show nothing.
3. **Book**
   - [ ] Step through date, time (any 15-minute step, 8 AM to 8 PM, at least 1 hour ahead), address and a 6-digit pincode (a 5-digit one is refused).
   - [ ] Add a photo and a voice note. The microphone pop-up appears only now.
   - [ ] Confirm shows "Platform fee ₹0" and "Price is locked".
4. **While waiting and after acceptance**
   - [ ] Status screen says the pro is reviewing; there is no countdown.
   - [ ] After the pro accepts: you see the 4-digit code, **Call** (needs `20261103`), and **Message**. A phone number typed in chat is refused; "1500, 2000, 3000" is allowed.
   - [ ] Pro extra work appears with Approve / Decline and a bill photo.
5. **Problem closing the job?** (appears when a job has been in progress 2 hours and the code was not entered)
   - [ ] Start a job with your test pro, leave it 2 hours, then open the booking: a card "Problem closing the job?" explains what to do and offers Email / Call. Before 2 hours it must **not** appear.
6. **After the job**
   - [ ] Rate once (needs `20261108`), Report a problem, Book again.
   - [ ] Cancelling is possible only while pending or confirmed; once the pro starts the trip the Cancel button is gone.
   - [ ] Profile: About, Help & support, Delete account.

## 3. Pro app (HandyFix Pro)

1. **Account and identity check**
   - [ ] Sign up, pick "I'm a pro". The 9-step identity check opens the front camera for the selfie and saves after every step.
   - [ ] Approve the pro in the admin app > KYC Review. Within about 30 seconds the Pro app shows Verified.
2. **Going online**
   - [ ] The switch asks for location. Allow "all the time" when asked (needed to stay listed while the app is closed).
   - [ ] The Wallet strip and the fee-free launch line show (10 jobs or 1 month).
3. **Requests**
   - [ ] A booking from the customer app produces a **loud** notification and a popup showing "You earn ₹X" and the fee. No timer.
   - [ ] **Locked request** (only when the pro is **past the launch period** and the wallet cannot cover the fee): the popup says "Locked job request" with "Recharge ₹49 to accept"; Jobs > New shows it with a lock; the phone notification is **quiet** (no sound, no vibration); the street address shows only city and pincode. *To test this the pro must be older than 1 month or have 10 jobs; ask me for a safe way if you want it.*
   - [ ] Recharge: only the packs ₹49, ₹99, ₹199 are offered. Razorpay opens; the balance updates by itself (the app never adds money itself).
4. **The job**
   - [ ] Accept (fee is reserved in the wallet), Start trip, **I've arrived**, Start job, enter the customer's code. (I've arrived needs database change `20261113000000`.)
   - [ ] Add extra work with a bill photo for parts.
   - [ ] After the code: "Job completed" with the fee (3%, min ₹5, max ₹50; "waived" during the launch period) and "You keep ₹...".
   - [ ] Arrival evidence: after you tap I've arrived, the admin can see it on a **disputed** booking (Admin > Fees & disputes > open the dispute > Evidence).
5. **Other**
   - [ ] Working hours, Reviews, Notifications bell, My services (tick jobs, set a rate inside the band), Help, Delete account.

## 4. Admin app (browser, `npm run admin`)

- [ ] **Fees & rules**: shows 3%, ₹5 / ₹50, 10 jobs or 1 month, packs; the "Try a bill" box gives sensible numbers.
- [ ] **Watchlist**: lists pending requests older than 15 minutes and flagged pros (it may be empty on a quiet day; that is fine).
- [ ] **Bookings > Needs help**: lists jobs in progress for 2+ hours.
- [ ] **Price bands**: set a band on the services where pros may choose a rate (10 of 11 have none yet).

## 5. Screen reader (TalkBack), 5 minutes

Phone Settings > Accessibility > TalkBack: on. In both apps:
- [ ] On "How will you use HandyFix?" it reads each option and says whether it is **selected**.
- [ ] Every button is read with a clear name ("Notifications", "Show offer 2 of 5", "Book Asha", ...). Nothing is read as just "button" or "unlabeled".
- [ ] You can complete sign-in and open a service using only TalkBack gestures.

Turn TalkBack off afterwards (hold both volume keys for 3 seconds, or use Settings).

## 6. When you are done

- [ ] Turn the test pro **offline**.
- [ ] Send me: the list of failures (screen + what you tapped + screenshot) and the result of the proposals status query.
