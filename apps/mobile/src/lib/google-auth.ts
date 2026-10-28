/**
 * Native Google sign-in → Supabase session. The native module is imported lazily so web previews
 * and screens that never sign in with Google don't load it. On web there is no native module, so the
 * browser is sent through Supabase's Google redirect instead and the session is read from the URL on return.
 */
import { friendlyAuthError } from "@handyfix/shared";
import { Platform } from "react-native";
import { env } from "./env";
import { getSupabase } from "./supabase";

export type GoogleResult =
  | { status: "signed_in"; email: string | null }
  | { status: "cancelled" }
  | { status: "redirecting" };

async function signInWithGoogleOnWeb(): Promise<GoogleResult> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: globalThis.location?.origin },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  return { status: "redirecting" };
}

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (Platform.OS === "web") return signInWithGoogleOnWeb();
  if (!env.googleWebClientId) throw new Error("Google sign-in is not configured yet.");
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = await import("@react-native-google-signin/google-signin");
  try {
    GoogleSignin.configure({ webClientId: env.googleWebClientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { status: "cancelled" };
    const idToken = response.data.idToken;
    if (!idToken) throw new Error("Google did not return an identity token. Check the web client id.");
    const { data, error } = await getSupabase().auth.signInWithIdToken({ provider: "google", token: idToken });
    if (error) throw error;
    return { status: "signed_in", email: data.user?.email ?? null };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return { status: "cancelled" };
    throw new Error(friendlyAuthError(e instanceof Error ? e.message : String(e)));
  }
}

export async function googleSignOut(): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
    await GoogleSignin.signOut();
  } catch {
    /* not signed in with Google, or not available on this platform */
  }
}
