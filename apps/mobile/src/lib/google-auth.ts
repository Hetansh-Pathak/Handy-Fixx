/**
 * Native Google sign-in → Supabase session. The native module is imported lazily so web previews
 * and screens that never sign in with Google don't load it.
 */
import { friendlyAuthError } from "@handyfix/shared";
import { env } from "./env";
import { getSupabase } from "./supabase";

export type GoogleResult = { status: "signed_in"; email: string | null } | { status: "cancelled" };

export async function signInWithGoogle(): Promise<GoogleResult> {
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
    const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
    await GoogleSignin.signOut();
  } catch {
    /* not signed in with Google, or not available on this platform */
  }
}
