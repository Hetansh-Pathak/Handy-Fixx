# If something goes wrong: breach response plan (draft)

A short plan you can follow under stress. The legal timings below are the rules I know of; **have a lawyer confirm them and
the current state of the DPDP Act rules before launch**, and fill in the names and numbers in square brackets.

## People
| Role | Name | Phone |
|---|---|---|
| Incident lead (decides, talks to everyone) | [owner] | [ ] |
| Technical lead (investigates, fixes) | [ ] | [ ] |
| Lawyer | [ ] | [ ] |
| Support contact for customers and pros | [support email] | [ ] |

## First hour: contain
1. Write down the time you learnt of it, who told you, and what they saw. Keep screenshots. Do not delete anything.
2. **Stop the bleeding**, in this order, whichever applies:
   - Leaked key or secret: rotate it now (Supabase service-role key, `KYC_PAN_KEY` is different: see below, Razorpay keys and webhook
     secret, Brevo key, Expo token, GitHub tokens) and redeploy the functions that use it.
   - A signed-in account behaving badly: suspend the provider in the admin site; for a customer, disable the user in Supabase Auth.
   - A bad database change: use the rollback section at the bottom of the proposal file.
   - Data being read through a hole: apply the closing proposal, or remove the policy; tell the technical lead which table.
3. Do not announce on social media. Do not blame anyone in writing yet.

### Key rotation notes
- `KYC_PAN_KEY` (PAN encryption): never delete the old key. Set the new one as `KYC_PAN_KEY`, raise `KYC_PAN_KEY_VERSION`, keep the old
  as `KYC_PAN_KEY_V<n>` so old rows stay readable. A re-encryption script is not written yet (it is on the list of open items).
- `KYC_PAN_HMAC_KEY`: changing it breaks duplicate-PAN and blocklist matching until every row is re-indexed (script not written).
- `OTP_HMAC_KEY`: safe to change; codes in flight stop working.
- Supabase JWT / anon key: rotating signs everyone out and needs new app builds. Only if the JWT secret itself leaked.

## Within hours: find out what happened
Use the logs: Supabase Auth and API logs, Edge Function logs, `payment_events`, `kyc_access_log` (who opened which PAN, when),
`admin_audit_log`, `dispatch_events`, Razorpay dashboard. Answer: what data, whose, how many people, since when, is it still open.
Keep the logs: copy them out before they age off.

## Reporting (confirm with the lawyer)
- **CERT-In**: cyber security incidents must be reported to CERT-In within **6 hours** of noticing them (the 2022 directions;
  e-mail incident@cert-in.org.in with the incident form on cert-in.org.in). This includes unauthorised access to data and
  data breaches. Systems logs are to be kept for **180 days** in India. Do not wait for the investigation to finish; send what
  you know and update it.
- **Data Protection Board and the people affected**: the Digital Personal Data Protection Act 2023 requires telling the Board
  and each affected person about a personal data breach. The format and deadlines are in the DPDP Rules: ask the lawyer for the
  version in force on the day.
- **Razorpay**: tell your account manager if payment data or the webhook secret may be involved.
- **Google Play / Expo**: only if an app update or a key is part of the problem.
- **Police (cyber crime portal cybercrime.gov.in)**: for fraud, theft of money or extortion.

## Telling affected people (draft, plain words)
> We found that [what happened] on [date]. It affected [what information] of [who]. We have [what you did to stop it]. You
> should [what they should do, if anything: change a password, ignore messages asking for OTPs]. We are sorry. Write to
> [support email] and we will answer within [24 hours].

Say what you know, what you do not know yet, and when you will update them. Do not guess.

## After: learn
Within a week: a one-page note of the timeline, the cause, the fix and what changes so it cannot repeat. Add a test for it
(every hole in `docs/SECURITY_FINDINGS.md` got one). Update the findings file and tell your auditor if a retest is due.

## Prepared in advance (do these now, they take an hour)
- [ ] The people table above is filled in and printed or saved off the laptop.
- [ ] Keys are in a password manager with a second copy (see `docs/SECURITY_CHANGES.md`).
- [ ] You know where the Supabase, Razorpay, Expo, GitHub and Google Play logins are, and who else has them.
- [ ] CERT-In's incident e-mail and form are bookmarked.
- [ ] A paid Supabase plan with backups, and one restore test done (a backup you have never restored is a guess).
