import { notificationKind, notificationTarget, relativeTime, type NotificationKind, type NotificationRow } from "@handyfix/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell, CalendarCheck, CircleAlert, CircleCheck, IndianRupee, MessageCircle, ShieldCheck, Star, XCircle, type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, ErrorBanner, Screen, ScreenHeader, TextLink, ListSkeleton } from "@/components/ui";
import { colors } from "@/theme/colors";
import { markAllNotificationsRead, markNotificationRead, notificationsKey, type NotifRole } from "./api";
import { useNotifications } from "./use-notifications";

const ICON: Record<NotificationKind, { icon: LucideIcon; color: string }> = {
  booking: { icon: CalendarCheck, color: colors.brand },
  done: { icon: CircleCheck, color: colors.ok },
  cancelled: { icon: XCircle, color: colors.danger },
  message: { icon: MessageCircle, color: colors.brand },
  review: { icon: Star, color: colors.sun },
  identity: { icon: ShieldCheck, color: colors.brand },
  money: { icon: IndianRupee, color: colors.ok },
  dispute: { icon: CircleAlert, color: colors.danger },
  info: { icon: Bell, color: colors.muted },
};

/** The bell on the home screens. A dot with a number when something is unread. */
export function NotificationBell({ role }: { role: NotifRole }) {
  const router = useRouter();
  const { unread } = useNotifications(role);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      onPress={() => router.push(`/${role}/notifications`)} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center">
      <Bell size={24} color={colors.fg} />
      {unread > 0 ? (
        <View className="absolute right-0 top-1 min-w-[18px] items-center rounded-full bg-brand px-1">
          <Text className="text-[11px] font-bold text-white">{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function NotificationsScreen({ role }: { role: NotifRole }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useNotifications(role);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace(role === "customer" ? "/customer" : "/provider"));

  const refresh = () => (list.ownerId ? queryClient.invalidateQueries({ queryKey: notificationsKey(role, list.ownerId) }) : Promise.resolve());

  const open = async (n: NotificationRow) => {
    if (!n.is_read) { await markNotificationRead(role, n.id).catch(() => undefined); void refresh(); }
    const target = notificationTarget(n, role);
    if (target) router.push(target as never);
  };

  const readAll = async () => {
    if (!list.ownerId) return;
    setBusy(true);
    setError(null);
    try { await markAllNotificationsRead(role, list.ownerId); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not mark them as read."); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScreenHeader title="Notifications" onBack={back} />
      <ErrorBanner message={error ?? (list.isError ? "Could not load your notifications. Check your internet." : null)} />
      {list.isError ? <Button label="Try again" variant="secondary" onPress={() => void list.refetch()} /> : null}
      {list.isPending && !list.isError ? <ListSkeleton /> : null}
      {list.isSuccess && list.data.length === 0 ? (
        <View className="items-center gap-2 py-16">
          <Bell size={40} color={colors.mutedSoft} />
          <Text className="text-lg font-semibold text-fg">You are all caught up</Text>
          <Text className="text-center text-base text-muted">Updates about your bookings will show up here.</Text>
        </View>
      ) : null}
      {list.unread > 0 ? <TextLink label={busy ? "Marking…" : `Mark all ${list.unread} as read`} onPress={() => void readAll()} /> : null}
      <View className="gap-2">
        {(list.data ?? []).map((n) => {
          const { icon: Icon, color } = ICON[notificationKind(n.type)];
          return (
            <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.is_read ? "" : "Unread. "}${n.title}. ${n.message}`}
              onPress={() => void open(n)}
              className={`flex-row items-start gap-3 rounded-2xl border p-4 active:opacity-80 ${n.is_read ? "border-line bg-card" : "border-brand/40 bg-brand-soft"}`}>
              <View className="mt-0.5"><Icon size={22} color={color} /></View>
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-semibold text-fg">{n.title}</Text>
                <Text className="text-sm text-muted">{n.message}</Text>
                <Text className="text-xs text-muted">{relativeTime(n.created_at, new Date())}</Text>
              </View>
              {!n.is_read ? <View className="mt-2 h-2.5 w-2.5 rounded-full bg-brand" /> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
