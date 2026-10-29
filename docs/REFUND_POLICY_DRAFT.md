# Refund and cancellation policy: DRAFT

Status: **draft, not enforced.** Today customers pay the pro directly (UPI or cash), so HandyFix moves no customer money and cannot refund anything. This is the rule I recommend for the day customers pay inside the app (you said you are open to that: customer pays HandyFix, HandyFix pays the pro afterwards). It lives in one place in the code, `packages/shared/src/money/refund-policy.ts`, with tests, so changing a rule later is a small, safe edit.

## The principles

1. **No cancellation fee for customers, ever.** Abuse is handled by limits (3 late cancellations in 30 days pauses instant booking for a week), not by charging.
2. **The pro's fault is always refunded in full:** declined, no answer before the booked time, or did not come.
3. **Once the pro starts the trip the customer has no Cancel button.** Money then moves only through "Report a problem" and an admin decision.
4. **A check-up visit fee is kept once the pro has arrived** (your decision that it is always charged), unless the pro was at fault.
5. **HandyFix absorbs the payment gateway cost** (your decision), so a refund returns the whole amount.
6. **A refund after the pro was already paid** is taken back from the pro's next payout or wallet.

## What happens in each case

| Situation | Customer gets back | Counts as a late cancel? | Pro's ₹ fee |
|---|---|---|---|
| Customer cancels while the request is waiting | 100% | no | returned |
| Customer cancels after the pro accepted, 2 hours or more before the start | 100% | no | returned |
| Customer cancels after the pro accepted, less than 2 hours before the start | 100% | **yes** | returned |
| Pro declines, or nobody answers before the booked time, or the pro does not come | 100% | no | returned |
| Customer wants out after the trip started | support decides; suggested: everything except a check-up visit fee if the pro arrived | no | by decision |
| Dispute: dismissed ("the work was fine") | 0 | | kept |
| Dispute: redo | 0, the pro returns free within 7 days | | kept |
| Dispute: partial refund | the admin's amount (never more than paid) | | returned |
| Dispute: provider penalty | the admin's amount; default everything except an arrived visit fee | | returned |
| Safety problem reported | 100% while it is investigated | | returned |

Refunds are started within 24 hours; the bank then takes its own few working days.

## What you still decide (none of it blocks anything today)

- Whether to start in-app payment at all. Until you do, nothing here is used.
- If you do: Razorpay Payouts (to send the pro their share) must be enabled on your Razorpay account.
- Whether a customer who cancels after the pro arrived for a **normal** (non check-up) job should pay a small visit charge. I recommend not, to keep your "no extra cost" promise.
