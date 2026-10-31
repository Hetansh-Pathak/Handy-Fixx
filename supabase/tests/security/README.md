# Security proposal tests (20261125*)

Not part of the npm workspaces. Nothing here touches the live project.

```bash
cd supabase/tests/security
npm install
npm test            # SQL on a throwaway Postgres 17 + Edge Function code against fakes
npm run typecheck   # strict tsc over the function handlers and tests
```

- `test-security.mjs`: starts a real Postgres 17 in a temp folder (embedded-postgres), loads `stub.sql` (a live-like
  copy of the tables, policies and functions the proposals touch, checked read-only on 2026-10-31), applies each
  proposal twice, tries the attacks each one must stop, and runs the dry-run files (must end in ROLLBACK, save nothing).
- `edge/*.test.ts`: Node's built-in test runner runs the real `handler.ts` files from `supabase/proposals/functions/`
  with in-memory fakes for the database, storage and mail.
