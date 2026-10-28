# Reference UI: flat-fee web screens (spec only, not built)

These are the finished **web** versions of the PDF's new screens, written before the move to Expo. They are
**not** part of any workspace, are not compiled, and `legacy/` stays read-only. Use them as a visual and
behavioural spec when building the same screens in `apps/mobile`, as the roadmap's slice 5b says
("extra work with customer approval" and "disputes").

| File | What it shows | Backend it calls (all in `supabase/proposals/20261107000000_extra_work_and_disputes_*`) |
|---|---|---|
| `customer/BillCard.tsx` | Locked price, approved extras, one-tap Approve/Decline with bill photo | `booking_extras`, `decide_booking_extra` |
| `customer/ReportProblem.tsx` | Report a problem (24 h / 48 h), reply shown, one appeal | `raise_booking_dispute`, `appeal_booking_dispute`, `booking_disputes` |
| `customer/NextBestPros.tsx` | Next best pros after a decline | The mobile app already does this client-side (`fetchAlternatives`, `rebookWithProvider`) |
| `customer/BookingConfirmation.tsx` | Full status screen: on the way / arrived / in progress / done | `get_booking_provider` |
| `customer/pricing.ts` | Band and price helpers, provider view hook | `get_booking_provider` |
| `provider/ExtraWorkPanel.tsx` | Add extra work (parts need a bill photo), bill totals | `add_booking_extra`, `withdraw_booking_extra`, bucket `booking-extras` |
| `provider/RequestActions.tsx` | Earning + fee before Accept, "Top up to accept" | `get_booking_fee_preview` is NOT in the proposals; use `checkCanAccept` from `@handyfix/shared` instead |
| `provider/CompletedJobSummary.tsx` | Final bill, fee record, reply to / appeal a dispute | `booking_fees`, `reply_booking_dispute`, `appeal_booking_dispute` |
| `provider/Rates.tsx` | Rate slider inside the admin band | Uses `provider_rates`; the mobile app uses `provider_services.custom_price` (guarded by the band trigger) instead |
| `provider/Wallet.tsx` | Wallet hero, launch banner, slab chart, fee records, top-up | `get_wallet_summary`, `booking_fees` |

Differences from the mobile decisions in `CLAUDE.md` (follow CLAUDE.md, not these files): there is **no 30 s accept
countdown**, booking times use the **clock picker**, and the rate lives in `provider_services.custom_price`.
