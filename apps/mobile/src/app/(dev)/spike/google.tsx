import { useState } from "react";
import { Body, Button, Card, Screen, Title } from "@/components/ui";
import { SpikeLog, useSpikeLog } from "@/components/spike/useSpikeLog";
import { getSupabase } from "@/lib/supabase";
import { googleSignOut, signInWithGoogle } from "@/lib/google-auth";

export default function GoogleCheck() {
  const { lines, log } = useSpikeLog();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (result.status === "cancelled") { log("Cancelled by the user."); return; }
      setEmail(result.email ?? "(no email)");
      log(`Supabase session created for ${result.email}`, "ok");
    } catch (e) {
      log(e instanceof Error ? e.message : String(e), "fail");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await googleSignOut();
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
