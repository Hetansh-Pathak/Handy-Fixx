# Phase 11 - Provider Bookings rebuilt

NOT run in a browser or real vitest: this sandbox had no npm access this turn.
Checked: syntax of all changed files, plus the pure logic in lib/bookingView.ts run directly.
Please run: `cd provider-app && npm install && npm run build && npm test`, view at 390px.

## Changed
- `provider-app/src/pages/provider/Bookings.tsx` - rewritten (757 -> ~290 lines)
  - Pill tabs (New / Upcoming / Active / Done / Cancelled); each booking is in exactly one tab
  - Opens on the most urgent non-empty tab
  - Cards: colour bar by state, earnings, "Today, 4:30 PM" time, address, call, problem details
  - Pending: big Accept (gold) + Decline (asks first); updates only while still pending,
    so two devices cannot both act on one request
  - Accepted/active: one "Start job flow / Continue job" button opens the job sheet; old duplicate
    On-my-way / Start job / Mark complete buttons and the old duplicate location watcher are gone
  - Real error state with Try again (old code showed an empty list on failure)
  - Removed redundant second bookings query and console.log noise
- `provider-app/src/components/provider/ActiveJob.tsx` - listens for the open-job event
## Added
- `provider-app/src/lib/bookingView.ts` + `src/test/bookingView.test.ts` (6 tests)
## Removed from the list (still in job sheet / details): per-card live map.
