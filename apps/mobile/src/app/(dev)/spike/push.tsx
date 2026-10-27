import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Share } from "react-native";
import { SpikeLog, useSpikeLog } from "@/components/spike/useSpikeLog";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { env } from "@/lib/env";
import { configureNotificationHandler, ensureRequestChannel } from "@/lib/notifications";

export default function PushCheck() {
  const { lines, log } = useSpikeLog();
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [expoToken, setExpoToken] = useState<string | null>(null);

  useEffect(() => {
    configureNotificationHandler();
    const received = Notifications.addNotificationReceivedListener((n) =>
      log(`Received while open: "${n.request.content.title}"`, "ok"));
    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      log(`Tapped: "${r.notification.request.content.title}" data=${JSON.stringify(r.notification.request.content.data)}`, "ok"));
    return () => { received.remove(); tapped.remove(); };
  }, [log]);

  const register = async () => {
    try {
      if (!Device.isDevice) throw new Error("Push needs a real device (not an emulator without Google Play).");
      await ensureRequestChannel();
      const perm = await Notifications.requestPermissionsAsync();
      log(`Notification permission: ${perm.status}`, perm.granted ? "ok" : "fail");
      if (!perm.granted) return;

      // The raw FCM registration token: proves FCM is wired (google-services.json + Firebase).
      const device = await Notifications.getDevicePushTokenAsync();
      setDeviceToken(String(device.data));
      log(`FCM device token (${device.type}) obtained.`, "ok");

      // Expo push token: only if you send through Expo's push service (needs an EAS project id).
      const projectId = env.easProjectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (projectId) {
        const expo = await Notifications.getExpoPushTokenAsync({ projectId });
        setExpoToken(expo.data);
        log("Expo push token obtained.", "ok");
      } else {
        log("No EAS project id: skipped the Expo push token (fine if you send via FCM directly).");
      }
    } catch (e) {
      log(e instanceof Error ? `${e.name}: ${e.message}` : String(e), "fail");
    }
  };

  const localTest = async () => {
    await Notifications.scheduleNotificationAsync({
      content: { title: "Local test", body: "Delivered by the app itself (no FCM involved)." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
    });
    log("Local notification in 3 s.");
  };

  return (
    <Screen>
      <Title>Push (FCM)</Title>
      <Body muted>
        PASS = permission granted, FCM token shown, and a push sent from the Firebase console to that token
        arrives with the app closed, and tapping it opens the app.
      </Body>
      <Button label="Register for push" onPress={() => void register()} />
      <Button label="Local test notification" variant="secondary" onPress={() => void localTest()} />
      {deviceToken ? (
        <Card>
          <Body muted>FCM device token</Body>
          <Body>{deviceToken.slice(0, 40)}…</Body>
          <Button label="Share full token" variant="secondary" onPress={() => void Share.share({ message: deviceToken })} />
        </Card>
      ) : null}
      {expoToken ? <Card><Body muted>Expo push token</Body><Body>{expoToken}</Body></Card> : null}
      <SpikeLog lines={lines} />
    </Screen>
  );
}
