# Functional and Logical Change Register

**Project:** HandyFix  
**Scope:** Customer, Provider, Admin, and Supabase/database functionality  
**Last updated:** 26 October 2026

This register records functional and business-logic changes known from the
session history. It is maintained separately from visual-only changes. Entries
describe prior behavior, changed behavior, affected areas, and validation or
deployment status. The register is based on available session records and
repository history; it should not be treated as a complete audit of changes
made before that history was available.

## Historical changes

### App startup and Admin booking reads

- **App startup support**
  - **Before:** Starting each of the three Vite applications required knowing
    each app's working directory and command.
  - **Change:** Added workspace run tasks in `.vscode/tasks.json` for Customer,
    Provider, and Admin.
  - **Validation:** App build and local route checks were recorded as passing.
- **Admin bookings query**
  - **Before:** The Admin bookings query used a Customer profile relationship
    that Supabase did not recognize, so bookings failed to load with a
    relationship/`UNKNOWN` error.
  - **Change:** Removed the invalid relationship join in
    `admin-app/src/pages/admin/Bookings.tsx`. Updated error formatting in
    `admin-app/src/lib/utils.ts` to extract messages from Supabase's plain
    object errors.
  - **Outcome:** The query could return bookings without relying on the invalid
    relationship, and failures could be shown with a useful message.
  - **Validation:** The corrected request returned HTTP 200 and the Admin
    build passed.

### Customer reviews, bookings, and display data

- **Review submission and ownership**
  - **Before:** Customer review inserts failed when the authenticated
    `user_id` required by the live insert policy was omitted or the flow relied
    on incomplete booking information.
  - **Change:** Updated the Customer review paths in
    `customer-app/src/pages/MyBookings.tsx` and
    `customer-app/src/pages/BookingConfirmation.tsx` to use authenticated
    identity, validate the relevant booking/provider fields, and handle
    submission errors and completion state.
  - **Related logic:** Review flows account for completed bookings and existing
    reviews to reduce invalid submissions and uniqueness conflicts.
  - **Validation:** Customer tests, type checks, and builds passed in the
    recorded runs. Live authenticated review submission was not established by
    those checks.
- **Booking cards and truthful empty states**
  - **Before:** Customer booking display could infer bookings from
    notifications or fill missing values with guessed provider, service, or
    status text.
  - **Change:** Booking views use booking query results as the source of
    operational records; notification activity is not converted into invented
    booking cards. Missing data is not replaced with guessed operational
    details.
- **Static sample display data**
  - **Before:** Several Customer surfaces used hardcoded sample services,
    prices, booking counts, or reviews as fallbacks.
  - **Change:** Removed fabricated fallback display data from relevant
    Customer components/pages, including the removed
    `customer-app/src/components/MostBooked.tsx` and
    `customer-app/src/components/PromoCards.tsx`.
  - **Scope:** No database records were deleted. Legitimate product copy,
    actual database data, database seeds, and migrations remain distinct from
    UI mock records.

### Provider bookings, earnings, and online availability

- **Provider share calculation**
  - **Before:** Provider Dashboard totals used the customer-facing
    `total_amount`, which could show the full customer charge as Provider
    earnings.
  - **Change:** `provider-app/src/pages/provider/Dashboard.tsx` uses
    `provider_amount` for Provider earnings, with a platform-fee calculation
    where needed. Relevant amounts use Indian currency presentation.
  - **Outcome:** Customer totals and Provider earnings are treated as distinct
    business values.
- **Provider availability**
  - **Before:** Setting the Provider online could be silently rejected by a
    database trigger, leaving an eligible Provider offline without actionable
    feedback.
  - **Change:** Provider UI state updates are guarded during requests, and
    errors/success are surfaced. `provider-app/src/contexts/ProviderContext.tsx`
    calls an authenticated `set_provider_online` RPC.
  - **Database support:** Migration
    `database/migrations/provider/20261025000000_online_status_eligibility.sql`
    checks Provider eligibility and updates only that Provider's online state
    through the RPC. Its generated type is declared in
    `provider-app/src/integrations/supabase/types.ts`.
  - **Deployment condition:** The migration must be applied to the target
    Supabase project before the local RPC-based client can work there. The
    session record did not confirm application to the user's live project.
  - **Follow-up repair:** On 26 October 2026, added
    `database/migrations/provider/20261026000000_provider_online_status_repair.sql`
    to reinstall the eligibility trigger and authenticated RPC idempotently and
    notify PostgREST to reload its schema cache. The Provider context now reads
    only the eligibility fields it needs, avoids updating state for a different
    account if the session changes during the request, and gives an actionable
    message when Supabase reports that the RPC is missing from its API schema.
    Eligibility is required only for going online; an already-online Provider
    can always request to go offline, and the control remains visible while
    online even if eligibility changes.
    This migration has not been applied to the live Supabase project, so live
    availability remains unverified until deployment and an authenticated
    Provider test.
- **Profile refresh**
  - **Before:** A same-user Provider data refresh could set a global loading
    state and block the active panel.
  - **Change:** Provider context avoids showing a blocking initial-load state
    for same-user background refreshes.
- **Provider earnings icon**
  - Replaced DollarSign icons with Indian-rupee icons in
    `provider-app/src/components/provider/ProviderLayout.tsx`,
    `provider-app/src/pages/provider/Earnings.tsx`, and
    `provider-app/src/pages/provider/Notifications.tsx`.

### Authentication, notifications, and activity state

- **Customer auth/profile behavior**
  - Customer auth flows were updated to retain profile-setup handling while
    reducing unnecessary waits and duplicate reads where established by the
    relevant implementation work. Customer auth screens and shared app
    context remain responsible for the authenticated user and profile state.
- **Notification counts and actions**
  - Customer and Provider header notification actions use fetched unread
    counts, not sample badges. The visible badge is capped at `9+`, while the
    accessible label communicates the exact count.
  - Selecting a booking/activity destination marks its current unseen activity
    as seen rather than treating all historical bookings as new.
- **Provider dashboard counters**
  - Independent unread-notification and pending-booking counts were
    parallelized to avoid serial network waits.
- **Route and component state**
  - Customer route changes reset scroll position to the top.
  - Provider same-user background refreshes avoid unnecessary full-page
    loading; role-specific account data remains sourced from the current user
    and database.

### Customer data loading and error handling

- **Shared active services query**
  - **Before:** Customer home and Services page could independently fetch the
    same active service data, and the page request did not consistently surface
    query errors.
  - **Change:** Added `customer-app/src/hooks/useActiveServices.ts` to share a
    React Query cache and `customer-app/src/lib/requestTimeout.ts` to apply a
    bounded request signal. `ServicesGrid.tsx` and `Services.tsx` now share
    the query and present loading/error/retry states.
- **Bounded Customer reads**
  - Selected homepage, profile, booking-count, and notification-count reads
    were bounded to avoid indefinite foreground loading. The homepage
    statistics review read was capped at 100 recent rows rather than 1,000.
  - Foreground React Query retries were disabled for the affected Customer
    query configuration; failed reads offer user-controlled retry where the UI
    supports it.
- **Error behavior**
  - Errors are logged or surfaced rather than converted silently into
    success-shaped empty counts or content.
- **Validation and limit**
  - Customer type-check and tests passed after the timeout/cache changes. A
    live Supabase request from the environment exceeded approximately three
    seconds. Local UI bounds do not guarantee backend or network response time.

### Functional state and persistence

- **Provider online state** is intended to remain set across page reloads;
  explicitly switching offline or signing out ends that state. Availability
  still depends on the database migration and authorization checks described
  above.
- **Provider drafts and sensitive data:** Unsaved non-sensitive profile form
  data was considered for draft preservation. Sensitive identity, banking,
  authentication, OTP, and file-content values must not be casually cached in
  browser storage. KYC progress is persisted through the existing server-side
  onboarding flow; settings and schedule edits are database-backed.
- **Provider form and tab behavior:** Account refresh and navigation work was
  intended to preserve panel context and avoid losing draft state on ordinary
  client-side route changes. Any actual reload persistence must be explicitly
  distinguished from cross-route state preservation.

## Security change log

Security findings and code changes from the current OWASP Top 10:2025 review
will be recorded here after the review and implementation are complete. Do not
mark a control as implemented solely because it is listed in
`Functional and Logical Rules.md`.

| Date | OWASP category | Finding / behavior before | Functional or logical change | Files / database objects | Validation / deployment |
|---|---|---|---|---|---|
| 2026-10-26 | OWASP Top 10:2025 review | The delegated read-only review reported no confirmed vulnerabilities in the reviewed code. | No code remediation was indicated by the review; no security behavior was changed on the basis of an unverified concern. | Reviewed repository code/configuration; no specific finding identified. | Review complete; this does not confirm live Supabase policies, deployed Edge Functions, production configuration, or runtime behavior. |

## Latest functional fix: Provider Online mode

| Date | Previous behavior | Change and reason | Affected code | Validation / remaining step |
|---|---|---|---|---|
| 2026-10-26 | Online mode depended on `set_provider_online`, which may be missing from the deployed database or PostgREST schema cache. The older eligibility trigger could silently reset the request to offline. The UI also required approved/active status for both going online and offline. | Added an idempotent repair migration that installs the guarded RPC/trigger and refreshes PostgREST's schema cache. The client now reports missing RPC deployment explicitly, fetches only required status fields, guards state updates against account changes during an in-flight request, and applies eligibility checks only when going online. An already-online Provider can always request offline, and the switch remains visible while online if eligibility changes. | `provider-app/src/contexts/ProviderContext.tsx`; `provider-app/src/components/provider/ProviderLayout.tsx`; `database/migrations/provider/20261026000000_provider_online_status_repair.sql` | Provider TypeScript check passed, production build passed, and existing test passed (1/1). The migration still must be applied to the target Supabase project, then online/offline behavior verified with an authenticated Provider. |

## Latest functional fix: Provider panel startup route

| Date | Previous behavior | Change and reason | Affected code | Validation |
|---|---|---|---|---|
| 2026-10-26 | `ProviderRoute` redirected every signed-in Provider whose KYC status was `not_submitted` or `rejected` to `/provider-panel/onboarding`, including when they opened or reloaded the panel at its dashboard URL. | Removed the automatic route redirect. New sign-ups still go directly to onboarding; returning providers now remain on their requested panel route. Existing locked-page states and their explicit onboarding actions continue enforcing KYC workflow requirements without hijacking panel startup. | `provider-app/src/components/provider/ProviderRoute.tsx`; `provider-app/src/pages/provider/ProviderLogin.tsx` | Provider TypeScript check, production build, existing test (1/1), and `git diff --check` passed. Authenticated browser reload was not tested because the shared Provider browser was on the login page. |

## Latest functional change: Provider verification popup

| Date | Previous behavior | Change and reason | Affected code | Validation |
|---|---|---|---|---|
| 2026-10-26 | KYC verification was a standalone child route at `/provider-panel/onboarding`; signup and KYC links navigated to that distinct URL. | Converted the route into a redirect to `/provider-panel` that opens the existing KYC wizard in a scrollable, accessible dialog. The browser address returns to the panel URL, while legacy/direct onboarding links still open the dialog. Signup and explicit KYC actions retain access to the wizard, and closing it returns the user to the panel. | `provider-app/src/App.tsx`; `provider-app/src/components/provider/ProviderLayout.tsx`; `provider-app/src/pages/provider/KycOnboarding.tsx` | Provider TypeScript check, production build, existing test (1/1), and `git diff --check` passed. Authenticated popup behavior was not browser-tested because no signed-in Provider session was available in the shared page. |

## Validation convention

For each new entry, record the smallest relevant test/build/type-check and
state whether it validates local code only or also a deployed Supabase
policy/RPC. Local builds cannot prove remote database access-control policy,
function deployment, or live browser authentication.
