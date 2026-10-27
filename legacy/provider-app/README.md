# HandyFix — Provider App

The provider dashboard for HandyFix. Providers can manage bookings, earnings, availability, and their live location.

## Quick start

```bash
npm install
npm run dev
```

Runs on **http://localhost:3001** by default.

## Environment variables

Create `.env.local` in this directory:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint check |
| `npm run test` | Run unit tests |

See the root [README](../README.md) for full project documentation.
