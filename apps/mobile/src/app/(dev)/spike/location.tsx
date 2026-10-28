import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { SpikeLog, useSpikeLog } from "@/components/spike/useSpikeLog";
import { clearPoints, LOCATION_TASK, readPoints, type SpikePoint } from "@/tasks/location-task";

export default function LocationCheck() {
  const { lines, log } = useSpikeLog();
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<SpikePoint[]>([]);

  const refresh = useCallback(async () => {
    setRunning(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK));
    setPoints(await readPoints());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const start = async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    log(`Foreground permission: ${fg.status}`, fg.granted ? "ok" : "fail");
    if (!fg.granted) return;
    // Android requires the foreground prompt first; background is a separate "Allow all the time" step.
    const bg = await Location.requestBackgroundPermissionsAsync();
    log(`Background permission: ${bg.status}`, bg.granted ? "ok" : "fail");
    if (!bg.granted) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10_000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "HandyFix: sharing your location",
        notificationBody: "The customer can see you are on the way.",
        notificationColor: "#1F5BFF",
      },
    });
    log("Updates started with a foreground service. Lock the phone and move around for 3+ minutes.", "ok");
    await refresh();
  };

  const stop = async () => {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    log("Updates stopped.");
    await refresh();
  };

  const last = points[points.length - 1];
  return (
    <Screen>
      <Title>Background location</Title>
      <Body muted>
        PASS = points keep arriving with the screen off and the app in the background, and a persistent
        notification is shown while running. {Platform.OS !== "android" ? "Android only." : ""}
      </Body>
      <Card>
        <Body>Status: {running ? "running" : "stopped"}</Body>
        <Body>Points stored: {points.length}</Body>
        {last ? <Body muted>Last: {new Date(last.t).toLocaleTimeString("en-GB")} · {last.lat.toFixed(5)}, {last.lng.toFixed(5)} · ±{Math.round(last.accuracy ?? 0)} m</Body> : null}
      </Card>
      <Button label={running ? "Stop" : "Start sharing location"} variant={running ? "secondary" : "primary"} onPress={() => void (running ? stop() : start())} />
      <Button label="Refresh points" variant="secondary" onPress={() => void refresh().then(() => log(`Refreshed: ${points.length} points`))} />
      <Button label="Clear stored points" variant="secondary" onPress={() => void clearPoints().then(refresh)} />
      <SpikeLog lines={lines} />
    </Screen>
  );
}
