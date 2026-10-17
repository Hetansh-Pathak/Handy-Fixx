import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/auth/AuthLayout";
import TextField from "@/components/form/TextField";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError, isValidEmail } from "@/lib/authErrors";

const RESEND_SECONDS = 30;

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (address: string) => {
    setLoading(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setFormError(friendlyAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const value = email.trim();
    if (!value) return fail("Enter your email.");
    if (!isValidEmail(value)) return fail("Enter a valid email, like name@example.com.");
    setFieldError(undefined);
    void send(value);
  };

  const fail = (message: string) => {
    setFieldError(message);
    document.getElementById("forgot-email")?.focus();
  };

  return (
    <AuthLayout
      headline={sentTo ? "Check your email." : "Forgot your password?"}
      sub={sentTo ? "Your reset link is on its way." : "Enter your email and we'll send you a link to reset it."}
      skip={{ label: "Back to log in", onClick: () => navigate("/auth") }}
    >
      {sentTo ? (
        <div className="space-y-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-foreground">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-2" role="status">
            <h2 className="text-xl font-extrabold tracking-tight">We sent a link to {sentTo}</h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              If an account uses this email, the link will arrive in a minute. Check your spam folder if you don't see it.
            </p>
          </div>

          {formError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              {formError}
            </div>
          )}

          <div className="space-y-3">
            <Button size="lg" className="w-full" disabled={loading || cooldown > 0} onClick={() => void send(sentTo)}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" /> Sending…
                </>
              ) : cooldown > 0 ? (
                `Resend link in ${cooldown}s`
              ) : (
                "Resend link"
              )}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextField
            id="forgot-email"
            name="email"
            type="email"
            label="Email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            autoFocus
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
          />

          {formError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              {formError}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading} aria-busy={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
