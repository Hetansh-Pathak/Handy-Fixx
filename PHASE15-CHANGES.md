# Phase 15 - Review of phase 14 + security headers + legal pages

Verified here with real tools: npm ci, build (all 3 apps), tsc, vitest (customer 53, provider 12), npm audit, eslint.
NOT verified: nothing was run against a real Supabase, and no browser check of the new Legal page or the CSP.

## Added
- customer-app: /privacy and /terms (src/pages/Legal.tsx), footer links fixed (they were "#"), "Delete account" link in footer.
  The text is a DRAFT template. Fill LEGAL.* at the top of Legal.tsx and have a lawyer review it.
- All 3 vercel.json: Content-Security-Policy (script-src 'self', no inline scripts), HSTS, COOP, frame-ancestors none.
- Permissions-Policy fix: customer app had microphone=() which blocks the voice-note recorder on the web build. Now (self).
- react-router-dom 6.30.1 -> 6.30.6 in all 3 apps (moderate advisory).

## Test the CSP on staging first
Open each app with DevTools console open and run: login, booking with photo + voice note, map screen, address lookup.
Any "Refused to ..." line means a host is missing from the CSP in vercel.json.
