import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AuthLayout from "@/components/auth/AuthLayout";
import { PasswordField } from "@/components/form/TextField";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { friendlyAuthError } from "@/lib/authErrors";

type Gate = "checking" | "ready" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [gate, setGate] = useState<Gate>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A valid reset link leaves the user with a recovery session. The Supabase client may already
  // have consumed (and cleared) the URL hash by the time this mounts, so we check the session
  // and the PASSWORD_RECOVERY event rather than the hash. No session means the link is expired.
  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) setGate("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setGate((current) => (current === "ready" || data.session ? "ready" : "invalid"));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const next: { password?: string; confirm?: string } = {};
    if (password.length < 6) next.password = "Use at least 6 characters.";
    if (confirm !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    setFormError(null);
    if (next.password || next.confirm) {
      document.getElementById(next.password ? "reset-password" : "reset-confirm")?.focus();
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You're signed in with your new password." });
      navigate("/", { replace: true });
    } catch (err) {
      setFormError(friendlyAuthError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline={gate === "invalid" ? "This link has expired." : "Choose a new password."}
      sub={gate === "invalid" ? "Reset links stop working after a short time." : "Use at least 6 characters you haven't used before."}
      skip={{ label: "Back to log in", onClick: () => navigate("/auth") }}
    >
      {gate === "checking" && (
        <div className="space-y-4" aria-busy="true" aria-label="Checking your reset link">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      )}

      {gate === "invalid" && (
        <div className="space-y-6">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Request a new link and open it on this device. Each link works once.
          </p>
          <Button size="lg" className="w-full" onClick={() => navigate("/forgot-password")}>
            Request a new link
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate("/auth")}>
            Back to log in
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <PasswordField
            id="reset-password"
            name="new-password"
            label="New password"
            autoComplete="new-password"
            enterKeyHint="next"
            autoFocus
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <PasswordField
            id="reset-confirm"
            name="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            enterKeyHint="go"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
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
                <Loader2 className="animate-spin" /> Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
