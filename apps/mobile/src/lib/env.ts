// EXPO_PUBLIC_* values are inlined at build time and visible in the bundle: public values only.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  /** Native-check screens are always on in dev; set EXPO_PUBLIC_ENABLE_SPIKE=1 for other builds. */
  spikeEnabled: __DEV__ || process.env.EXPO_PUBLIC_ENABLE_SPIKE === "1",
} as const;
