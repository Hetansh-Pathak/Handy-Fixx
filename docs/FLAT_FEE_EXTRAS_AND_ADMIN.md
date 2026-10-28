# Flat-fee model: what was added on top of slices 1-5a

Source: HandyFix-complete.pdf (October 2026). Rules live in `CLAUDE.md`; this note records the work that
fills the gaps the roadmap still listed as QUEUED (slice 5b: extra work and disputes; admin: price bands, disputes, fee records).

## Database (proposal, NOT applied)

`supabase/proposals/20261107000000_extra_work_and_disputes_PROPOSAL_NOT_APPLIED.sql`

Apply order: `20261101000000_pdf_pricing_model` → `20261102000000_booking_status_arrived` (only if the status is an enum) → `20261102000001_provider_wallet_fee` → **this file**. It does not repeat anything from the others.

| Part | Rule |
|---|---|
| Extra work | Pro adds an item (`add_booking_extra`, parts need a bill photo). Customer taps Approve (`decide_booking_extra`). Only approved items change `total_amount`. Max 5 pending. Completion is refused while one is pending. |
| Fee base | `settle_booking_fee()` now charges on the bill **minus parts** (`parts_amount`), e.g. a ₹649 bill with ₹200 parts is charged on ₹449 → ₹15. |
| Disputes | `booking_disputes`: 24 h window, 48 h for `poor_work`; pro reply; timeline auto-attached; admin outcome (dismissed / redo / partial_refund / provider_penalty); one appeal; `safety` suspends the pro at once; audit-logged. `partial_refund` returns the fee once (an `adjustment` ledger row, `booking_fees.refunded`). |
| Customer's view of the pro | `get_booking_provider()` (customers cannot read `service_providers`); phone only after confirmation. |
| Admin | `admin_set_price_band`, `admin_list_booking_disputes`, `admin_fee_overview`, `admin_decide_dispute`. |

Tested on PostgreSQL 16 against a stub schema, together with the wallet ledger and the two other proposals: locked price, extras, completion block, money-column guard, fee excluding parts, dispute → reply → decision → fee returned → appeal, safety rule, band validation, re-run idempotency. **Not tested on the live project**, so dry run it (`ROLLBACK;` on the last line) first.

## Admin app (`apps/admin`)

* **Price bands** (`/pricing`): min / catalogue / max per service and sub-service (needs the pricing proposal for the columns, and this file for `admin_set_price_band`).
* **Fees & disputes** (`/disputes`): fee totals (charged, waived, returned), open disputes with the timeline, four outcomes, appeals, fee records.

Both pages show an error toast until the proposals are applied. They never break the rest of the admin.

## Mobile screens still to build (next slice)

Use `docs/reference-ui-flat-fee/` as the spec: extra-work panel (pro) and Approve card (customer), report a problem + appeal (customer), reply/appeal (pro), "arrived" step once that status exists.

## Later phases (from the PDF, unchanged order)

1. Customer late-cancel limit (3 in 30 days → instant booking paused a week); admin watch-list (pending over 15 min; code not shared 2 h after start).
2. Number blocking in chat and masked calls.
3. Ranking: rating → distance → response speed; flag high acceptance + low completion.
4. After about 40 pros: Featured boost (₹49–99/week) and Pro subscription (₹199–299/month).
5. After in-app payments (Razorpay): urgent add-on, real refunds and cancellation fees, maintenance plans.
6. After 500+ bookings: society tie-ups and ads; then new categories.

## Open decisions (PDF p.17)

1. Customers pay inside the app during the pilot? Assumed no (direct to the pro).
2. Fee-free first 3 months or 10 jobs? Assumed yes.
3. Cheaper "Book again" with the same pro? Not built (marked TO CONFIRM).
4. Who keeps the urgent add-on? Not built until payments are in the app.
