import {
  formatBookingWhen, formatInr, REQUEST_TIMEOUT_SECONDS, requestProgress, secondsRemaining, type RequestEconomics,
} from "@handyfix/shared";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { Modal, Vibration, View } from "react-native";
import { Text } from "@/components/text";
import { Button, ErrorBanner } from "@/components/ui";
import { serviceNameOf, type ProviderBooking } from "./api";

const VIBRATION = [0, 600, 400, 600, 400];

/**
 * The full-screen new-request alert (PDF p.7): looping ring, 30 s countdown, what you earn and the fee BEFORE you
 * decide, one Accept and one Decline. The countdown runs from when the booking was created on the server.
 */
export function RequestAlert({
  request, economics, blockedMessage, busy, error, onAccept, onDecline, onExpire,
}: {
  request: ProviderBooking;
  economics: RequestEconomics;
  /** Set when the wallet cannot cover the fee: Accept is replaced by the top-up message. */
  blockedMessage: string | null;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onExpire: () => void;
}) {
  const player = useAudioPlayer(require("../../../assets/sounds/new_request.wav"));
  const createdAt = useRef(request.created_at ? new Date(request.created_at) : new Date());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    try {
      player.loop = true;
      player.seekTo(0);
      player.play();
    } catch {
      /* some browsers block autoplay; the vibration and the screen still alert */
    }
    Vibration.vibrate(VIBRATION, true);
    const id = setInterval(() => setNow(new Date()), 250);
    return () => {
      clearInterval(id);
      try { player.pause(); } catch { /* already released */ }
      Vibration.cancel();
    };
  }, [player]);

  const left = secondsRemaining(createdAt.current, now);
  useEffect(() => {
    if (left === 0) onExpire();
  }, [left, onExpire]);

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onDecline}>
      <View className="flex-1 justify-between bg-canvas p-6 pt-16">
        <View className="items-center gap-3">
          <Text className="text-xs font-semibold uppercase tracking-[4px] text-brand">New request</Text>
          <View accessibilityLabel={`${left} seconds left`} className="h-40 w-40 items-center justify-center rounded-full border-8 border-brand">
            <Text className="text-6xl font-bold text-fg">{left}</Text>
          </View>
          <View className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <View className="h-full bg-brand" style={{ width: `${requestProgress(createdAt.current, now) * 100}%` }} />
          </View>
          <Text className="mt-2 text-2xl font-semibold text-fg">{serviceNameOf(request)}</Text>
          <Text className="text-sm text-muted">
            {formatBookingWhen(request.booking_date, request.booking_time)} · {request.city ?? "Nearby"} · {REQUEST_TIMEOUT_SECONDS}s to accept
          </Text>
          <View className="mt-4 w-full gap-2 rounded-2xl border border-line bg-card p-4">
            <Row label="You earn" value={formatInr(economics.earning)} strong />
            <Row label="HandyFix fee" value={economics.feeWaived ? `${formatInr(economics.fee)} waived` : formatInr(economics.fee)} />
            <View className="my-1 h-px bg-line" />
            <Row label="You keep" value={formatInr(economics.youKeep)} />
          </View>
        </View>
        <View className="gap-3">
          <ErrorBanner message={error ?? blockedMessage} />
          <Button label="Accept" loading={busy} disabled={!!blockedMessage} onPress={onAccept} />
          <Button label="Decline" variant="secondary" disabled={busy} onPress={onDecline} />
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
