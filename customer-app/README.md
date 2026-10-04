# HandyFix — Customer App

The customer-facing web application for HandyFix. Customers can browse services, book providers, and manage their account.

## Quick start

```bash
npm install
npm run dev
```

Runs on **http://localhost:3000** by default.

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
