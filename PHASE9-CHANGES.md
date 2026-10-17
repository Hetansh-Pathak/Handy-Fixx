# Phase 9: My Bookings and Notifications (customer app)

Not built or run in a browser here (no node_modules / network). In `customer-app` run:
`npm install && npm run build && npm test && npm run dev`, then check at 390px wide.

## My Bookings (rebuilt)
- Reads the `bookings` table only. The old page guessed status/provider from notification text when it couldn't read
  bookings; that fallback is gone, and a failed load now shows "Try again" instead of a wrong list.
- Each card shows WHEN THE SERVICE IS SCHEDULED ("Today, 4:30 PM"), address, pro, price. (It used to show when you booked.)
- Tabs: Upcoming / Completed / Cancelled, opening on whichever is most useful. Live jobs sort first, then by date.
- Live strip on active cards (waiting / arriving in about N min / arrived / work in progress), updated in real time.
- Actions by state: Track live, Chat, Cancel, Rate your pro, Book again (same pro, same service).
- Cancel now asks first, and only succeeds while the booking is still pending/confirmed (no cancelling a job the pro
  just started).
- Review prompt now knows what you already reviewed (reviews.booking_id is unique, so repeats used to error).
  Saves customer_id AND user_id like the booking page does.
- Refreshes when you return to the app.
- Removed from the list (all still on the booking details page, one tap away): embedded map, completion code,
  attachment viewer, chat dialog. Chat opens the details page via the existing ?chat=1 link. Removed the "All" tab.

## Notifications (rebuilt)
- Grouped Today / Yesterday / Earlier, same colour language as booking statuses.
- Rows are real buttons (keyboard + screen reader friendly), with one clear action label (Rate your pro, Track your pro...).
- Marking read is instant, undone if it fails, and now updates the tab-bar badge (it never did before).
- A failed load shows an error with retry (it used to look like "no notifications").

## Shared code
`src/lib/dates.ts`, `src/lib/bookings.ts`, `components/bookings/BookingCard.tsx`, `components/bookings/ReviewDialog.tsx`.

## Tests
`src/test/dates.test.ts`, `src/test/bookings.test.ts` (20 cases; also run in a DST timezone). 33 total with phase 8.
