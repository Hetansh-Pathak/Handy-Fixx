import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const REQUEST_CHANNEL = "requests";

/** Foreground behaviour: show the banner and play the sound even while the app is open. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Tier B of the new-request alert: a MAX-importance channel (heads-up, sound, shows on the lock
 * screen, may bypass Do Not Disturb if the user allows it). Channel settings are locked in by
 * Android on first creation: change the channel id when the sound or importance changes.
 */
export async function ensureRequestChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REQUEST_CHANNEL, {
    name: "New job requests",
    importance: Notifications.AndroidImportance.MAX,
    sound: "new_request.wav",
    vibrationPattern: [0, 600, 400, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableLights: true,
    lightColor: "#FBB614",
  });
}
