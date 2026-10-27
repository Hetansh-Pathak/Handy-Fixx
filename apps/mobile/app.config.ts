import fs from "node:fs";
import type { ExpoConfig } from "expo/config";

const GOLD = "#C16430"; // brand terracotta (notification accent)
const BLACK = "#0A0A0A"; // launcher icon background (the logo tile is dark)
const CANVAS = "#FAF6EF"; // app background, same as the old HandyFix sites

// FCM / Google services file. On EAS, upload it as a file secret and expose its path via
// GOOGLE_SERVICES_JSON; locally drop it next to this file. Absent = config still validates.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";

// One codebase, two store apps. EXPO_PUBLIC_APP_VARIANT = "customer" | "provider" (anything else = a dev build
// holding both). Each variant has its own name, package, scheme and only the permissions it needs.
const requested = process.env.EXPO_PUBLIC_APP_VARIANT;
const VARIANT: "customer" | "provider" | "both" = requested === "customer" || requested === "provider" ? requested : "both";
const isPro = VARIANT === "provider";
const isCustomer = VARIANT === "customer";
const IDENTITY = {
  customer: { name: "HandyFix", slug: "handyfix", scheme: "handyfix", pkg: "in.handyfix.app" },
  provider: { name: "HandyFix Pro", slug: "handyfix-pro", scheme: "handyfixpro", pkg: "in.handyfix.pro" },
  both: { name: "HandyFix (dev)", slug: "handyfix", scheme: "handyfix", pkg: "in.handyfix.app" },
}[VARIANT];
// A customer build must not carry the provider's background-location and foreground-service permissions
// (Play reviews these closely, and customers never need them).
const customerBlocked = [
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.USE_FULL_SCREEN_INTENT",
];

const config: ExpoConfig = {
  name: IDENTITY.name,
  slug: IDENTITY.slug,
  scheme: IDENTITY.scheme,
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/images/icon.png",
  backgroundColor: CANVAS,
  android: {
    // Placeholder: must match your Firebase app, Google OAuth Android client and Play listing.
    package: IDENTITY.pkg,
    adaptiveIcon: {
      backgroundColor: BLACK,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Permissions pulled in by default modules that HandyFix does not use. Play reviewers flag unused
    // sensitive permissions. SYSTEM_ALERT_WINDOW is only needed by the dev client overlay.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      ...(isCustomer ? customerBlocked : []),
      ...(process.env.EAS_BUILD_PROFILE === "production" ? ["android.permission.SYSTEM_ALERT_WINDOW"] : []),
    ],
    ...(fs.existsSync(googleServicesFile) ? { googleServicesFile } : {}),
    // Maps SDK key for the live-tracking map (Google Cloud: enable "Maps SDK for Android", restrict by package + SHA-1).
    ...(process.env.GOOGLE_MAPS_API_KEY ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } } } : {}),
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: CANVAS, image: "./assets/images/splash-icon.png", imageWidth: 76 }],
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "HandyFix uses your location to show nearby pros and track your pro's arrival.",
        // The manifest permission is app-wide, but the app only ASKS for background location
        // after someone picks the provider role (see packages/shared auth/roles).
        locationAlwaysAndWhenInUsePermission: "HandyFix shares your live location with the customer while you travel to a job.",
        isAndroidBackgroundLocationEnabled: !isCustomer,
        isAndroidForegroundServiceEnabled: !isCustomer,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: GOLD,
        defaultChannel: "default",
        // Placeholder tone for the new-request alert; replace with the designed sound (.wav).
        sounds: ["./assets/sounds/new_request.wav"],
      },
    ],
    // Ring tone only: no microphone, no background playback service.
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false, enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    "expo-dev-client",
  ],
  experiments: {},
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
