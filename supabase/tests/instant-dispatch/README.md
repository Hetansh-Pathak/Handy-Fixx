# Instant dispatch: SQL tests on a throwaway Postgres

Tests proposal `20261124000000_instant_dispatch` (NOT applied to the live project) on a real Postgres 17 that
`embedded-postgres` downloads into `node_modules`, starts in a temp folder and deletes afterwards. Nothing touches
Supabase. Not part of the npm workspaces.

```bash
cd supabase/tests/instant-dispatch
npm install        # once
npm test           # 59 checks (both proposals) + the dry-run file (runs fully, saves nothing)
```

- `stub.sql`: the parts of the live database dispatch touches (tables, LIVE trigger functions copied 2026-10-31,
  booking access rules). Update it if those live functions change.
- `test-dispatch.mjs`: the proposal applied twice (re-run safe), then every edge case: rings, skipped rings, nobody
  online, one pro in the city, low wallet, **two pros at the same instant (row lock) and five at once (exactly one
  wins)**, cancel (RPC and the old cancel button), accept after cancel / after the search ended, keep looking, one
  search per customer, outside Jamnagar, stale heartbeat, closed app (state from the booking row), privacy of the offer
  card and of pro positions, permissions, append-only audit trail, old-style bookings unchanged.
- `test-dryrun.mjs`: runs `supabase/dryrun/23_instant_dispatch_DRYRUN.sql` with a pg_cron stand-in.
