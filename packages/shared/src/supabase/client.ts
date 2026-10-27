import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";

export type HandyFixClientConfig = {
  url: string | undefined;
  anonKey: string | undefined;
  /** Session storage. Web: localStorage (default). Mobile: a secure/async storage adapter. */
  storage?: SupportedStorage;
  /** Web only: parse the OAuth callback from the URL. Must be false in React Native. */
  detectSessionInUrl?: boolean;
};

/**
 * The single place the Supabase client is created. Unlike the old per-app clients it never
 * falls back to a fake URL/key: missing config fails loudly at startup.
 * Pass the generated `Database` type as the generic once types are regenerated from the live project.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHandyFixClient<Database = any>(config: HandyFixClientConfig): SupabaseClient<Database> {
  const url = config.url?.trim();
  const anonKey = config.anonKey?.trim();
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured: set the project URL and anon (publishable) key.");
  }
  if (!/^https:\/\/.+/.test(url)) throw new Error("Supabase URL must start with https://");
  return createClient<Database>(url, anonKey, {
    auth: {
      storage: config.storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
    },
  });
}
