# Phase 12 - Provider Earnings + Dashboard polish

NOT built or run in real vitest (no npm access in this sandbox). Checked: syntax of every changed file,
plus the pure logic in lib/earningsView.ts executed directly (totals, week/month buckets, grouping, labels).
Please run: `cd provider-app && npm install && npm run build && npm test`, view at 390px.

## Earnings (rewritten)
- Black balance card with count-up "Ready to withdraw", Processing / Paid out split, gold Withdraw button
- Sliding-pill tabs (Overview / Activity / Payouts); swipe left/right to switch, vertical scroll untouched
- Overview: 6-month bars that spring up, tap a bar for its amount
- Activity grouped Today / Yesterday / date with day totals; payouts list with status pills
- Withdraw is a bottom sheet with a success check; haptics on taps
- SAFER WITHDRAWAL: rows are claimed (pending -> processing) first and the payout amount is the sum actually
  claimed; if the payout insert fails the rows go back to pending. Old code could pay a stale total or
  leave money stuck in "processing" if the second step failed.
- Real error state with Try again; skeletons while loading

## Dashboard
- Greeting by time of day; "Earned today" card (count-up) opens Earnings
- FIX: "today's earnings" used booking totals (customer price); it now uses the provider's earnings
- FIX: week chart ran 7 sequential queries with UTC day boundaries (wrong in IST); now 1 query, local days
- Pending requests show "Today, 4:30 PM"; empty states give a next action; tap a day bar for its amount

## Shared
- `src/lib/earningsView.ts` (+ 5 tests), `src/components/CountUp.tsx`, reduced-motion CSS rule
- monthBuckets avoids the setMonth bug (on the 31st it skipped months)

## Not verified
- Withdrawal against real Supabase/RLS (providers must be allowed to update provider_earnings, as before)
- Visual feel; drag-to-swipe on a real phone
