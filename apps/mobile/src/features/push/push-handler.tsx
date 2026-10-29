import { pushTarget } from "@handyfix/shared";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useSession } from "@/features/auth/session-provider";
import { configureNotificationHandler } from "@/lib/notifications";
import { registerPush } from "@/lib/push";

// A tap is handled once even if both the "launched by tap" check and the live listener see it.
const handled = new Set<string>();

/**
 * Mounted once when someone is signed in. It (1) registers this phone for alerts, (2) shows alerts that arrive while the
 * app is open, and (3) opens the right booking when an alert is tapped, including when the tap started the app from closed.
 * The Pro app's request popup keeps its own live listener (provider-runtime), so for pros this handles only the
 * "launched by a tap" case; customers are handled here for both.
 */
export function PushHandler() {
  const router = useRouter();
  const { role, userId } = useSession();

  useEffect(() => {
    if (Platform.OS === "web") return;
    configureNotificationHandler();
  }, []);

  // A pro is asked for permission right away (they need request alerts); a customer is asked after their first booking.
  useEffect(() => {
    if (Platform.OS === "web" || !role || !userId) return;
    void registerPush(role, { ask: role === "provider" });
  }, [role, userId]);

  useEffect(() => {
    if (Platform.OS === "web" || !role) return;
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      const target = pushTarget(response.notification.request.content.data);
      if (!target || target.audience !== role) return;
      handled.add(id);
      router.push(target.audience === "provider"
        ? { pathname: "/provider/job/[id]", params: { id: target.bookingId } }
        : { pathname: "/customer/booking/[id]", params: { id: target.bookingId } });
    };
    // The tap that launched the app from closed.
    void Notifications.getLastNotificationResponseAsync().then((r) => { if (r) open(r); }).catch(() => undefined);
    // Later taps: customers here; pros are handled by the request popup's listener, which also clears its banner.
    if (role !== "customer") return;
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [role, router]);

  return null;
}
