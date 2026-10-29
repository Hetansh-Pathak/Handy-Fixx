import { isExpoPushToken } from "@handyfix/shared";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { env } from "@/lib/env";
import { ensurePushChannels, hasNotificationPermission } from "@/lib/notifications";
import { getSupabase } from "@/lib/supabase";

export type PushRegistration = "registered" | "denied" | "unavailable";

let current: string | null = null;

/**
 * Tells HandyFix which phone to send alerts to when the app is closed (proposal 20261120 + the notify-push function).
 * Best effort and quiet: it does nothing on the web, without Firebase set up in the build, before the database proposal is
 * applied, or without the person's permission. It can never stop the app or a booking. `ask` decides whether the system
 * permission prompt may be shown now (a pro: yes; a customer: only after their first booking, see book screen).
 */
export async function registerPush(role: "customer" | "provider", opts: { ask: boolean }): Promise<PushRegistration> {
  if (Platform.OS === "web") return "unavailable";
  try {
    const projectId = env.easProjectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return "unavailable";
    if (!(await hasNotificationPermission(opts.ask))) return "denied";
    await ensurePushChannels(role);
    // Throws when the build has no Firebase file (google-services.json): then push is simply unavailable.
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!isExpoPushToken(data)) return "unavailable";
    const { error } = await getSupabase().rpc("register_push_token", { p_token: data, p_role: role, p_platform: Platform.OS });
    if (error) return "unavailable"; // the database proposal is not applied yet, or this account cannot register as that role
    current = data;
    return "registered";
  } catch {
    return "unavailable";
  }
}

/** Stops alerts for this phone (call before signing out, while the sign-in still works). Never throws. */
export async function unregisterPush(): Promise<void> {
  const token = current;
  current = null;
  if (!token) return;
  try {
    await getSupabase().rpc("unregister_push_token", { p_token: token });
  } catch {
    /* signing out must never fail because of this */
  }
}
