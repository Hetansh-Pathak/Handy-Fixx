import {
  elapsedLabel, etaLine, formatInr, formatRating, foundBadge, matchSeconds, notifiedLine, searchElapsedSeconds, searchStatusText, stageChips,
  type SearchSnapshot,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BadgeCheck, MessageCircle, Navigation } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Glass } from "@/components/glass";
import { ScreenBackground } from "@/components/screen-background";
import { Text } from "@/components/text";
import { Button, ErrorBanner, StatusPill, TextLink } from "@/components/ui";
import { fetchBooking } from "@/features/customer/booking-api";
import { cancelSearch, fetchSearch, keepLooking, searchKey } from "@/features/dispatch/api";
import { FindingMap } from "@/features/dispatch/FindingMap";
import { useThemeColors } from "@/theme/theme";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "★";

/**
 * "Finding your pro" (instant dispatch, owner decision 2026-10-31). The search runs on the server (pg_cron), so this
 * screen only reads it: every 2 s while searching. Closing the app loses nothing: reopening the booking comes back here.
 */
export default function FindingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receivedAt, setReceivedAt] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "extend" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const search = useQuery({
    queryKey: searchKey(id ?? ""),
    enabled: !!id,
    queryFn: async () => { const s = await fetchSearch(id!); setReceivedAt(new Date()); return s; },
    refetchInterval: (q) => (q.state.data?.state === "searching" ? 2000 : false),
  });
  const booking = useQuery({ queryKey: ["booking", id], enabled: !!id, queryFn: () => fetchBooking(id!) });

  const s = search.data;
  const searching = s?.state === "searching";
  useEffect(() => {
    if (!searching) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [searching]);

  // Screen readers hear every change of the status line once.
  const status = s ? sheetStatus(s) : "";
  const lastSaid = useRef("");
  useEffect(() => {
    if (status && status !== lastSaid.current) {
      lastSaid.current = status;
      AccessibilityInfo.announceForAccessibility(status);
    }
  }, [status]);

  const b = booking.data?.booking;
  const customer = b?.latitude != null && b?.longitude != null ? { latitude: Number(b.latitude), longitude: Number(b.longitude) } : null;
  const serviceName = b?.sub_item_name ?? booking.data?.serviceName ?? "Your service";
  const area = [b?.city, b?.pincode].filter(Boolean).join(", ");
  const price = Number(b?.total_amount ?? 0);

  const cancel = async () => {
    if (!id) return;
    setBusy("cancel");
    setError(null);
    try {
      const r = await cancelSearch(id);
      if (r.result === "assigned") setError(r.message ?? "A pro already accepted.");
      await search.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel. Try again.");
    } finally {
      setBusy(null);
      setConfirmingCancel(false);
    }
  };
  const extend = async () => {
    if (!id) return;
    setBusy("extend");
    setError(null);
    try {
      const fresh = await keepLooking(id);
      setReceivedAt(new Date());
      queryClient.setQueryData(searchKey(id), fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not keep looking. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const track = () => id && router.replace({ pathname: "/customer/booking/[id]", params: { id } });
  const scheduleLater = () => {
    const slug = booking.data?.serviceSlug;
    if (!slug) return router.replace("/customer");
    router.replace({ pathname: "/customer/request/new", params: { service: slug, when: "later", ...(b?.sub_item_id ? { sub: b.sub_item_id } : {}) } });
  };

  const mode = s?.state === "assigned" ? "found" : s?.state === "no_pro" ? "no_pro" : "searching";
  const proDot = mode === "found" ? s?.dots[0]?.point ?? null : null;
  const eta = customer ? etaLine(customer, proDot) : null;
  const elapsed = s ? searchElapsedSeconds(s, now, receivedAt) : 0;

  return (
    <ScreenBackground>
      {s && customer ? (
        <FindingMap settings={s.settings} customer={customer} dots={s.dots} mode={mode} proInitials={s.pro ? initials(s.pro.name) : undefined} etaText={eta} />
      ) : null}
      <SafeAreaView className="flex-1 justify-end" edges={["top", "bottom"]}>
        <Glass tone="sheet" intensity={40} className="mx-3 mb-2 gap-3 rounded-hero border border-line p-5">
          <ErrorBanner message={error ?? (search.isError ? "Could not load your search. Check your connection." : null)} />
          {!s ? <Text className="text-base text-muted">Loading your search…</Text> : null}

          {s && mode === "searching" ? (
            <>
              <View className="flex-row items-center justify-between gap-3">
                <Text accessibilityRole="header" className="text-2xl font-extrabold text-fg">Finding your pro</Text>
                <StatusPill label={elapsedLabel(elapsed)} tone="brand" />
              </View>
              <View className="flex-row items-center" accessibilityLiveRegion="polite" accessibilityLabel={status}>
                <Text className="text-base font-semibold text-brand">{status}</Text>
                <Dots color={colors.brand} />
              </View>
              <View className="flex-row gap-2">
                {stageChips(s.settings, s.ring).map((c) => (
                  <View key={c.label} accessibilityLabel={`${c.label}: ${c.state === "done" ? "done" : c.state === "active" ? "now" : "next"}`}
                    className={`flex-1 items-center rounded-full border px-2 py-1.5 ${c.state === "active" ? "border-brand bg-brand-soft" : c.state === "done" ? "border-ok/40 bg-ok-bg" : "border-line bg-card"}`}>
                    <Text className={`text-xs font-bold ${c.state === "active" ? "text-brand" : c.state === "done" ? "text-ok" : "text-muted"}`}>{c.state === "done" ? `✓ ${c.label}` : c.label}</Text>
                  </View>
                ))}
              </View>
              <ServiceCard name={serviceName} area={area} price={price} />
              <Text className="text-sm text-muted">{notifiedLine(s.notified)}</Text>
              {!confirmingCancel ? <Button label="Cancel request" variant="secondary" onPress={() => setConfirmingCancel(true)} /> : (
                <View className="gap-2">
                  <Text className="text-base text-fg">Cancel this request? It is free: no pro has accepted yet.</Text>
                  <Button label="Yes, cancel request" variant="danger" loading={busy === "cancel"} onPress={() => void cancel()} />
                  <Button label="Keep looking" variant="secondary" onPress={() => setConfirmingCancel(false)} />
                </View>
              )}
            </>
          ) : null}

          {s && mode === "found" && s.pro ? (
            <>
              <View className="flex-row items-center justify-between gap-3">
                <Text accessibilityRole="header" className="text-2xl font-extrabold text-fg">Pro found</Text>
                {matchSeconds(s) ? <StatusPill label={foundBadge(matchSeconds(s)!)} tone="ok" /> : null}
              </View>
              <View className="flex-row items-center gap-3 rounded-panel border border-line bg-card p-4">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
                  <Text className="text-base font-extrabold" style={{ color: colors.onAccent }}>{initials(s.pro.name)}</Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1">
                    <Text className="flex-shrink text-lg font-bold text-fg">{s.pro.name}</Text>
                    {s.pro.verified ? <BadgeCheck size={18} color={colors.brand} accessibilityLabel="Verified" /> : null}
                  </View>
                  <Text className="text-sm text-muted">★ {formatRating(s.pro.rating)} · {s.pro.jobs} jobs{eta ? ` · ${eta}` : ""}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xl font-extrabold text-price">{formatInr(price)}</Text>
                  <Text className="text-xs text-muted">locked</Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1"><Button label="Message" variant="secondary" icon={MessageCircle} onPress={() => id && router.push({ pathname: "/customer/chat/[bookingId]", params: { bookingId: id } })} /></View>
                <View className="flex-1"><Button label={`Track ${s.pro.name.split(" ")[0]}`} icon={Navigation} onPress={track} /></View>
              </View>
            </>
          ) : null}

          {s && mode === "no_pro" ? (
            <>
              <Text accessibilityRole="header" className="text-2xl font-extrabold text-fg">No pro available right now</Text>
              <Text className="text-base text-muted" accessibilityLiveRegion="polite">We will notify you the moment a pro accepts.</Text>
              <ServiceCard name={serviceName} area={area} price={price} />
              <Button label="Keep looking for 10 more minutes" loading={busy === "extend"} onPress={() => void extend()} />
              <Button label="Schedule for later" variant="secondary" onPress={scheduleLater} />
              <Button label="Cancel request" variant="secondary" loading={busy === "cancel"} onPress={() => void cancel()} />
            </>
          ) : null}

          {s && s.state === "cancelled" ? (
            <>
              <Text accessibilityRole="header" className="text-2xl font-extrabold text-fg">Request cancelled</Text>
              <Text className="text-base text-muted">Nothing was charged.</Text>
              <Button label="Back to home" onPress={() => router.replace("/customer")} />
            </>
          ) : null}

          {s && s.state === null ? (
            <>
              <Text className="text-base text-muted">This booking is not a search.</Text>
              <TextLink label="Open the booking" onPress={track} />
            </>
          ) : null}
        </Glass>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function sheetStatus(s: SearchSnapshot): string {
  if (s.state === "searching") return searchStatusText(s.settings, s.ring);
  if (s.state === "assigned") return s.pro ? `${s.pro.name} accepted your job` : "A pro accepted your job";
  if (s.state === "no_pro") return "No pro available right now";
  if (s.state === "cancelled") return "Request cancelled";
  return "";
}

function ServiceCard({ name, area, price }: { name: string; area: string; price: number }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-panel border border-line bg-card p-3">
      <View className="flex-1">
        <Text className="text-base font-semibold text-fg" numberOfLines={1}>{name}</Text>
        {area ? <Text className="text-xs text-muted" numberOfLines={1}>{area}</Text> : null}
      </View>
      <View className="items-end">
        <Text className="text-lg font-extrabold text-price">{formatInr(price)}</Text>
        <Text className="text-xs text-ok">₹0 platform fee</Text>
      </View>
    </View>
  );
}

/** Three dots after the status line, appearing one by one (still with reduce-motion). */
function Dots({ color }: { color: string }) {
  const still = useReducedMotion();
  return (
    <View className="ml-1 flex-row gap-0.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => <Dot key={i} index={i} color={color} still={still} />)}
    </View>
  );
}

function Dot({ index, color, still }: { index: number; color: string; still: boolean }) {
  const o = useSharedValue(still ? 1 : 0.2);
  useEffect(() => {
    if (still) return;
    o.value = withDelay(index * 200, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.2, { duration: 400 })), -1, false));
    return () => cancelAnimation(o);
  }, [o, index, still]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }, style]} />;
}
