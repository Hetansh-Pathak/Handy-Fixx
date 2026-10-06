export type AuthErrorKind = "exists" | "invalid" | "network" | "rate" | "other";

export interface FriendlyAuthError {
  message: string;
  kind: AuthErrorKind;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());

/** Turns Supabase / network errors into one plain sentence that says what to do next. */
export const friendlyAuthError = (err: unknown): FriendlyAuthError => {
  const e = (typeof err === "object" && err !== null ? err : {}) as {
    message?: string;
    code?: string;
    status?: number;
  };
  const text = `${e.code ?? ""} ${e.message ?? ""}`.toLowerCase();

  if (text.includes("invalid_credentials") || text.includes("invalid login credentials")) {
    return { kind: "invalid", message: "That email and password don't match. Check them and try again." };
  }
  if (text.includes("user_already_exists") || text.includes("already registered") || text.includes("already been registered")) {
    return { kind: "exists", message: "An account with this email already exists." };
  }
  if (text.includes("email_not_confirmed") || text.includes("email not confirmed")) {
    return { kind: "other", message: "Confirm your email first. We sent you a link when you signed up." };
  }
  if (e.status === 429 || text.includes("rate_limit") || text.includes("rate limit") || text.includes("too many")) {
    return { kind: "rate", message: "Too many attempts. Wait a minute, then try again." };
  }
  if (text.includes("weak_password") || text.includes("password should be")) {
    return { kind: "other", message: "Choose a stronger password. Use at least 6 characters." };
  }
  if (text.includes("same_password") || text.includes("different from the old")) {
    return { kind: "other", message: "Your new password must be different from your current one." };
  }
  if (text.includes("signup_disabled") || text.includes("signups not allowed")) {
    return { kind: "other", message: "Sign-ups are paused right now. Try again later." };
  }
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed") || text.includes("network request failed")) {
    return { kind: "network", message: "Can't reach the server. Check your connection and try again." };
  }
  return { kind: "other", message: e.message?.trim() || "Something went wrong. Try again." };
};
