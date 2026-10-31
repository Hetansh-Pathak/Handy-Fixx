# apnabanda

apnabanda is a home-services marketplace that connects customers with verified local professionals. The repository is a monorepo being migrated from three Vite web apps to a single **React Native + Expo** mobile app (customer and provider roles) with a web admin panel, shared TypeScript logic and a Supabase backend.

> **Migration status:** Phases 0 to 2 (clean baseline, monorepo, shared logic) are done and `apps/mobile` exists as an app shell with native-risk check screens (Phase 3: run `apps/mobile/SPIKE.md` on a real Android phone). The old web apps were removed on 2026-11-01; `apps/mobile` is the customer and Pro app.

![Customer application preview](docs/customer-app-preview.png)

## What it does

### Customer application (`customer-app`)

- Browse services and service professionals
- Create an account, sign in, and reset a password
- Book a provider and view booking confirmations
- Manage profile, notifications, and booking history
- Apply to become a apnabanda professional
- Live map view of assigned provider location

### Provider application (`provider-app`)

- Sign in through a dedicated provider portal with email OTP
- View a dashboard of bookings and activity
- Manage booking status, availability, profile, and settings
- Review earnings, ratings, notifications, and live location tracking

![Provider dashboard preview](docs/provider-app-preview.png)

## Repository structure

```
handyfix/
├── apps/
│   ├── mobile/                # Expo SDK 58 app: (auth) screens, role-pick, /customer and /provider tabs; own install, see CLAUDE.md
│   └── admin/                 # Admin operations panel (Vite + React, stays web, port 3002)
├── packages/
│   └── shared/                # @handyfix/shared: types, Zod, fee/price/booking logic, tests
├── supabase/
│   ├── migrations/
│   │   ├── customer/          # Customer-side schema migrations
│   │   └── provider/          # Provider-side schema migrations (KYC, wallet ledger, ...)
│   ├── functions/             # All Edge Functions (OTP, email, Razorpay, wallet)
│   ├── proposals/             # SQL that is NOT applied (review only)
│   └── verify/                # Read-only verification scripts
│   ├── customer-app/          # (Vite + React, port 3000)
│   └── provider-app/          # (Vite + React, port 3001)
├── docs/
├── CLAUDE.md                  # Rules for Claude Code in this repo
├── tsconfig.base.json         # Strict TS config shared by new packages
└── package.json               # npm workspaces root (apps/*, packages/*)
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project with this project's schema applied

## Local development

### 1. Configure environment variables

Create a `.env.local` file inside `apps/admin`:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

> **Never commit `.env.local` or any file containing secrets.**

### 2. Apply database migrations

Using the Supabase CLI or the SQL editor in the Supabase dashboard, apply the migrations in order:

```
supabase/migrations/customer/   # Run these for the customer schema
supabase/migrations/provider/   # Run these for the provider schema
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy send-welcome-email
supabase functions deploy send-provider-otp
supabase functions deploy verify-provider-otp
supabase functions deploy send-customer-otp
supabase functions deploy verify-customer-otp
```

**Email provider: Brevo** — the three email-sending functions (`send-welcome-email`, `send-provider-otp`, `send-customer-otp`) use the [Brevo](https://www.brevo.com) Transactional Email API. Set the required secrets before deploying:

```bash
supabase secrets set \
  BREVO_API_KEY=<your-brevo-api-key> \
  BREVO_SENDER_EMAIL=<verified-sender@yourdomain.com> \
  BREVO_SENDER_NAME=apnabanda
```

| Secret | Required | Description |
|---|---|---|
| `BREVO_API_KEY` | ✅ | Brevo SMTP & API key (v3) |
| `BREVO_SENDER_EMAIL` | ✅ | Sender address verified in Brevo |
| `BREVO_SENDER_NAME` | optional | Display name (default: `apnabanda`) |

### 4. Install and run

Install once from the repo root (npm workspaces install `apps/admin` and `packages/shared` together):

```bash
npm install
```

**Admin app** (http://localhost:3002):

```bash
npm run admin
```

**Mobile app** (separate install, needs an EAS development build on a phone; see `apps/mobile/SPIKE.md`):

```bash
npm run mobile:install
npm run mobile:start
```

**Legacy web apps** (own `package-lock.json`, not part of the workspace, so install inside each):

```bash
```

## Authentication

- **Customers** sign up and log in via Supabase Auth (email/password + Google OAuth).
- **Providers** log in via email OTP through the dedicated `send-provider-otp` / `verify-provider-otp` Edge Functions.

For Google sign-in, enable Google in **Supabase Dashboard → Authentication → Providers**, then add both the Supabase callback URL and the deployed application URL to the allowed redirect list.

## Available scripts

From the repo root (run across all workspaces):

| Command | Description |
|---|---|
| `npm run typecheck` | `tsc` in admin and shared |
| `npm run lint` | ESLint in admin |
| `npm run test` | Vitest in shared |
| `npm run build` | Production build of admin |
| `npm run admin` | Admin dev server |

Inside a single app or package, `npm run dev | build | lint | test` work as before.

## Contribution guide

1. Pull the latest changes before starting work.
2. Create a feature branch: `git checkout -b feat/<short-description>`.
3. Keep changes scoped to one app or package. Shared logic goes in `packages/shared`.
4. Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` from the root before opening a pull request.
5. Do not commit `.env.local`, credentials, lock files from other package managers, or generated build output.

## Team

| Member | Role | GitHub |
|---|---|---|
| Ritesh | Full-stack / MERN | [@Riteshkanara](https://github.com/Rietshkanara) |
| Rushiraj | Business Analyst | [@rushirajsinhparmar](https://github.com/rushirajsinhparmar) |
| Madhav | QA | [@Madhav-chandarana](https://github.com/Madhav-chadarana) |

## License

Add a license before making the repository public.
