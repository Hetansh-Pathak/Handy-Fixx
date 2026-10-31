import fs from "node:fs";
import type { ExpoConfig } from "expo/config";

const GOLD = "#C16430"; // brand terracotta (notification accent)
const BLACK = "#0A0A0A"; // launcher icon background (the logo tile is dark)
const CANVAS = "#05070D"; // splash + window background: the apnabanda "Black + Blur" canvas (the native splash cannot follow the theme)
const MIC_REASON = "HandyFix uses the microphone so you can record a voice note describing the problem for your pro.";

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
  customer: { name: "apnabanda", slug: "handyfix", scheme: "handyfix", pkg: "in.handyfix.app" },
  provider: { name: "apnabanda Pro", slug: "handyfix-pro", scheme: "handyfixpro", pkg: "in.handyfix.pro" },
  both: { name: "apnabanda (dev)", slug: "handyfix", scheme: "handyfix", pkg: "in.handyfix.app" },
}[VARIANT];
// A customer build must not carry the provider's background-location and foreground-service permissions
// (Play reviews these closely, and customers never need them).
const customerBlocked = [
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.USE_FULL_SCREEN_INTENT",
];

// Expo (EAS) projects, one per store app, on the owner's account (owner decision 2026-10-31, was @riteshkanara).
// The IDs are not secrets; they come from `eas init` (@hetanshpathak/handyfix and @hetanshpathak/handyfix-pro).
const EAS_OWNER = "hetanshpathak";
const EAS_PROJECT_ID = {
  customer: "7c7a4f6c-d198-481c-8a0b-288c5365ea85",
  provider: "2adb52d3-4ae0-4acb-9556-0538f7cace9e",
  both: "7c7a4f6c-d198-481c-8a0b-288c5365ea85",
}[VARIANT];

const config: ExpoConfig = {
  name: IDENTITY.name,
  slug: IDENTITY.slug,
  owner: EAS_OWNER,
  scheme: IDENTITY.scheme,
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic", // Profile > Appearance offers Light / Dark / System; System needs this
  icon: "./assets/images/icon.png",
  // Browser tab icon for the web builds (the phone app icon files are a separate follow-up).
  web: { favicon: "./assets/brand/apnabanda-favicon.png" },
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
      // The voice note is the customer's; the Pro app never records audio. The Pro app does need the camera
      // (identity selfie and ID photos, and the bill photo for parts), so CAMERA stays allowed.
      ...(isPro ? ["android.permission.RECORD_AUDIO"] : []),
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
    // Customers record a voice note describing the problem; pros only play it (and the ring tone). No background audio.
    ["expo-audio", {
      microphonePermission: isPro ? false : MIC_REASON,
      recordAudioAndroid: !isPro,
      enableBackgroundRecording: false,
      enableBackgroundPlayback: false,
    }],
    ["expo-image-picker", {
      photosPermission: "HandyFix lets you add photos of the problem so your pro knows what to bring.",
      cameraPermission: isPro
        ? "HandyFix Pro uses the camera for your identity selfie, your ID photos and the bill photo for parts."
        : "HandyFix uses the camera so you can photograph the problem for your pro.",
      // `false` here strips RECORD_AUDIO from the manifest, which the customer's voice note needs.
      microphonePermission: isPro ? false : MIC_REASON,
    }],
    "expo-dev-client",
  ],
  experiments: {},
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
  },
};

export default config;
