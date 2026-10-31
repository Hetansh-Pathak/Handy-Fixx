# HandyFix security report: pre-VAPT hardening (branch `hetansh2`, 2026-10-31 to 2026-11-01)

**Confidential.** Section 1 is written so it can be shown to others (an auditor, Razorpay, an investor) once the fixes are
applied. Sections 2 onward describe weaknesses that are **not yet fixed on the live system**: keep them internal until they are.

## 1. Executive summary
HandyFix runs on Supabase (Postgres with row-level security) with Android apps, an admin site and Edge Functions. Before
paying for an external penetration test (VAPT), we reviewed the repository **and** the live project's rules (read-only, no
customer data), attacked it ourselves on a throwaway copy, and wrote the fixes as reviewed SQL proposals with automated tests.

- **Review**: every table, policy, grant, function, storage bucket and Edge Function; 30 findings, ranked, each with a status.
- **Fixes written and tested**: 5 SQL proposals, 7 Edge Functions, 1 one-time data script, app changes. **Nothing is applied to
  the live project yet**: each proposal has a dry run that saves nothing and waits for the owner.
- **Sensitive identity data**: PAN is encrypted on the server (AES-256-GCM, versioned keys, never returned to the apps, every
  admin view logged); Aadhaar is no longer collected and what exists is deleted; identity photos are cleaned up after approval.
- **Tests**: 279 security checks (SQL on a real Postgres 17: 236; function code: 43), 925 shared logic tests, 220 browser checks
  with a mocked backend, all passing. Typecheck, lint (no errors) and build are clean.
- **Not yet done**: applying and deploying (owner), a paid backup plan and staging project (owner), the external VAPT, and the
  items in section 6.

## 2. What was found (ranked)
Full list with live evidence: `docs/SECURITY_FINDINGS.md`. The ones that mattered most:

| # | Severity | What | Fixed by |
|---|---|---|---|
| C1 | Critical | Every pro's phone, email, date of birth, bank account and UPI id readable by anyone holding the public app key | proposal A |
| C2 | Critical | `confirm_user_email` callable by anyone (confirm any email) | A |
| C3 | Critical | A pro could write their own email-verification code and verify an email they do not own; codes in plain text, no attempt limit | A + 2 functions |
| H1 | High | Anyone could write notifications (and phone pushes) to any user | A |
| H2 | High | The welcome-email function was an open mail relay | function |
| H3 | High | PAN in plain text; Aadhaar hash salt public; Aadhaar photos kept | B, C, 3 functions, script, apps |
| W1 | High | A booking could be created already `completed` / `confirmed` / `paid` (fake reviews, free jobs, forced jobs) | E |
| H4, H5 | High | Anyone signed in could post into any chat and review any pro | existing proposals `20261110`, `20261108` (to apply) |
| M4, M8, M9 | Medium | Signed-out access to every table; 45 trigger functions callable by anyone; bookings under another account; files attached to others' bookings | A, D |

## 3. What was fixed (and how it is checked)
| Proposal | Content | Evidence |
|---|---|---|
| A `20261125000000` | open policies closed, `confirm_user_email` locked, OTP table private + new rate / attempt functions, notifications, KYC photo freeze, search paths | 39 SQL checks |
| B `20261125000001` | PAN encryption columns, access log, blocklist, legal hold, retention job, `submit_kyc` without Aadhaar | 46 SQL checks |
| C `20261125000002` | drops plain PAN and Aadhaar columns; **refuses to run while any plain value remains** | 8 SQL checks |
| D `20261125000003` | `anon` locked out of everything except the public catalogue and two forms; trigger functions closed; booking and attachment ownership; bucket limits | 29 SQL checks |
| E `20261125000004` | bookings born pending with server-owned columns reset; secure completion codes; bill-photo path check | in the 112 attack-walkthrough checks |

Each proposal applies twice without error, in order A-B-C-D, and its dry-run file runs its own checks and rolls back. The tests
reproduce each hole first and then show it closed; they also caught five mistakes in the fixes themselves before anything went
live (a check that let half-filled PAN rows through, a re-run failure, new functions still open to everyone, an unneeded admin
exemption, a too-lenient path test).

## 4. Attack walkthrough
`docs/SECURITY_ATTACK_WALKTHROUGH.md`. Reading other users' bookings, price tampering, skipping the completion code, replaying a
payment webhook: all four are **blocked today**, except that a booking could be created in a forbidden state (W1), which E closes.
The webhook (live version and repo copy identical in the signature check) refuses forged, tampered and unsigned events,
credits a repeated or simultaneous event once, and refuses wrong amounts.

## 5. Data protection posture
| Data | Before | After (once applied) |
|---|---|---|
| PAN number | plain text, readable by the app | AES-256-GCM, key in a server secret, key version for rotation, blind index (HMAC) for duplicates, apps see the last 4 characters only; admin full view needs a reason and is logged |
| Aadhaar | number hash with a public salt + card photos | not collected; stored values and photos deleted by a script; columns dropped |
| PAN card photo, selfie | private bucket, editable after submission | private bucket, frozen after submission, kept (owner decision) |
| Identity photos after approval | kept forever | automatic cleanup of Aadhaar photos after a retention period (30 days is a **placeholder**, confirm with a lawyer), never while on legal hold |
| Bank / UPI details | plain text, readable by anyone (C1) | no longer public; still plain text in the database (open item; the payout name is matched to the KYC name for review) |
| Email codes | plain, no limits | HMAC-hashed with salt, 10-minute expiry, 5 attempts, single use, rate limits per account / email / IP |

## 6. Residual risk and open items
- **Not applied / not deployed** (owner): proposals A to E, 7 functions, 4 secrets, the migration script run. Order in `docs/SECURITY_CHANGES.md`.
- **Open findings**: chat and reviews proposals not applied (H4, H5); bank and UPI numbers in plain text (M2); booking-update
  guards to be attacked further by the auditor (M3); unused `phone_otp` columns (M5); leaked-password protection off (M6, dashboard);
  stray old functions `quick-function` and `bright-handler` (M7, dashboard); customer email-code hash unsalted (L4); no rate limit on
  the two public forms (L3).
- **Dependencies**: `zod` (high) and `react-router-dom` (moderate) need major version updates; dev tools (`vitest`, `vite`,
  `@expo/cli`) have findings that do not ship to users.
- **Infrastructure** (owner): the Supabase **Free plan has no backups**; no separate staging project; Maps key restriction;
  rotating any key ever pasted into a chat or ticket.
- **Business-logic abuse** (accepted, watch after launch): a pro colluding with a friend as customer to run fake jobs.
- **Tool limits**: function tests ran on Node's crypto, not Deno itself; SQL tests used a copy of the live rules, not the live
  database; the mobile bundle and logs were not inspected; no load testing.

## 7. Roadmap
| Phase | Status |
|---|---|
| 0-1 Decide and review | done |
| 2 Fix known holes (proposals) | written and tested; **apply: owner** |
| 3 Protect the data (encryption done; staging, paid plan, key hygiene, mobile bundle checks) | partly done; rest owner |
| 4 Finish features, apply in order, final checks, freeze and tag | checks done; tag `v1.0-vapt` created locally; **apply and push: owner** |
| 5 Own pre-test (`npm audit`, secret scan, attack walkthrough, fixes) | done |
| 6 VAPT (auditor, scope, environment, retest clause) | request pack ready: `docs/VAPT_SCOPE.md`; **owner picks the auditor** |
| 7 Fix findings and retest | after the VAPT |
| 8 Keep it going | plans ready: `docs/MONITORING_PLAN.md`, `docs/BREACH_RESPONSE.md`; owner fills names and sets alerts |

## 8. Document map
`SECURITY_FINDINGS.md` (the list) · `SECURITY_CHANGES.md` (what changed, how to apply, secrets, test numbers) ·
`SECURITY_ATTACK_WALKTHROUGH.md` (the attacks) · `VAPT_SCOPE.md` (for the auditor) · `MONITORING_PLAN.md` ·
`BREACH_RESPONSE.md` · `supabase/APPLY_PLAN.md` (order) · `supabase/tests/security/README.md` (how to rerun the tests).
