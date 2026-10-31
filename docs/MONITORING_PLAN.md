# Monitoring and alerts plan (draft)

Goal: learn about trouble from your own alarms, not from a customer or an auditor. Everything below uses what you already
have (Supabase logs, tables and cron, Razorpay, Expo) before adding paid tools. Fill the owner column when you take a job.

## 1. Daily look (5 minutes, one person)
| What | Where | Worry if |
|---|---|---|
| Failed payments and odd results | table `payment_events` (column `result`) | `amount_mismatch`, `refund_failed`, `unknown_order` more than once a day |
| Webhook trouble | Supabase > Edge Functions > `razorpay-webhook` logs | any `401 invalid signature` bursts or 500s |
| Who opened a PAN | table `kyc_access_log` | views by someone who should not, or many in a day |
| Payout requests | admin site > Wallets | a large payout for a brand-new pro |
| New pros | admin site > KYC review queue | applications waiting more than 2 working days |

## 2. Alerts to set up (one-off)
1. **Supabase**: Project settings > Notifications / Log drains: email on database CPU or disk over 80%, and on Edge Function error
   rate. Turn on the **security advisor** email (Advisors > Security) and read it monthly.
2. **Razorpay dashboard**: email on failed settlements and on disputes / chargebacks.
3. **Expo / EAS**: crash reports for both apps (Observe), and the Play Console crash and ANR emails.
4. **Uptime**: a free uptime check (for example UptimeRobot) on the admin site and on one cheap API call.
5. **Auth abuse**: in Supabase Auth settings turn on leaked-password protection, CAPTCHA for sign-up if abuse appears, and keep the
   default rate limits.

## 3. Queries to run weekly (read-only, in the SQL editor)
```sql
-- webhook results this week
select result, count(*) from public.payment_events where created_at > now() - interval '7 days' group by 1 order by 2 desc;
-- PAN views this week
select actor_id, action, count(*) from public.kyc_access_log where created_at > now() - interval '7 days' group by 1, 2 order by 3 desc;
-- bookings created and completed by the same pair within an hour (possible fake jobs)
select b.customer_id, b.provider_id, count(*) from public.bookings b
 where b.created_at > now() - interval '7 days' and b.status = 'completed' group by 1, 2 having count(*) >= 3 order by 3 desc;
-- retention job health: photos still waiting past the deadline
select count(*) from public.kyc_retention_due(500);
-- scheduled jobs
select jobname, schedule, active from cron.job;
```

## 4. Things to review on a schedule
| When | What |
|---|---|
| Weekly | the queries above; Dependabot / `npm audit`; pending KYC; open disputes |
| Monthly | Supabase security advisor; who has dashboard, GitHub, Razorpay, Expo access (remove leavers); restore test of a backup |
| Quarterly | rotate the Brevo and Expo tokens; re-read `docs/SECURITY_FINDINGS.md` and close what is open |
| Yearly, and after any big change | a retest by the auditor (new payment method, new role, new storage, new function) |

## 5. Known gaps (be honest with yourself)
- No central log store: Supabase keeps logs for a short time. The CERT-In rule is 180 days: if you want to comply fully, ask
  the lawyer, then add a log drain to storage you control.
- No automatic alert yet for "someone tried the completion code 5 times" or "many failed OTPs": the data exists
  (`booking_completion_codes.failed_attempts`, `provider_otp_codes.attempts`); a small scheduled query could email it.
- No real-time fraud scoring. The weekly query for repeated same-pair jobs is the first, cheap line.
