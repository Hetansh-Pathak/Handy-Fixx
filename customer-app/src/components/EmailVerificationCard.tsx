import { useEffect, useState } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onVerified: () => void;
  onCancel?: () => void;
}

// Pull the real message out of a non-2xx Edge Function response.
const functionError = async (error: unknown): Promise<string> => {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const body = await ctx.json(); if (body?.error) return String(body.error); } catch { /* fall through */ }
  }
  return error instanceof Error ? error.message : "Something went wrong";
};

const EmailVerificationCard = ({ onVerified, onCancel }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("send-customer-otp", { body: {} });
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't send code", description: await functionError(error), variant: "destructive" });
      return;
    }
    setSent(true);
    setCode("");
    setCooldown(60);
    toast({ title: "Code sent", description: `Check ${user?.email} (and spam).` });
  };

  const verify = async (value: string) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("verify-customer-otp", { body: { otp_code: value } });
    setBusy(false);
    if (error) {
      setCode("");
      toast({ title: "Verification failed", description: await functionError(error), variant: "destructive" });
      return;
    }
    toast({ title: "Email verified", description: "You can now book providers." });
    onVerified();
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 text-center max-w-md mx-auto">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        {sent ? <MailCheck className="w-7 h-7 text-primary" /> : <ShieldCheck className="w-7 h-7 text-primary" />}
      </div>
      <h2 className="text-xl font-semibold mb-2">Verify your email to book</h2>
      <p className="text-sm text-muted-foreground mb-6">
        This keeps providers and customers safe. We'll send a 6-digit code to{" "}
        <span className="text-foreground font-medium">{user?.email}</span>.
      </p>

      {!sent ? (
        <Button onClick={sendCode} disabled={busy} className="w-full bg-gradient-gold text-primary-foreground font-bold py-6 rounded-xl">
          {busy ? "Sending…" : "Send verification code"}
        </Button>
      ) : (
        <>
          <div className="flex justify-center mb-4">
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={verify} disabled={busy} inputMode="numeric" pattern="[0-9]*">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={() => verify(code)} disabled={busy || code.length !== 6} className="w-full bg-gradient-gold text-primary-foreground font-bold py-6 rounded-xl">
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>
          <button onClick={sendCode} disabled={busy || cooldown > 0} className="mt-4 text-sm text-primary disabled:text-muted-foreground">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </>
      )}
      {onCancel && (
        <button onClick={onCancel} className="block mx-auto mt-4 text-xs text-muted-foreground hover:text-foreground">← Go back</button>
      )}
    </div>
  );
};

export default EmailVerificationCard;
