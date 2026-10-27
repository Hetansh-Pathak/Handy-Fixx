import fs from "node:fs";
import type { ExpoConfig } from "expo/config";

const GOLD = "#FBB614";
const BLACK = "#0A0A0A";

// FCM / Google services file. On EAS, upload it as a file secret and expose its path via
// GOOGLE_SERVICES_JSON; locally drop it next to this file. Absent = config still validates.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";

const config: ExpoConfig = {
  name: "HandyFix",
  slug: "handyfix",
  scheme: "handyfix",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/images/icon.png",
  backgroundColor: BLACK,
  android: {
    // Placeholder: must match your Firebase app, Google OAuth Android client and Play listing.
    package: "com.handyfix.app",
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
      ...(process.env.EAS_BUILD_PROFILE === "production" ? ["android.permission.SYSTEM_ALERT_WINDOW"] : []),
    ],
    ...(fs.existsSync(googleServicesFile) ? { googleServicesFile } : {}),
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: BLACK, image: "./assets/images/splash-icon.png", imageWidth: 76 }],
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission: "HandyFix uses your location to show nearby pros and track your pro's arrival.",
        // The manifest permission is app-wide, but the app only ASKS for background location
        // after someone picks the provider role (see packages/shared auth/roles).
        locationAlwaysAndWhenInUsePermission: "HandyFix shares your live location with the customer while you travel to a job.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
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
