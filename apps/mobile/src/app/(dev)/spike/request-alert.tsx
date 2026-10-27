import * as Notifications from "expo-notifications";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { RequestAlertModal } from "@/components/spike/RequestAlertModal";
import { SpikeLog, useSpikeLog } from "@/components/spike/useSpikeLog";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { configureNotificationHandler, ensureRequestChannel, REQUEST_CHANNEL } from "@/lib/notifications";

export default function RequestAlertCheck() {
  const { lines, log } = useSpikeLog();
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState(240);
  const [launch, setLaunch] = useState(false);

  const close = useCallback((why: string) => { setOpen(false); log(why); }, [log]);

  const scheduleBackground = async () => {
    configureNotificationHandler();
    const perm = await Notifications.requestPermissionsAsync();
    log(`Notification permission: ${perm.status}`, perm.granted ? "ok" : "fail");
    if (!perm.granted) return;
    await ensureRequestChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "New request · Leak repair",
        body: "You earn ₹349 · 2.4 km away · accept within 30 s",
        sound: "new_request.wav",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { kind: "new_request" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: REQUEST_CHANNEL },
    });
    log("Scheduled in 10 s. Now LOCK the phone (or press Home) and wait.", "ok");
  };

  return (
    <Screen>
      <Title>New-request alert</Title>
      <Body muted>
        Tier A (app open): full-screen takeover, looping ring, 30 s countdown.{"\n"}
        Tier B (app in background or phone locked): a notification on a MAX-importance channel with the custom sound.
        A true lock-screen takeover (full-screen intent) is not part of this check: Google Play only grants it by
        default to calling and alarm apps.
      </Body>
      <Card>
        <Body>Demo wallet: ₹{wallet}  ·  Launch period: {launch ? "on (fee waived)" : "off"}</Body>
        <Button label={wallet >= 15 ? "Set wallet to ₹0 (blocked state)" : "Set wallet to ₹240"} variant="secondary" onPress={() => setWallet(wallet >= 15 ? 0 : 240)} />
        <Button label={launch ? "Launch period: turn off" : "Launch period: turn on"} variant="secondary" onPress={() => setLaunch(!launch)} />
      </Card>
      <Button label="A. Simulate request now (app open)" onPress={() => { log("Alert shown."); setOpen(true); }} />
      <Button label="B. Send request notification in 10 s" variant="secondary" onPress={() => void scheduleBackground()} />
      <Button label="Open app notification settings" variant="secondary" onPress={() => void Linking.openSettings()} />
      <SpikeLog lines={lines} />
      <RequestAlertModal
        visible={open}
        walletBalance={wallet}
        launchActive={launch}
        onAccept={() => close("Accepted.")}
        onDecline={() => close("Declined (₹0, customer is offered the next pros).")}
        onExpire={() => close("Timed out after 30 s (customer is offered the next pros).")}
      />
    </Screen>
  );
}
