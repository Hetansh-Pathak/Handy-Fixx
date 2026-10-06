import { FormEvent, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleIcon from "@/components/auth/GoogleIcon";
import TextField, { PasswordField } from "@/components/form/TextField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { BRAND } from "@/lib/brand";
import { EASE } from "@/lib/motion";
import { friendlyAuthError, isValidEmail, type FriendlyAuthError } from "@/lib/authErrors";

type Mode = "login" | "signup";
type Field = "name" | "email" | "password";
type Errors = Partial<Record<Field, string>>;

const FIELD_ORDER: Field[] = ["name", "email", "password"];

/** Only allow in-app paths as a post-login destination (no external or protocol-relative URLs). */
const safeRedirect = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

const validate = (mode: Mode, v: Record<Field, string>): Errors => {
  const e: Errors = {};
  if (mode === "signup" && v.name.trim().length < 2) e.name = "Enter your full name.";
  if (!v.email.trim()) e.email = "Enter your email.";
  else if (!isValidEmail(v.email)) e.email = "Enter a valid email, like name@example.com.";
  if (!v.password) e.password = mode === "login" ? "Enter your password." : "Choose a password.";
  else if (mode === "signup" && v.password.length < 6) e.password = "Use at least 6 characters.";
  return e;
};

const Auth = () => {
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<FriendlyAuthError | null>(() =>
    searchParams.get("error") === "account_not_found"
      ? { kind: "other", message: `No ${BRAND.name} account uses that Google account yet. Create one to continue.` }
      : null,
  );
  const [loading, setLoading] = useState<"password" | "google" | null>(null);

  // While a submit is in flight we decide where to go ourselves (profile setup vs. redirect),
  // so the "already signed in" effect below must stay out of the way.
  const submitting = useRef(false);

  useEffect(() => {
    if (user && !submitting.current) navigate(redirectTo, { replace: true });
  }, [user, navigate, redirectTo]);

  // Clear the ?error= param (set by AuthCallback) so a refresh doesn't show it again.
  useEffect(() => {
    if (!searchParams.get("error")) return;
    const params = new URLSearchParams(searchParams);
    params.delete("error");
    navigate({ search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const checkField = (field: Field) => {
    const found = validate(mode, { name, email, password });
    setErrors((prev) => ({ ...prev, [field]: found[field] }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const found = validate(mode, { name, email, password });
    setErrors(found);
    setFormError(null);
    const firstInvalid = FIELD_ORDER.find((f) => found[f]);
    if (firstInvalid) {
      document.getElementById(`auth-${firstInvalid}`)?.focus();
      return;
    }

    const cleanEmail = email.trim();
    const cleanName = name.trim();
    setLoading("password");
    submitting.current = true;

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (!profile?.full_name || !profile?.phone) navigate("/profile?setup=true", { replace: true });
        else navigate(redirectTo, { replace: true });
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: cleanName } },
        });
        if (signUpError) throw signUpError;

        // Email confirmation is disabled in Supabase, so sign in straight away.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError) throw signInError;

        // Best-effort welcome email; never block or fail sign-up on it.
        supabase.functions.invoke("send-welcome-email", { body: { email: cleanEmail, display_name: cleanName } }).catch(() => {});

        toast({ title: `Welcome to ${BRAND.name}`, description: "Your account is ready." });
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      submitting.current = false;
      setFormError(friendlyAuthError(err));
    } finally {
      setLoading(null);
    }
  };

  const handleGoogle = async () => {
    if (loading) return;
    setFormError(null);
    setLoading("google");
    try {
      // AuthCallback reads this to tell "log in" from "sign up" after Google returns.
      localStorage.setItem("handyfix_google_auth_mode", mode);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (err) {
      setFormError(friendlyAuthError(err));
      setLoading(null);
    }
  };

  const isLogin = mode === "login";

  return (
    <AuthLayout
      headline="Book a verified pro in minutes."
      sub="Electricians, plumbers, cleaners and more, near you."
      skip={{ label: "Browse as guest", onClick: () => navigate("/") }}
    >
      <div
        role="tablist"
        aria-label="Log in or sign up"
        className="relative mb-7 grid grid-cols-2 rounded-xl bg-secondary p-1"
      >
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`relative z-10 h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === m && (
              <motion.span
                layoutId="auth-segment"
                transition={{ duration: 0.25, ease: EASE }}
                className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
              />
            )}
            {m === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {!isLogin && (
          <motion.div initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
            <TextField
              id="auth-name"
              name="name"
              label="Full name"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name && checkField("name")}
              error={errors.name}
            />
          </motion.div>
        )}

        <TextField
          id="auth-email"
          name="email"
          type="email"
          label="Email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email && checkField("email")}
          error={errors.email}
        />

        <PasswordField
          id="auth-password"
          name="password"
          label="Password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          enterKeyHint="go"
          placeholder={isLogin ? "Your password" : "At least 6 characters"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => password && !isLogin && checkField("password")}
          error={errors.password}
          labelAction={
            isLogin ? (
              <button
                type="button"
                onClick={() => navigate(email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password")}
                className="rounded text-[13px] font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Forgot password?
              </button>
            ) : undefined
          }
        />

        {formError && (
          <div role="alert" className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">{formError.message}</p>
              {formError.kind === "exists" && (
                <button type="button" onClick={() => switchMode("login")} className="font-semibold underline underline-offset-2">
                  Log in instead
                </button>
              )}
              {formError.kind === "invalid" && (
                <button
                  type="button"
                  onClick={() => navigate(email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password")}
                  className="font-semibold underline underline-offset-2"
                >
                  Reset your password
                </button>
              )}
            </div>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading !== null} aria-busy={loading === "password"}>
          {loading === "password" ? (
            <>
              <Loader2 className="animate-spin" /> {isLogin ? "Logging in…" : "Creating account…"}
            </>
          ) : isLogin ? (
            "Log in"
          ) : (
            "Create account"
          )}
        </Button>

        <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" size="lg" className="w-full" disabled={loading !== null} onClick={handleGoogle}>
          {loading === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon className="!h-5 !w-5" />}
          Continue with Google
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        {isLogin ? `New to ${BRAND.name}?` : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => switchMode(isLogin ? "signup" : "login")}
          className="rounded font-semibold text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isLogin ? "Create an account" : "Log in"}
        </button>
      </p>
    </AuthLayout>
  );
};

export default Auth;
