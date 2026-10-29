# Commission plan v2: phases (DRAFT for owner approval, 2026-10-28)

> **RECONCILED 2026-10-29.** Owner confirmed: fee = 3% (min ₹5, max ₹50) as in a60e734 (NOT the flat slabs below), apnabanda Black + Blur look stays, lock = wallet cannot cover the held fee, in-app customer payment deferred. Read section 0 first; sections 1-3 are the original draft and are superseded where they differ.

## 0. FINAL plan (use this)

| Phase | What | Status |
|---|---|---|
| 0 | Reconcile docs with the owner decisions | done |
| 1 | Launch = first 10 jobs or 1 month: `LAUNCH_PERIOD`, tests, Help copy, Partner Agreement (v1.2, 3% wording), DB proposal `20261115` (+ dry run 14 / apply 14), CLAUDE.md, README | done (proposal NOT applied) |
| 2 | One config for fee, launch and wallet numbers in shared (`PLATFORM_RULES`, `feePreview`) + read-only admin "Fees & rules" page. Editable DB config table NOT built (needs owner approval) | done |
| 3 | DONE (see PROGRESS.md). Locked requests: pro sees the request and earning, address and phone hidden, "Top up ₹X to accept" (lock = spendable balance cannot cover the held fee; no tiers; silent alert; max 3 cards + counter); DB twin of the accept rule is already in `20261114` | |
| 4 | In-app customer payment + same-day payout (Razorpay Payouts) | deferred until the owner confirms Payouts + the refund rule |
| 5 | Remaining PDF items: **done** problem-closing prompt (5a) and dispute evidence arrival + chat (5b, DB proposal 20261116 not applied); **done** ranking bands + response speed + admin Watchlist (5c, DB proposal 20261117 not applied); still open: quote/visit fee, push, pincode and cancel rules, A2-A7 in PROGRESS.md NEXT | in progress |
| 6 | Polish and release checks (screen-by-screen, small screens, screen readers, full check run) | |

Pro own rates and Labour & Shifting were built on 2026-10-29 (a60e734), so they are no longer in the plan.

## Original draft (superseded where it differs)

Status: PLAN ONLY. No code changed yet. Source: owner answers on 2026-10-28 + HandyFix-complete.pdf. Where this plan differs from CLAUDE.md / the PDF, the owner's new answers win once this file is approved; CLAUDE.md and PROGRESS.md are then updated.

## 1. Decisions taken (owner)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Fee type | Flat slabs stay: ₹15 (< ₹500), ₹30 (₹500-1,500), ₹50 (> ₹1,500) on the SERVICE bill, parts excluded. |
| 2 | Launch period | 10 free jobs OR 1 month, whichever ends first (was 3 months). Fee shown as "waived". |
| 3 | Pro with wallet balance | Can accept requests of higher value. Customer may pay the pro directly (UPI/cash); fee leaves the wallet after the job. |
| 4 | Pro without wallet balance | Sees bigger requests but CANNOT accept them (locked, "top up to accept"). On jobs they can do, the customer pays IN THE APP (Razorpay) to HandyFix; HandyFix keeps the flat fee and pays the rest out the SAME DAY. |
| 5 | Gateway cost | HandyFix absorbs it (kept as an admin setting, default 0 to the pro, so it can change later). |
| 6 | Future | Business model may change again: every number and rule lives in ONE config (database table + shared TypeScript), never hard-coded in screens. |

## 2. My suggestions (please confirm or change before Phase 1)

1. **Locked requests: good idea, with guard rails.** Show the request with the earning amount and a clear "Top up ₹X to accept" button (deep link to wallet top-up). Hide the customer's exact address and phone until accepted (privacy). Show the lock only for jobs the pro is otherwise eligible for (right service, area, KYC approved), otherwise it is noise. Do not stack too many locked cards on the home screen: cap at the newest 3 and a counter "+N more".
2. **Tiers by wallet balance, editable by admin** (defaults to confirm): no wallet = jobs up to ₹500 service bill; wallet >= ₹100 = up to ₹1,500; wallet >= ₹250 = any value. Rule: wallet must cover at least ONE fee at that tier (₹15/₹30/₹50) plus a small buffer. So the lock is never arbitrary: "to accept a ₹1,800 job you need ₹50 + buffer in your wallet".
3. **Launch waiver and tiers:** during the launch period (10 jobs / 1 month) no wallet is needed for ANY value, so early pros are not blocked. After launch the tiers apply. Pros mid-job are never blocked retroactively.
4. **In-app payment for jobs with no wallet is a big change** (this was PDF open decision 1, now answered "in app"). It needs: Razorpay order per booking, webhook that confirms payment, "paid" state on the booking, refund path on cancel/dispute, same-day payout to the pro's saved UPI/bank, reconciliation view for admin. Razorpay RazorpayX payouts need business KYC on your Razorpay account and cost money per payout: please check this before Phase 5; until it is active I would build payouts as "queued, admin releases same day" so nothing blocks.
5. **Customer choice:** when the pro HAS wallet, customer can still pick "pay in app" or "pay the pro". Suggest allowing both, so customers who prefer cash are not forced online.
6. **Anti-bypass:** the pro earning is shown before accepting, chat blocks phone numbers (done), fee is flat and small. Keep these; do not add penalties yet.
7. **Same-day payout risk:** refunds/disputes after payout. Mitigation: payout only after the customer enters the completion code (job closed), and dispute-refunds are recovered from the pro's next payout or wallet (negative balance = due). Dispute window stays 24 h / 48 h.

## 3. Phases (one vertical slice each, shared logic + tests first, then screens, then PROGRESS.md; each ends with typecheck, lint, test, build, mobile:typecheck)

### Phase 0 - Housekeeping (small, no database change)
- Update `LAUNCH_PERIOD` to `{ months: 1, jobs: 10 }` in `packages/shared/src/money/launch.ts`, fix tests, UI copy ("3 months" -> "1 month") in provider home/wallet/help, admin screens, CLAUDE.md, PROGRESS.md, reference docs.
- Move all fee/launch/tier numbers to one typed `PlatformConfig` in shared (single source), so changing the model later is one place.
- DB side of the launch period is in proposal `20261102000001` (3 months hard-coded there): a new proposal `...pricing_config` reads the numbers from a config table instead (ask before applying).

### Phase 1 - Platform config table (database proposal, NOT applied without your approval)
- New `supabase/proposals/...platform_config_PROPOSAL_NOT_APPLIED.sql`: `platform_config` (launch months/jobs, slab edges, tier thresholds, wallet buffer, gateway-cost-to-pro, payout mode), admin-only write, public read of non-secret keys, audit-logged.
- Dry run with ROLLBACK, throwaway Postgres test, `apply_N_COMMIT.sql`.
- Admin page "Fees & tiers" to edit it (extends the existing Fees & disputes page).

### Phase 2 - Eligibility tiers and locked requests
- Shared: `canAcceptByWallet({ billValue, walletAvailable, launch, config })` returns `allowed` or `locked { needTopUp, reason }`; tests for every boundary and the launch waiver.
- DB: `checkCanAccept` twin in the accept guard (proposal; ask first) so a modified app cannot bypass the lock.
- Pro app: locked request card (earning visible, address/phone hidden, "Top up ₹X to accept" -> wallet), request alert for locked jobs is silent (no ring), cap of 3 locked cards + counter.
- Mock-backend browser tests updated.

### Phase 3 - Fee engine for both payment paths
- Shared: one `settleBooking` result covers (a) wallet path: fee from wallet, (b) in-app path: fee kept from payment, rest to payout. Same slab, parts excluded, waived in launch. Tests for extras that change the slab, refunds, waived jobs.
- `booking_fees` audit row records path, gross, fee, gateway cost, net to pro.

### Phase 4 - Customer in-app payment (Razorpay)
- Booking confirm shows "Pay in app" (required when the chosen pro has no wallet/locked tier, optional otherwise) with ₹0 platform fee and the same price.
- Edge function creates the order; webhook marks the booking paid (idempotent); app never marks itself paid. Extras approved later: a top-up payment of the extra amount.
- Cancel/refund rules: pending/confirmed cancel = full refund; late cancel and dispute refunds per admin decision. Needs your cancellation-fee rule.

### Phase 5 - Same-day payout
- On job close (completion code): ledger entry "earning" and a payout job; edge function pays via Razorpay payouts to the saved UPI/bank, or queues for admin approval until RazorpayX is active.
- Pro wallet screen: "Paid today ₹X", payout status, failed-payout retry; admin payouts queue and reconciliation page.

### Phase 6 - Provider and customer UI polish for the new model
- Pro: "You earn ₹X, fee ₹Y (waived)", wallet health meter ("you can accept jobs up to ₹..."), top-up nudges only when a locked request exists.
- Customer: payment status on booking, receipt, bill card shows in-app payment.
- Hindi/regional copy for money screens.

### Phase 7 - Remaining PDF items from `docs/NEXT_CHAT_FINISH_PDF.md` section 3B (each its own slice, owner decisions first)
Pro rate inside the band (needs your option a/b/c), "Problem closing the job?" prompt, dispute evidence timeline + arrival location, complex-job quote and visit fee, masked calling, push to a closed app (needs Firebase), ranking wiring and admin flags, 6-digit pincode and cancel rule alignment.

### Phase 8 - Release hardening
Checkpoint 7 (screen-by-screen polish, small screens, screen-reader labels) and checkpoint 8 (full checks, web export, phone checklist), security items (confirm_user_email, provider OTP, Aadhaar salt, duplicate triggers, RLS performance), Play Store prep.

## 4. What I need from you before Phase 0 starts
1. OK on suggestions 1-7 above, or the changes you want (especially the tier amounts in suggestion 2 and "customer can choose pay in app or pay the pro" in 5).
2. Do you have a Razorpay account with Payouts (RazorpayX) enabled? If not, Phase 5 starts as "queued, admin releases same day".
3. Cancellation fee / refund rule for in-app payments (e.g. full refund until the pro starts the trip, none after).
4. Approval to update CLAUDE.md and PROGRESS.md with these decisions.

Rules kept: no database/RLS/edge-function change without asking, no push without asking, no old 12% customer fee, no 30-second timer, cream + terracotta look unchanged.
