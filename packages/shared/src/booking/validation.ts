import { z } from "zod";
import { BOOKING_SLOTS } from "./schedule";

export const PINCODE_REGEX = /^\d{6}$/;
export const isValidPincode = (v: string) => PINCODE_REGEX.test(v);

export const pincodeSchema = z.string().regex(PINCODE_REGEX, "Enter a valid 6-digit pincode");
export const emailSchema = z.string().trim().email("Enter a valid email address");

/** 6-digit email OTP (matches the send/verify OTP edge functions). */
export const emailOtpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

/** Indian mobile: 10 digits starting 6-9, optionally written with +91 / 91 / 0 and spaces or dashes. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  const national = digits.replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(national) ? national : null;
}

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit mobile number" });
    return n ?? z.NEVER;
  });

// ── 3-step booking (PDF p.4–5): 1 date & time → 2 address → 3 review & confirm ──────────────

export const bookingScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  time: z.enum(BOOKING_SLOTS, { errorMap: () => ({ message: "Pick a time slot" }) }),
});

export const bookingAddressSchema = z.object({
  address: z.string().trim().min(1, "Enter the service address").max(500),
  city: z.string().trim().min(1, "Enter your city").max(100),
  pincode: pincodeSchema,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const bookingNotesSchema = z.object({
  notes: z.string().trim().max(1000, "Keep notes under 1000 characters").optional(),
});

export const newBookingInputSchema = bookingScheduleSchema.merge(bookingAddressSchema).merge(bookingNotesSchema);
export type NewBookingInput = z.infer<typeof newBookingInputSchema>;

/** Same gating the old UI used for the "Next" buttons. */
export const canGoToStep2 = (v: { date?: string; time?: string }) => bookingScheduleSchema.safeParse(v).success;
export const canGoToStep3 = (v: unknown) => bookingAddressSchema.safeParse(v).success;
