import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { useState } from "react";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { SpikeLog, useSpikeLog } from "@/components/spike/useSpikeLog";
import { env } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

export default function GoogleCheck() {
  const { lines, log } = useSpikeLog();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      if (!env.googleWebClientId) throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set.");
      GoogleSignin.configure({ webClientId: env.googleWebClientId });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) { log("Cancelled by the user."); return; }
      const idToken = response.data.idToken;
      if (!idToken) throw new Error("Google returned no idToken (check the web client id).");
      log("Google account chosen, got idToken.", "ok");
      const { data, error } = await getSupabase().auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) throw error;
      setEmail(data.user?.email ?? "(no email)");
      log(`Supabase session created for ${data.user?.email}`, "ok");
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) log("Cancelled by the user.");
      else log(e instanceof Error ? `${e.name}: ${e.message}` : String(e), "fail");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await GoogleSignin.signOut().catch(() => undefined);
    await getSupabase().auth.signOut();
    setEmail(null);
    log("Signed out.");
  };

  return (
    <Screen>
      <Title>Google sign-in</Title>
      <Body muted>
        PASS = the native Google account sheet opens (no browser), and a Supabase session is created.
        Needs the Google provider enabled in Supabase with the same web client id.
      </Body>
      <Card><Body>{email ? `Signed in as ${email}` : "Not signed in"}</Body></Card>
      <Button label="Sign in with Google" loading={busy} onPress={() => void signIn()} />
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
      <SpikeLog lines={lines} />
    </Screen>
  );
}
