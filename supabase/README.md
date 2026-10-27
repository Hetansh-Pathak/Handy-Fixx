# Supabase

This directory contains all Supabase backend resources for HandyFix (migrations, Edge Functions, verification scripts).

## Structure

```
supabase/
├── migrations/
│   ├── customer/   # Customer-side schema migrations
│   └── provider/   # Provider-side schema migrations
├── functions/      # All Edge Functions (single source)
├── proposals/      # SQL that is NOT applied (review only)
└── verify/         # Read-only verification scripts
```

## Wallet & payments

See `docs/WALLET_SETUP_GUIDE.md`. Verification scripts live in `supabase/verify/`.
New functions: `create-qr-payment`, `close-booking-qr`, `create-wallet-topup-order`, `razorpay-webhook` (deploy with `--no-verify-jwt`).

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
