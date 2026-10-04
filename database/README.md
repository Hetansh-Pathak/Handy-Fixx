# Database

This directory contains all Supabase database resources for HandyFix.

## Structure

```
database/
├── migrations/
│   ├── customer/   # Migrations for the customer-app schema
│   └── provider/   # Migrations for the provider-app schema
└── functions/
    ├── send-welcome-email/     # Sends a welcome email after customer signup
    ├── send-provider-otp/      # Generates and sends an OTP for provider login
    └── verify-provider-otp/    # Verifies the OTP and returns a session
```

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
