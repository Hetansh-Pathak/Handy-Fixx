import {
  checkCanAccept, feeForServiceBill, formatInr, REQUEST_TIMEOUT_SECONDS, requestProgress, secondsRemaining,
} from "@handyfix/shared";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Modal, Vibration, View } from "react-native";
import { Text } from "@/components/text";
import { Button } from "../ui";

const RATE = 349; // demo: leak repair at ₹349
const VIBRATION = [0, 600, 400, 600, 400];

/**
 * Tier A of the new-request alert: when the app is open, take over the whole screen, ring on
 * a loop and count down 30 s, using the same rules the real provider flow will use.
 */
export function RequestAlertModal({
  visible, onAccept, onDecline, onExpire, walletBalance, launchActive,
}: {
  visible: boolean; onAccept: () => void; onDecline: () => void; onExpire: () => void;
  walletBalance: number; launchActive: boolean;
}) {
  const player = useAudioPlayer(require("../../../assets/sounds/new_request.wav"));
  const sentAt = useRef(new Date());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!visible) return;
    sentAt.current = new Date();
    setNow(new Date());
    void setAudioModeAsync({ playsInSilentMode: true });
    player.loop = true;
    player.seekTo(0);
    player.play();
    Vibration.vibrate(VIBRATION, true);
    const id = setInterval(() => setNow(new Date()), 250);
    return () => {
      clearInterval(id);
      player.pause();
      Vibration.cancel();
    };
  }, [visible, player]);

  const left = secondsRemaining(sentAt.current, now);
  useEffect(() => {
    if (visible && left === 0) onExpire();
  }, [visible, left, onExpire]);

  const fee = feeForServiceBill(RATE);
  const accept = checkCanAccept({ wallet: { balance: walletBalance, due: 0 }, estimatedServiceBill: RATE, launchActive });

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View className="flex-1 justify-between bg-canvas p-6 pt-16">
        <View className="items-center gap-3">
          <Text className="text-xs font-semibold uppercase tracking-[4px] text-brand">New request</Text>
          <View className="h-40 w-40 items-center justify-center rounded-full border-8 border-brand">
            <Text className="text-6xl font-bold text-fg">{left}</Text>
          </View>
          <View className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <View className="h-full bg-brand" style={{ width: `${requestProgress(sentAt.current, now) * 100}%` }} />
          </View>
          <Text className="mt-2 text-2xl font-semibold text-fg">Plumbing · Leak repair</Text>
          <Text className="text-sm text-muted">Today · 5:00 PM · 2.4 km away · {REQUEST_TIMEOUT_SECONDS}s to accept</Text>
          <View className="mt-4 w-full gap-2 rounded-tile border border-line bg-card p-4">
            <Row label="You earn" value={formatInr(RATE)} strong />
            <Row label="HandyFix fee" value={launchActive ? `${formatInr(fee)} waived` : formatInr(fee)} />
          </View>
        </View>
        <View className="gap-3">
          {accept.ok ? null : (
            <Text className="text-center text-sm text-danger">Wallet too low. Recharge {formatInr(accept.suggestedTopUp)} to accept.</Text>
          )}
          <Button label={accept.ok ? "Accept" : `Recharge ${formatInr(accept.suggestedTopUp)} to accept`} onPress={onAccept} disabled={!accept.ok} />
          <Button label="Decline" variant="secondary" onPress={onDecline} />
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-base text-muted">{label}</Text>
      <Text className={`text-base ${strong ? "font-bold text-brand" : "text-fg"}`}>{value}</Text>
    </View>
  );
}
