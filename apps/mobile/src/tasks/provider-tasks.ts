import AsyncStorage from "@react-native-async-storage/async-storage";
import { distanceKm, estimateEtaMinutes } from "@handyfix/shared";
import type { LocationObject } from "expo-location";
import * as TaskManager from "expo-task-manager";
import { touchPresence, updateEta, upsertProviderLocation } from "@/features/provider/api";

/** Keeps a pro "online" for customers while the app is in the background (a foreground service). */
export const PRESENCE_TASK = "handyfix-provider-presence";
/** Shares the pro's position with the customer while travelling to a job. */
export const JOB_LOCATION_TASK = "handyfix-job-location";

export const PRESENCE_KEY = "provider:presence";
export const JOB_TRACKING_KEY = "provider:job-tracking";

export type PresenceState = { providerId: string; lastTouch: number };
export type JobTrackingState = {
  bookingId: string;
  userId: string;
  providerId: string;
  destination: { latitude: number; longitude: number } | null;
  lastEta: number;
};

const PRESENCE_MIN_GAP_MS = 25_000;
const ETA_MIN_GAP_MS = 30_000;

async function read<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Background tasks must be defined at app start (imported by the root layout), outside any component. */
TaskManager.defineTask<{ locations: LocationObject[] }>(PRESENCE_TASK, async ({ error }) => {
  if (error) return;
  const state = await read<PresenceState>(PRESENCE_KEY);
  if (!state || Date.now() - state.lastTouch < PRESENCE_MIN_GAP_MS) return;
  try {
    await touchPresence(state.providerId);
    await AsyncStorage.setItem(PRESENCE_KEY, JSON.stringify({ ...state, lastTouch: Date.now() }));
  } catch {
    /* offline: the next tick tries again */
  }
});

TaskManager.defineTask<{ locations: LocationObject[] }>(JOB_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const state = await read<JobTrackingState>(JOB_TRACKING_KEY);
  if (!state) return;
  const last = data.locations[data.locations.length - 1]!;
  const { latitude, longitude } = last.coords;
  try {
    await upsertProviderLocation({ bookingId: state.bookingId, userId: state.userId, latitude, longitude });
    if (state.destination && Date.now() - state.lastEta >= ETA_MIN_GAP_MS) {
      const minutes = estimateEtaMinutes(distanceKm({ latitude, longitude }, state.destination));
      if (minutes !== null) await updateEta(state.bookingId, state.providerId, minutes);
      await AsyncStorage.setItem(JOB_TRACKING_KEY, JSON.stringify({ ...state, lastEta: Date.now() }));
    }
  } catch {
    /* offline: the next point tries again */
  }
});
