# Phase 19: availability + Aadhaar hashing fixes

Not built or run here (npm was blocked, no Postgres): edited files pass a TypeScript syntax
parse and the new SQL was checked structurally (balanced blocks/parens), nothing more.
Run `npm run build` in the provider app and test on STAGING before production.

## 1. provider_availability had no database-level time check
The provider app's own `validateRange()` stops an end time before/equal to a start time,
but nothing enforced this server-side — a direct API call could insert a backwards or
zero-length range. `20261014000000_availability_and_kyc_hardening.sql` adds
`CHECK (end_time > start_time)`. It also logs (via `RAISE NOTICE`, doesn't change data) any
existing row that already violates this, since adding a CHECK does not retroactively touch
existing rows.

## 2. Aadhaar hash used one hardcoded salt shared by every provider
`provider_kyc.aadhaar_hash` was computed in the browser with a single salt
(`'handyfix-kyc-2026-salt'`) baked into `provider-app/src/lib/constants.ts` — visible to
anyone who reads the app's JS. Aadhaar numbers are a small, checksum-constrained 12-digit
space, so a public fixed salt gives almost no real protection: anyone who ever got read
access to that column (a compromised admin account, a backup leak, a future RLS bug) could
brute-force every hash back to a real Aadhaar number quickly. A per-row random salt isn't a
fix either, because `aadhaar_hash` is `UNIQUE` and used to catch the same person
registering as two different providers — that needs a deterministic hash, which is
incompatible with a random per-row salt by definition.

**Fix:** hashing now happens server-side, in a new `submit_aadhaar_kyc(p_aadhaar)` RPC,
using HMAC-SHA256 keyed by a secret Postgres setting that is never shipped to any client.
- `provider-app/src/lib/constants.ts`: removed `hashAadhaar()` entirely.
- `provider-app/src/pages/provider/KycOnboarding.tsx`: the autosave no longer computes or
  sends a hash. It now calls `submit_aadhaar_kyc` when a valid new Aadhaar number was typed,
  and surfaces the RPC's real error (invalid format, duplicate Aadhaar, not configured, etc.)
  instead of a generic message. The existing-KYC-row fetch no longer selects `aadhaar_hash`
  at all — there's no remaining reason for that value to be in browser memory.
- Existing `aadhaar_hash` values (all computed with the old shared salt) are cleared by the
  migration, since they offer no real protection to keep. This does **not** touch
  `kyc_status`, reviewed state, or any document — an affected provider's account is otherwise
  unaffected, but they'll need to re-enter their Aadhaar number once for duplicate detection
  to cover them again.

### Required manual step — without this, Aadhaar submission will fail closed
Run once, from the Supabase SQL editor (never from app code), before relying on this:
```sql
ALTER DATABASE postgres SET app.aadhaar_hmac_key = '<a long random string>';
```
Generate one with `openssl rand -base64 48` (or equivalent) and keep a copy somewhere safe —
losing it breaks duplicate-Aadhaar detection going forward (a changed key means the same
Aadhaar number hashes differently than it used to), though it does not expose or corrupt any
stored data. Reconnect / start a new session afterward so `current_setting` picks it up.
Until this is set, `submit_aadhaar_kyc` returns `{ ok: false, reason: 'not_configured' }` and
the UI shows "Aadhaar verification is temporarily unavailable" — it fails closed, not silently.

## Not covered
This phase only covers the two items above. See `PHASE18-CHANGES.md` for everything fixed
before this, and its own "Not verified" section for what was sampled rather than audited.
