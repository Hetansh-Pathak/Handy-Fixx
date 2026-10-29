import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const REQUEST_CHANNEL = "requests";
/** Requests the wallet cannot cover yet: visible, but quiet (no ring, no heads-up). */
export const LOCKED_REQUEST_CHANNEL = "requests_locked";

/** Foreground behaviour: show the banner and play the sound even while the app is open. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: n.request.content.data?.locked !== true,
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
    lightColor: "#C16430",
  });
}

async function ensureLockedChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(LOCKED_REQUEST_CHANNEL, {
    name: "Locked job requests (recharge needed)",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: [0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

let permission: Promise<boolean> | null = null;

/** Asks once per app run; later calls reuse the answer. */
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch(() => false);
  return permission;
}

/**
 * A phone notification for a new job request. Tapping it opens the request (see `onRequestTapped`).
 * Best effort: on web, or without permission, the in-app banner is the only alert.
 */
export async function notifyNewRequest(args: { bookingId: string; title: string; body: string }): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!(await ensurePermission())) return;
    await ensureRequestChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: args.title, body: args.body, data: { bookingId: args.bookingId }, sound: "new_request.wav" },
      trigger: Platform.OS === "android" ? { channelId: REQUEST_CHANNEL } : null,
    });
  } catch {
    /* the banner inside the app still shows the request */
  }
}

/**
 * A QUIET phone notification for a request the pro cannot accept yet because the wallet is too low: no
 * ring, no vibration. Tapping it opens the request, where the recharge button is. Best effort, like the loud one.
 */
export async function notifyLockedRequest(args: { bookingId: string; title: string; body: string }): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!(await ensurePermission())) return;
    await ensureLockedChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: args.title, body: args.body, data: { bookingId: args.bookingId, locked: true }, sound: false },
      trigger: Platform.OS === "android" ? { channelId: LOCKED_REQUEST_CHANNEL } : null,
    });
  } catch {
    /* the card inside the app still shows the request */
  }
}

/** Calls back with the booking id when a request notification is tapped. Returns the unsubscribe function. */
export function onRequestTapped(open: (bookingId: string) => void): () => void {
  if (Platform.OS === "web") return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const id = r.notification.request.content.data?.bookingId;
    if (typeof id === "string") open(id);
  });
  return () => sub.remove();
}
