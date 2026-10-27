import { createHandyFixClient } from '@handyfix/shared';
import type { Database } from './types';

// Shared factory: throws at startup if the Supabase env vars are missing instead of
// silently talking to a placeholder project.
export const supabase = createHandyFixClient<Database>({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  storage: localStorage,
  detectSessionInUrl: true,
});
