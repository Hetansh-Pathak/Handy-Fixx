# Functional and Logical Rules

**Project:** HandyFix Customer, Provider, and Admin applications  
**Scope:** Business behavior, data integrity, authorization, and operational
error handling  
**Security reference:** [OWASP Top 10:2025](https://top10.owasp.org/2025/)

These rules define expected application behavior. They complement
`UI_DESIGN_RULES.md` and `HEADER_FOOTER_RULES.md`; they do not replace
database-side authorization, operational security review, or tests. The change
history is in `Functional_Changes.md`.

## 1. Data ownership and correctness

- Treat the database response as the source of truth for bookings, services,
  reviews, Provider eligibility, earnings, notification counts, and account
  status.
- Never manufacture operational records, names, prices, counts, statuses,
  reviews, or financial totals to make a failed or empty query look successful.
- Keep customer charges, Provider earnings, and platform fees as separate
  values. Compute each from authoritative booking fields and document any
  fallback formula.
- Use the authenticated user identity for ownership fields and authorization
  checks. Do not trust a client-supplied owner ID as proof of ownership.
- Validate relationships from the fetched record before a state-changing
  operation. For example, a review requires an eligible completed booking,
  authenticated customer ownership, an assigned Provider, and no prior review.
- Do not delete or rewrite production database records as part of UI cleanup.
  Removing sample display data is not permission to alter live records.
- Select only fields required by the operation; bound foreground reads, share
  safe query caches, and provide explicit loading/error/retry states.
- An error must remain distinguishable from a valid empty result. Do not
  replace failed reads with zero counts or empty success state without logging
  and an explicit UI policy.

## 2. Authorization and role boundaries

- Customer, Provider, and Admin routes must enforce the correct signed-in
  identity and role. Hiding a control or route in React is not authorization.
- Enforce ownership and role restrictions at the Supabase database/RPC/RLS
  boundary for every read and mutation involving private or privileged data.
- Admin mutations require an authorized Admin role on the server/database,
  even if the Admin UI already restricts access.
- Provider availability, KYC decisions, booking transitions, and financial
  values must be validated against current server-side records and permitted
  state transitions.
- For `SECURITY DEFINER` database functions, set a safe fixed `search_path`,
  schema-qualify referenced objects where appropriate, restrict `EXECUTE`
  grants, verify the caller identity and role, and update only authorized rows.
- Never rely on a caller-provided profile/provider/customer ID where the
  database can derive the actor from `auth.uid()`.
- New migrations that alter authorization, triggers, role checks, or RPCs
  must be reviewed for existing policy compatibility and documented as
  deployment prerequisites. Do not claim a live fix until the migration is
  applied and verified in the target project.

## 3. Input validation and state transitions

- Validate all input at the boundary, including client forms and database
  functions. Apply type, range, length, format, ownership, and allowed-state
  checks appropriate to the field.
- Use parameterized Supabase query builders/RPC arguments. Never concatenate
  untrusted values into SQL, filters, HTML, URLs, shell commands, or dynamic
  code.
- Treat workflow changes as explicit state transitions. Reject unsupported
  transitions rather than silently coercing the request into another state.
- A Provider may be set online only when current server-side verification and
  account eligibility rules pass. Fail with a clear, non-sensitive error if
  not.
- A Provider must be able to switch offline regardless of current verification
  or account status. Keep an offline action available if the Provider is
  currently online, even after eligibility changes.
- Returning Providers should reopen the panel at the route they requested.
  KYC-incomplete/rejected accounts must see the existing route-specific locked
  state and an explicit onboarding action; only signup or a deliberate
  onboarding navigation should send them directly to the onboarding wizard.
- Provider KYC onboarding is presented as an in-panel dialog, not a standalone
  page. Legacy/direct requests to `/provider-panel/onboarding` must redirect to
  the Provider panel and open the dialog; the final browser URL must remain on
  the panel route. Signup and explicit KYC actions must continue to open the
  wizard, and users must be able to close it without losing the current panel
  route.
- Online availability must be changed through the authenticated database RPC,
  never by bypassing eligibility with a direct client-side table update. If
  the RPC is unavailable in the PostgREST schema, show the required migration
  as an actionable setup issue; do not present the request as successful.
- A review can be created only once per eligible booking; rely on database
  uniqueness as well as client-side checks to handle concurrent submissions.
- Disable duplicate submission while a mutation is pending, but keep the
  database constraint/policy authoritative.
- Financial calculations use integer minor units or a clearly defined decimal
  representation; do not calculate money from display-formatted strings.
- Preserve idempotency for retries where an operation may be repeated because
  of network timeouts or browser refreshes.

## 4. Authentication, sessions, and sensitive information

- Use Supabase Auth for identity. Do not implement custom credential storage,
  expose service-role credentials to the browser, or bypass the configured
  authentication flow.
- Store only public/anon client configuration in browser builds. Secrets,
  privileged keys, signing keys, and service-role credentials belong only in
  trusted server/Edge Function secrets.
- Never store passwords, OTPs, raw Aadhaar/PAN/bank details, KYC documents,
  access tokens copied from the session, or file contents in `localStorage`,
  `sessionStorage`, logs, analytics, or URL parameters.
- Persist only the minimum non-sensitive draft data necessary for user
  experience; scope it to the signed-in user, expire it, and clear it on
  account change/sign-out where appropriate.
- Sensitive verification data should be minimized, protected by database
  access rules, and handled only by the required verified workflow. Store
  hashes or masked identifiers only where the existing security design
  explicitly requires them.
- Sign-out and account switching must clear user-scoped in-memory and cached
  data so one account cannot see another account's data.
- Authentication and role checks must fail closed: unknown role, missing
  session, or failed authorization is not equivalent to permission granted.

## 5. Error, logging, and exceptional conditions

- Handle network failures, expired sessions, rejected requests, missing
  records, duplicate writes, timeouts, and malformed responses explicitly.
- Show users an actionable but non-sensitive message; do not expose SQL,
  stack traces, tokens, policy internals, secrets, or personal data.
- Log enough structured context to diagnose failures without recording
  credentials, OTPs, access tokens, full identity documents, or unnecessary
  personal information.
- Avoid broad `catch` blocks that silently swallow errors or return fabricated
  success values. Catch only expected failure modes, surface unexpected ones,
  and preserve useful diagnostic context.
- A timeout or cancelled request must not be reported as successful. Ensure
  stale requests cannot overwrite state for a newly signed-in user or a newer
  request.
- Distinguish empty data from failed retrieval. Retry only when appropriate;
  expose deliberate user-triggered retry for bounded foreground reads.
- For mutations, restore pending UI state in a `finally` path and display
  success only after the authoritative operation succeeds.

## 6. Privacy, uploads, and database access

- Apply least privilege: users can read and modify only records their role and
  ownership permit; public provider discovery should expose only approved
  public fields.
- RLS policies must be enabled for user-sensitive tables and tested for both
  allowed and denied actors. Client filters are usability constraints, not
  security controls.
- Keep private KYC/bank uploads in private storage buckets with restrictive
  policies and short-lived signed access where needed. Do not expose private
  object paths as public URLs.
- Validate uploaded file size, type/content, ownership, and allowed purpose.
  Do not trust browser-provided MIME type or filename alone.
- Keep database migrations forward-only and minimally scoped. Never apply
  destructive production changes without explicit authorization and a
  reviewed rollback/recovery plan.

## 7. OWASP Top 10:2025 controls

Apply the following requirements when adding or changing functionality:

1. **A01 Broken Access Control**
   - Enforce role, ownership, and object-level authorization in RLS/RPC/server
     logic. Test denied cross-user and cross-role access.
2. **A02 Security Misconfiguration**
   - Keep production configuration explicit and fail safely when required
     environment settings are missing. Restrict CORS, storage, database grants,
     debug output, and deployment permissions to the actual need.
3. **A03 Software Supply Chain Failures**
   - Review dependency changes, use lockfiles and reproducible installs, remove
     unused packages, and run appropriate dependency vulnerability checks
     before release.
4. **A04 Cryptographic Failures**
   - Use TLS for network traffic and approved cryptographic services for
     secrets and sensitive identifiers. Do not invent custom cryptography or
     expose sensitive data in storage/logs.
5. **A05 Injection**
   - Use typed/parameterized database operations, validate input, and render
     untrusted values as text. Do not create unsafe SQL or HTML from user input.
6. **A06 Insecure Design**
   - Define abuse cases and invariants for booking, review, KYC, availability,
     payments/earnings, and admin actions. Apply server-side limits and
     authorization rather than relying on the UI.
7. **A07 Authentication Failures**
   - Use established auth flows, fail closed, protect sessions, throttle
     sensitive verification attempts, and avoid leaking account existence or
     OTP details.
8. **A08 Software or Data Integrity Failures**
   - Verify authorization and integrity for uploads, workflow transitions,
     migrations, and external callbacks. Do not trust client-calculated
     financial or approval state.
9. **A09 Security Logging and Alerting Failures**
   - Record security-relevant access denials, role-sensitive changes, and
     repeated verification failures with privacy-safe structured events.
     Establish alerting/retention in the deployed service; frontend console
     logs alone are not an audit system.
10. **A10 Mishandling of Exceptional Conditions**
    - Make failures explicit, bounded, and safe. Avoid fail-open behavior,
      inconsistent partial writes, stale state, or success-shaped defaults.

## 8. Functional change and security maintenance process

For every behavior or security change:

1. Read this rules file and the relevant UI/design rules before changing a
   user-facing workflow.
2. Identify the authoritative database fields, actor/role, permitted states,
   failure modes, and whether a migration or Edge Function deployment is
   required.
3. Implement the smallest complete fix at both client and trusted
   authorization/data boundaries as applicable.
4. Add or update tests for the intended result, denial cases, duplicate
   requests, and error paths.
5. Run the narrowest useful type-check, tests, and production build; report
   remote Supabase deployment checks separately from local validation.
6. Append the behavior change, affected files/database objects, rationale, and
   validation/deployment status to `Functional_Changes.md`.
7. Do not mark an OWASP control as complete based only on UI changes or a
   successful build. Record the evidence and remaining deployment work.

## 9. Review checklist

- [ ] Is the current user and role derived from trusted authentication?
- [ ] Does the database enforce ownership and role access independently of
  client UI?
- [ ] Are user inputs validated and query arguments parameterized?
- [ ] Are financial values and workflow state derived from authoritative data?
- [ ] Are duplicate and concurrent operations safely handled?
- [ ] Are private data, tokens, verification codes, and documents absent from
  browser storage and logs?
- [ ] Are errors explicit, bounded, non-sensitive, and not mistaken for
  success?
- [ ] Are new dependencies, migrations, grants, and storage policies reviewed?
- [ ] Have allowed and denied behavior been tested?
- [ ] Is the completed functional/security change logged in
  `Functional_Changes.md`?
