import AsyncStorage from "@react-native-async-storage/async-storage";
import { approxPoint } from "@handyfix/shared";
import * as Location from "expo-location";
import { publishApproxLocation } from "./api";
import {
  JOB_LOCATION_TASK, JOB_TRACKING_KEY, PRESENCE_KEY, PRESENCE_TASK, type JobTrackingState, type PresenceState,
} from "@/tasks/provider-tasks";

const SERVICE_COLOR = "#C16430";

/** Foreground first, then "Allow all the time". Only ever asked of a pro, never of a customer. */
export async function ensureBackgroundLocation(): Promise<"granted" | "foreground_only" | "denied"> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? "granted" : "foreground_only";
}

export async function startPresence(providerId: string): Promise<void> {
  const state: PresenceState = { providerId, lastTouch: Date.now() };
  await AsyncStorage.setItem(PRESENCE_KEY, JSON.stringify(state));
  if (await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK)) return;
  await Location.startLocationUpdatesAsync(PRESENCE_TASK, {
    accuracy: Location.Accuracy.Low,
    timeInterval: 30_000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "HandyFix: you are online",
      notificationBody: "New job requests will appear on your screen.",
      notificationColor: SERVICE_COLOR,
    },
  });
}

export async function stopPresence(): Promise<void> {
  await AsyncStorage.removeItem(PRESENCE_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(PRESENCE_TASK);
  }
}

export async function startJobTracking(args: Omit<JobTrackingState, "lastEta">): Promise<void> {
  await AsyncStorage.setItem(JOB_TRACKING_KEY, JSON.stringify({ ...args, lastEta: 0 } satisfies JobTrackingState));
  if (await Location.hasStartedLocationUpdatesAsync(JOB_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(JOB_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 15,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "HandyFix: sharing your location",
      notificationBody: "Your customer can see you are on the way.",
      notificationColor: SERVICE_COLOR,
    },
  });
}

export async function stopJobTracking(): Promise<void> {
  await AsyncStorage.removeItem(JOB_TRACKING_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(JOB_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(JOB_LOCATION_TASK);
  }
}

/**
 * The pro's position right now, for the arrival record. Needs the location permission already granted (it asks nothing
 * itself) and gives up after 6 seconds; null means "time only". Never throws.
 */
export async function currentPoint(): Promise<{ latitude: number; longitude: number } | null> {
  const lookup = (async () => {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
  })().catch(() => null);
  // The limit covers the permission check too: a call that never answers must not delay the arrival record.
  return Promise.race([lookup, new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))]);
}

/**
 * Tells customers roughly where this pro works (rounded to about 1 km) while online, for "Nearest".
 * Needs the foreground permission only; quietly does nothing without it.
 */
export async function shareApproxArea(providerId: string): Promise<void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const point = pos ? approxPoint(pos.coords) : null;
    if (point) await publishApproxLocation(providerId, point);
  } catch {
    /* optional feature: never blocks going online */
  }
}

export const clearApproxArea = (providerId: string): Promise<void> => publishApproxLocation(providerId, null).catch(() => undefined);
