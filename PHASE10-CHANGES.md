# Phase 10 — Account deletion (Play Store requirement)

Verified here with real tooling: all 3 apps build, customer-app types clean, 53 tests pass (34 -> 53).
NOT verified: running against your real Supabase. Test with a throwaway account first.

## Added
- `database/supabase/functions/delete-customer-account/core.ts` — pure deletion logic (unit tested)
- `database/supabase/functions/delete-customer-account/index.ts` — Edge Function wrapper (JWT identifies caller)
- `customer-app/src/lib/accountDeletion.ts` — confirm phrase, error mapping, shared "removed / kept" copy
- `customer-app/src/components/DeleteAccountDialog.tsx` — typed-DELETE confirmation
- `customer-app/src/pages/DeleteAccount.tsx` — public `/delete-account` page (URL for Play Console Data safety form)
- `customer-app/src/test/{fakeAdmin,deleteAccountCore,accountDeletion}.test.ts` — 19 tests

## Changed
- `Profile.tsx` — "Delete account" link; `App.tsx` + `routeModules.ts` — new route
- `README.md` — removed a leftover git merge-conflict marker; listed the new function

## Behaviour
Refuses while a booking is confirmed/on_the_way/in_progress, or if the login is also a provider.
Cancels pending bookings. Anonymises (never deletes) bookings and reviews, because provider
earnings point at bookings and bookings.customer_id has no ON DELETE rule. Deletes notifications,
messages, attachments (rows + storage files), contact/pro-application rows, profile; auth user last.
Safe to retry if a step fails.

## Deploy
`supabase functions deploy delete-customer-account` (no migration needed).
The `messages` table and `booking-attachments` bucket aren't defined in any migration, so missing
tables are skipped, not fatal.

## Known follow-ups
- About page lists invented team members — replace before store submission.
- Deletion doesn't check unpaid completed bookings (revisit with payments).
- Provider app needs its own deletion flow if published.
- Lint debt: customer 10, provider 53, admin 44 errors (CI lint is continue-on-error).
