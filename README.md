# HandyFix

HandyFix is a home-services marketplace that connects customers with verified local professionals. The repository contains three Vite + React applications: a customer-facing booking experience, a dedicated provider dashboard, and a standalone admin operations panel, all backed by Supabase.

![Customer application preview](docs/customer-app-preview.png)

## What it does

### Customer application (`customer-app`)

- Browse services and service professionals
- Create an account, sign in, and reset a password
- Book a provider and view booking confirmations
- Manage profile, notifications, and booking history
- Apply to become a HandyFix professional
- Live map view of assigned provider location

### Provider application (`provider-app`)

- Sign in through a dedicated provider portal with email OTP
- View a dashboard of bookings and activity
- Manage booking status, availability, profile, and settings
- Review earnings, ratings, notifications, and live location tracking

![Provider dashboard preview](docs/provider-app-preview.png)

## Repository structure

```
handy-fix/
├── customer-app/          # Customer web application (Vite + React, port 3000)
├── provider-app/          # Provider dashboard (Vite + React, port 3001)
├── admin-app/             # Admin operations panel (Vite + React, port 3002)
├── database/
│   ├── migrations/
│   │   ├── customer/      # Supabase migrations for the customer schema
│   │   └── provider/      # Supabase migrations for the provider schema
│   └── functions/
│       ├── send-welcome-email/       # Edge Function: welcome email on signup
│       ├── send-provider-otp/        # Edge Function: OTP for provider login
│       └── verify-provider-otp/      # Edge Function: OTP verification
└── docs/
    ├── customer-app-preview.png
    └── provider-app-preview.png
```

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| State & Data | TanStack Query v5, React Hook Form, Zod |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions, Realtime) |
| Routing | React Router v6 |
| Maps | Leaflet, React Leaflet |
| Charts | Recharts |
| Animation | Framer Motion |

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project with this project's schema applied

## Local development

### 1. Configure environment variables

Create a `.env.local` file inside **both** `customer-app` and `provider-app`:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

> **Never commit `.env.local` or any file containing secrets.**

### 2. Apply database migrations

Using the Supabase CLI or the SQL editor in the Supabase dashboard, apply the migrations in order:

```
database/migrations/customer/   # Run these for the customer schema
database/migrations/provider/   # Run these for the provider schema
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
  BREVO_SENDER_NAME=HandyFix
```

| Secret | Required | Description |
|---|---|---|
| `BREVO_API_KEY` | ✅ | Brevo SMTP & API key (v3) |
| `BREVO_SENDER_EMAIL` | ✅ | Sender address verified in Brevo |
| `BREVO_SENDER_NAME` | optional | Display name (default: `HandyFix`) |

### 4. Run the applications

**Customer app** (opens on http://localhost:3000):

```bash
cd customer-app
npm install
npm run dev
```

**Provider app** (opens on http://localhost:3001):

```bash
cd provider-app
npm install
npm run dev
```

**Admin app** (opens on http://localhost:3002):

```bash
cd admin-app
npm install
npm run dev
```

Run each in a separate terminal to use both simultaneously.

## Authentication

- **Customers** sign up and log in via Supabase Auth (email/password + Google OAuth).
- **Providers** log in via email OTP through the dedicated `send-provider-otp` / `verify-provider-otp` Edge Functions.

For Google sign-in, enable Google in **Supabase Dashboard → Authentication → Providers**, then add both the Supabase callback URL and the deployed application URL to the allowed redirect list.

## Available scripts

Run these from either `customer-app` or `provider-app`:

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server with hot reload |
| `npm run build` | Production build (output to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |

## Contribution guide

1. Pull the latest changes before starting work.
2. Create a feature branch: `git checkout -b feat/<short-description>`.
3. Keep changes scoped to the correct app (`customer-app` or `provider-app`).
4. Run `npm run lint`, `npm run test`, and `npm run build` before opening a pull request.
5. Do not commit `.env.local`, credentials, lock files from other package managers, or generated build output.

## Team

| Member | Role | GitHub |
|---|---|---|
| Ritesh | Full-stack / MERN | [@Riteshkanara](https://github.com/Rietshkanara) |
| Rushiraj | Business Analyst | [@rushirajsinhparmar](https://github.com/rushirajsinhparmar) |
| Madhav | QA | [@Madhav-chandarana](https://github.com/Madhav-chadarana) |

## License

Add a license before making the repository public.
