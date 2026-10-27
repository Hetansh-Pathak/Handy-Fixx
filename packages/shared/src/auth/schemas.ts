import { z } from "zod";
import { emailSchema, normalizeIndianMobile, pincodeSchema } from "../booking/validation";

export const fullNameSchema = z.string().trim().min(2, "Enter your full name").max(80, "Name is too long");

/** 8+ characters with a letter and a number. 72 is Supabase's (bcrypt) maximum. */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

const matchPasswords = <T extends { password: string; confirmPassword: string }>(v: T, ctx: z.RefinementCtx) => {
  if (v.password !== v.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match" });
  }
};

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(matchPasswords);

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .superRefine(matchPasswords);

/** Required to become a pro: customers call them, and the admin reviews KYC against it. */
export const providerPickSchema = z.object({
  phone: z.string().transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit mobile number" });
    return n ?? z.NEVER;
  }),
});

/** Blank optional text becomes null so the database never stores empty strings. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .transform((v) => (v === "" ? null : v));

const optionalPhone = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const n = normalizeIndianMobile(v);
  if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit mobile number" });
  return n ?? z.NEVER;
});

const optionalPincode = z.string().transform((v, ctx) => {
  const t = v.trim();
  if (t === "") return null;
  if (!pincodeSchema.safeParse(t).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 6-digit pincode" });
  return t;
});

export const customerProfileSchema = z.object({
  fullName: fullNameSchema,
  phone: optionalPhone,
  address: optionalText(500),
  city: optionalText(100),
  pincode: optionalPincode,
});
export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
export type CustomerProfile = z.output<typeof customerProfileSchema>;

/** First error message per field, for showing under each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Turns Supabase auth error text into something a customer can act on. */
export function friendlyAuthError(message: string | null | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (!m) return "Something went wrong. Please try again.";
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("timed out")) {
    return "No internet connection. Check your network and try again.";
  }
  if (m.includes("password should be at least") || m.includes("weak password")) return "That password is too weak. Use 8+ characters with a letter and a number.";
  if (m.includes("same password") || m.includes("different from the old")) return "Choose a password you have not used before.";
  if (m.includes("expired") || m.includes("invalid or has expired")) return "This link has expired. Request a new one.";
  return message!.length <= 120 ? message! : "Something went wrong. Please try again.";
}
