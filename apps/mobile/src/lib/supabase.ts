import "react-native-url-polyfill/auto";
import { createHandyFixClient } from "@handyfix/shared";
import { env } from "./env";
import { LargeSecureStore } from "./secure-storage";

// Created lazily so screens that don't need Supabase (e.g. the location check) still open when
// the env vars are not set yet; the shared factory throws a clear error on first use instead.
let client: ReturnType<typeof createHandyFixClient> | null = null;

export function getSupabase() {
  client ??= createHandyFixClient({
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    storage: new LargeSecureStore(),
    detectSessionInUrl: false,
  });
  return client;
}
