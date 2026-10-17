# Phase 15b - Provider screens

Verified with real tools: provider-app tsc clean, build OK, 25 vitest tests (12 -> 25), eslint clean on every new/rewritten file.
Seen in a real browser at 390px: forgot-password screen, provider login. NOT seen: Schedule, Settings, Notifications, Reviews, reset-password (they need a logged-in provider + Supabase).
NOT run: the SQL migration (no Postgres here) and anything against a real Supabase.

## Correction to my last message
Provider Bookings, Earnings and Dashboard were ALREADY rebuilt in phases 11-12. Still old before this round:
Notifications, Reviews, Schedule, Settings, Profile, Login, KYC.

## Rebuilt
- Notifications ("Alerts"): filter pills, Today/Yesterday/Earlier groups, tone icons, one clear action per row, optimistic read with rollback, real error state, skeletons.
- Reviews: black summary card (average + animated bars computed from the loaded reviews), filter pills, sort, shortened customer names ("Priya S.").
- Schedule: day strip with gold dots, today's jobs card, time ranges with validation (end after start, >= 1 h, no overlap), presets, Add hours finds the next free window, copy to Mon-Fri / all days.
- Settings: grouped cards, preference toggles roll back on failure, working change-password, log-out confirm, deactivate via RPC.

## Real bugs fixed
1. Reviews: the customer name came from a profiles join. Phase 14 made profiles owner-only, so every review would show "Anonymous Customer". Now uses reviews.reviewer_name.
2. customer-app ReviewDialog stored the customer's EMAIL as reviewer_name when no name was set (visible to providers and on the public Testimonials). Now stores "Customer".
3. Schedule used toISOString() for "today" (wrong day before 5:30 AM IST), looked only at scheduled_date and missed on_the_way jobs. Now local date, both date columns, all live statuses.
4. Schedule "copy to weekdays" deleted first, then inserted row by row, ignoring errors (a failure wiped days). Now inserts first, deletes after.
5. Settings "Deactivate account" has been silently failing since phase 13/14 (status is trigger-protected); it still said "deactivated" and signed out. Now calls deactivate_my_provider_account(), which refuses while pending/confirmed/active bookings exist.
6. The provider app had NO reset-password route: Settings "Change password" emailed a link to a 404, and Login had no "Forgot password?" at all. Added /forgot-password and /reset-password (same response whether or not the email exists; 8+ chars with a letter and a number; expired-link screen).
7. Login: gold buttons had white text (about 1.8:1 contrast). Now dark text. Added autocomplete attributes, label associations, show/hide-password label.

## You must do
- Apply database/migrations/20261010000000_provider_self_service.sql on staging, then production.
- Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs: add <provider-app-url>/reset-password.

## Still old / not done
- Provider Profile (587 lines, bank details; 8 `any`), KYC onboarding (1,057 lines), Login/Sign-up full restyle, Terms page.
- Provider account DELETION (Play Store requires it if you publish the provider app).
- Remaining lint debt in the provider app (Profile, KYC, a few others).
