# Local setup and "services are missing" checklist

## The usual cause

`.env.local` files are **not tracked by git**. When the repo moved apps (`customer-app` → `legacy/customer-app`,
`admin-app` → `apps/admin`, new `apps/mobile` with **different variable names**), the old files stayed behind and the
apps lost their connection to Supabase. Result: no services, no pros, an empty home screen. The data is fine.

## One command to find and fix it

```bash
npm run env:check    # reports every app: missing file / wrong names / wrong or empty project / OK with a service count
npm run env:fix      # creates or repairs the missing .env.local files (never overwrites an existing value)
```

What `env:fix` does: copies your old `.env.local` from the old folders if it exists, otherwise writes the public project
URL and anon key from `apps/admin/.env.example`; on mobile it adds the `EXPO_PUBLIC_*` names from old `VITE_*` values.
Only public values are used. Never put a service-role key in any of these files.

| App | File | Variables |
|---|---|---|
| `apps/admin` | `apps/admin/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `apps/mobile` | `apps/mobile/.env.local` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

**After changing settings, restart.** Vite reads them at start. The mobile app bakes `EXPO_PUBLIC_*` into the bundle:
`npm run mobile:start -- --clear`.

## Pointing an app at a test project

A new, empty Supabase project has **no services** until the migrations and the catalogue seed are applied. If you test on a
throwaway project, expect an empty catalogue there. `npm run env:check` prints `0 active services` for that case and shows
which project each app uses. The real project has 11 services and 308 sub-services.

## Still empty after `env:check` says OK?

1. Pull to refresh in the app / hard reload the browser (the app caches services for 5 minutes).
2. Check the project in the Supabase dashboard: `select count(*) from services where is_active;` should be 11.
3. The `services` table needs the public read policy (`public_read_services`, `using (true)`). Anyone can read it today.
