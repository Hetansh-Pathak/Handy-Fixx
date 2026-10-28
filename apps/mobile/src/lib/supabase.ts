import "react-native-url-polyfill/auto";
import { createHandyFixClient } from "@handyfix/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { env } from "./env";
import { LargeSecureStore } from "./secure-storage";

// Web is only used for local previews; there is no Keystore, so fall back to localStorage.
const webStorage = {
  getItem: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => void globalThis.localStorage?.setItem(k, v),
  removeItem: async (k: string) => void globalThis.localStorage?.removeItem(k),
};

// Created lazily so screens that don't need Supabase still open when the env vars are not set
// yet; the shared factory throws a clear error on first use instead.
// Untyped for now: generated DB types come once they are regenerated from the live project.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  client ??= createHandyFixClient({
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    storage: Platform.OS === "web" ? webStorage : new LargeSecureStore(),
    // Web Google sign-in returns with the session in the URL hash; native apps never do.
    detectSessionInUrl: Platform.OS === "web",
  });
  return client;
}
