import { parseAppVariant } from "@handyfix/shared";

// EXPO_PUBLIC_* values are inlined at build time and visible in the bundle: public values only.
export const env = {
  /** Which store app this build is: "customer" (HandyFix), "provider" (HandyFix Pro) or "both" (dev / web preview). */
  appVariant: parseAppVariant(process.env.EXPO_PUBLIC_APP_VARIANT),
  /** Where the customer app sends people who want to become pros (the Pro app's store page). */
  proAppUrl: process.env.EXPO_PUBLIC_PRO_APP_URL ?? "",
  customerAppUrl: process.env.EXPO_PUBLIC_CUSTOMER_APP_URL ?? "",
  /** Shown on Help & support. Defaults to the address on the old HandyFix contact page. */
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@handyfix.in",
  /** Optional. Shown on Help only when set, so the app never displays a placeholder number. */
  supportPhone: process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "",
  /** Hosted pages. The stores require a privacy policy link; the rows only appear when these are set. */
  /** Company details for the privacy policy and terms; left out of the text when empty. */
  legalEntity: process.env.EXPO_PUBLIC_LEGAL_ENTITY ?? "",
  legalAddress: process.env.EXPO_PUBLIC_LEGAL_ADDRESS ?? "",
  grievanceOfficer: process.env.EXPO_PUBLIC_GRIEVANCE_OFFICER ?? "",
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? "",
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? "",
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
