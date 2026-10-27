import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LocationObject } from "expo-location";
import * as TaskManager from "expo-task-manager";

export const LOCATION_TASK = "handyfix-background-location";
const STORAGE_KEY = "spike:location-points";
const MAX_POINTS = 500;

export type SpikePoint = { t: number; lat: number; lng: number; accuracy: number | null };

/** Imported from the root layout: background tasks must be defined at app start, outside React. */
TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const incoming: SpikePoint[] = data.locations.map((l) => ({
    t: l.timestamp,
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
  }));
  const existing = await readPoints();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...incoming].slice(-MAX_POINTS)));
});

export async function readPoints(): Promise<SpikePoint[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as SpikePoint[]) : [];
}

export const clearPoints = () => AsyncStorage.removeItem(STORAGE_KEY);
