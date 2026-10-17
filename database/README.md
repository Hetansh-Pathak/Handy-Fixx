# Database

This directory contains all Supabase database resources for HandyFix.

## Structure

```
database/
├── migrations/
│   ├── 20261007000000_security_hardening.sql   # latest, shared by all apps
│   ├── customer/   # historical customer-app migrations
│   └── provider/   # historical provider-app migrations
├── supabase/
│   └── functions/            # Edge Functions (single source of truth)
│       ├── _shared/cors.ts   # CORS allow-list + helpers
│       ├── send-welcome-email/
│       ├── send-customer-otp/    verify-customer-otp/
│       └── send-provider-otp/    verify-provider-otp/
└── README.md
```

> Run Supabase CLI commands from this `database/` directory so it finds `supabase/functions`.
> Both apps share ONE Supabase project. Put every new migration in `database/migrations/` (not the
> per-app folders). `docs/archive/` holds a fee-trigger proposal that was never applied.

## Applying migrations

Apply migrations in chronological order (files are prefixed with a timestamp).
Use the Supabase CLI or paste them into the SQL editor in the Supabase dashboard.

```bash
# Example using the CLI
supabase db push
```

## Deploying Edge Functions

```bash
supabase functions deploy send-welcome-email
supabase functions deploy send-provider-otp
supabase functions deploy verify-provider-otp
supabase functions deploy send-customer-otp
supabase functions deploy verify-customer-otp
```

> Edge Functions require the Supabase CLI to be installed and linked to your project.

## Required secrets

```bash
supabase secrets set ALLOWED_ORIGINS=https://handyfix.in,https://provider.handyfix.in,https://admin.handyfix.in
```
Without `ALLOWED_ORIGINS` the functions fall back to `*` and log a warning (dev only).

## Email provider: Brevo

The `send-welcome-email`, `send-provider-otp`, and `send-customer-otp` functions use the [Brevo](https://www.brevo.com) Transactional Email API (v3). Set the following Supabase secrets before deploying:

```bash
supabase secrets set \
  BREVO_API_KEY=<your-brevo-api-key> \
  BREVO_SENDER_EMAIL=<verified-sender@yourdomain.com> \
  BREVO_SENDER_NAME=HandyFix
```

| Secret | Required | Notes |
|---|---|---|
| `BREVO_API_KEY` | ✅ | Create under **SMTP & API → API Keys** in the Brevo dashboard |
| `BREVO_SENDER_EMAIL` | ✅ | Must be verified under **Senders** in the Brevo dashboard |
| `BREVO_SENDER_NAME` | optional | Defaults to `HandyFix` if not set |
