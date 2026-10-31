import { formatInr, offerCardAccess, offerView, offerWhenLine, offerWhereLine, type AcceptOutcome } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { BellRing, CircleCheck, Clock, MapPin, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Vibration, View } from "react-native";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { Button, ErrorBanner } from "@/components/ui";
import { useThemeColors } from "@/theme/theme";
import { acceptOffer, fetchOfferCard, offerCardKey } from "./pro-api";

const VIBRATION = [0, 500, 400, 500, 400];

/**
 * A new instant-dispatch offer, full screen, with the request sound until the pro decides (owner decision 2026-10-31).
 * No countdown: the offer stays open until someone accepts or the search ends. The pro sees the job, "about N km away",
 * the area, the earning and the fee, never the customer's exact address or phone. One primary button: Accept (or
 * "Top up ₹X to accept" when the wallet is short). "Later" closes the alert; the offer stays in Jobs → New.
 */
export function OfferAlert({ bookingId, more, onAccepted, onRecharge, onClose }: {
  bookingId: string;
  /** Other offers waiting behind this one. */
  more: number;
  onAccepted: (bookingId: string) => void;
  onRecharge: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const card = useQuery({
    queryKey: offerCardKey(bookingId),
    queryFn: () => fetchOfferCard(bookingId),
    // While it is open, re-read it so "Taken by another pro" / "Expired" show up without a tap.
    refetchInterval: (q) => (q.state.data?.status === "offered" ? 3000 : false),
  });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = card.data?.status === "offered" && outcome === null;
  const player = useAudioPlayer(require("../../../assets/sounds/new_request.wav"));
  useEffect(() => {
    if (!open || Platform.OS === "web") return;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    player.loop = true;
    player.seekTo(0);
    player.play();
    Vibration.vibrate(VIBRATION, true);
    return () => { player.pause(); Vibration.cancel(); };
  }, [open, player]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await acceptOffer(bookingId);
      setOutcome(r);
      if (r.kind === "accepted") onAccepted(r.bookingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const c = card.data;
  const view = c ? offerView(outcome?.kind === "closed" ? outcome.status : c.status, offerCardAccess(c)) : null;
  const closedMessage = outcome?.kind === "closed" ? outcome.message : view && "message" in view ? view.message : null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <ScreenBackground>
        <View className="flex-1 justify-center p-5" accessibilityViewIsModal>
          <View className="gap-4 overflow-hidden rounded-hero border border-line p-6" style={{ zIndex: 0 }}>
            <Glass tone="sheet" intensity={50} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
            <View className="items-center gap-2">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-brand">
                {outcome?.kind === "accepted" ? <CircleCheck size={30} color={colors.onBrand} /> : <BellRing size={30} color={colors.onBrand} />}
              </View>
              <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-[3px] text-brand">
                New job near you{more > 0 ? ` · +${more} more` : ""}
              </Text>
              <Text className="text-center text-3xl font-extrabold text-fg">{c?.serviceName ?? "Loading…"}</Text>
            </View>
            <ErrorBanner message={error ?? (card.isError ? "Could not load this job." : null)} />

            {c ? (
              <>
                <View className="gap-2">
                  <View className="flex-row items-center gap-2"><MapPin size={18} color={colors.brand} /><Text className="flex-1 text-base text-fg">{offerWhereLine(c)}</Text></View>
                  <View className="flex-row items-center gap-2"><Clock size={18} color={colors.brand} /><Text className="flex-1 text-base text-fg">{offerWhenLine(c, new Date())}</Text></View>
                  {c.note ? <Text className="rounded-tile bg-field p-3 text-sm text-fg" numberOfLines={3}>“{c.note}”</Text> : null}
                </View>
                <View className="gap-2 rounded-panel bg-tint p-4">
                  <View className="items-center">
                    <Text className="text-sm font-semibold text-tint-fg">You earn</Text>
                    <Text className="text-4xl font-extrabold text-price">{formatInr(c.price)}</Text>
                  </View>
                  <View className="flex-row justify-between border-t border-line pt-2">
                    <Text className="text-sm text-muted">HandyFix fee</Text>
                    <Text className="text-sm text-fg">{c.launchActive ? `${formatInr(c.fee)} waived` : formatInr(c.fee)}</Text>
                  </View>
                </View>
              </>
            ) : null}

            {outcome?.kind === "accepted" ? (
              <Text className="text-center text-lg font-bold text-ok">Accepted. The job is yours.</Text>
            ) : closedMessage ? (
              <View className="gap-2">
                <Text accessibilityLiveRegion="polite" className="text-center text-lg font-bold text-fg">{closedMessage}</Text>
                <Button label="OK" onPress={onClose} />
              </View>
            ) : outcome?.kind === "top_up" || outcome?.kind === "refused" ? (
              <View className="gap-2">
                <Text accessibilityLiveRegion="polite" className="text-center text-base text-fg">{outcome.message}</Text>
                {outcome.kind === "top_up" ? <Button label="Recharge wallet" icon={Wallet} onPress={onRecharge} /> : null}
                <Button label="Later" variant="secondary" onPress={onClose} />
              </View>
            ) : view?.kind === "top_up" ? (
              <View className="gap-2">
                <Text className="text-center text-sm text-muted">{view.feeLine}</Text>
                <Button label={view.button} icon={Wallet} onPress={onRecharge} />
                <Button label="Later" variant="secondary" onPress={onClose} />
              </View>
            ) : view?.kind === "accept" ? (
              <View className="gap-2">
                <Button label="Accept" loading={busy} onPress={() => void accept()} />
                <Button label="Later" variant="secondary" disabled={busy} onPress={onClose} />
                <Text className="text-center text-xs text-muted">No timer. The first pro to accept gets the job. Declining costs ₹0.</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScreenBackground>
    </Modal>
  );
}
