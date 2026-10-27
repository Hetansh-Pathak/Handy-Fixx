// EXPO_PUBLIC_* values are inlined at build time and visible in the bundle: public values only.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  /**
   * Set to "1" once supabase/proposals/…pdf_pricing_model has been applied. Until then real customers
   * cannot confirm bookings (the live 12% trigger would save a different total than the screen shows).
   * Development builds can always book, to test the flow.
   */
  bookingEnabled: __DEV__ || process.env.EXPO_PUBLIC_PDF_PRICING_LIVE === "1",
  /**
   * Set to "1" once supabase/proposals/…booking_status_arrived has been applied (or the status column is plain
   * text). Until then the job flow skips "I've arrived" and goes straight from on-the-way to start-job.
   */
  arrivedStatus: process.env.EXPO_PUBLIC_ARRIVED_STATUS === "1",
  /**
   * Set to "1" once a Google Maps API key is in the build (GOOGLE_MAPS_API_KEY). Without it the live-tracking card
   * shows distance and ETA with an "Open in Google Maps" button instead of an embedded map.
   */
  mapsEnabled: process.env.EXPO_PUBLIC_MAPS_ENABLED === "1",
  /** Native-check screens are always on in dev; set EXPO_PUBLIC_ENABLE_SPIKE=1 for other builds. */
  spikeEnabled: __DEV__ || process.env.EXPO_PUBLIC_ENABLE_SPIKE === "1",
} as const;
