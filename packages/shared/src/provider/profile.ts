import { z } from "zod";
import { fullNameSchema } from "../auth/schemas";
import { isValidPincode, phoneSchema } from "../booking/validation";
import { GUJARAT_CITIES } from "../constants/cities";

/**
 * The pro's editable profile (`service_providers` row). Customers find a pro through two lists on
 * that row: `service_ids` (what they do) and `pincodes` (the cities and 6-digit pincodes they cover,
 * matched exactly by `servesArea`). Both must be non-empty, or the pro is shown for every service
 * (`offersService` treats an empty list as "all") or for no area at all.
 */

export const MAX_SERVICE_AREAS = 20;
export const MAX_EXPERIENCE_YEARS = 60;

/**
 * Name and mobile are what the admin checks the ID documents against, so they are fixed once KYC is
 * submitted. Changing them after that goes through support.
 */
export const isProviderIdentityLocked = (kycStatus: string | null | undefined): boolean =>
  kycStatus === "pending" || kycStatus === "approved";

/** A 6-digit pincode, or a Gujarat city written the way the catalogue spells it. Anything else is null. */
export function normalizeServiceArea(input: string): string | null {
  const t = input.trim().replace(/\s+/g, " ");
  if (isValidPincode(t)) return t;
  const lower = t.toLowerCase();
  return GUJARAT_CITIES.find((c) => c.toLowerCase() === lower) ?? null;
}

export type AddAreaResult = { ok: true; areas: string[] } | { ok: false; error: string };

export function addServiceArea(areas: readonly string[], input: string): AddAreaResult {
  const area = normalizeServiceArea(input);
  if (!area) return { ok: false, error: "Enter a Gujarat city or a 6-digit pincode." };
  if (areas.some((a) => a.toLowerCase() === area.toLowerCase())) return { ok: false, error: `${area} is already in your list.` };
  if (areas.length >= MAX_SERVICE_AREAS) return { ok: false, error: `You can cover up to ${MAX_SERVICE_AREAS} areas.` };
  return { ok: true, areas: [...areas, area] };
}

/** Cities that start with what the pro has typed (for suggestions), at most `limit`. */
export function suggestCities(query: string, exclude: readonly string[] = [], limit = 5): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const taken = new Set(exclude.map((a) => a.toLowerCase()));
  return GUJARAT_CITIES.filter((c) => c.toLowerCase().startsWith(q) && !taken.has(c.toLowerCase())).slice(0, limit);
}

const optionalText = (max: number) =>
  z.string().trim().max(max, "Too long").transform((v) => (v === "" ? null : v));

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^\d{9,18}$/;

export const providerProfileSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema,
    bio: optionalText(500),
    experienceYears: z.string().transform((v, ctx) => {
      const t = v.trim();
      if (t === "") return 0;
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0 || n > MAX_EXPERIENCE_YEARS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Enter whole years between 0 and ${MAX_EXPERIENCE_YEARS}` });
        return z.NEVER;
      }
      return n;
    }),
    city: z.string().transform((v, ctx) => {
      if (v.trim() === "") return null;
      const c = normalizeServiceArea(v);
      if (!c || isValidPincode(c)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a Gujarat city" });
        return z.NEVER;
      }
      return c;
    }),
    serviceAreas: z
      .array(z.string())
      .min(1, "Add at least one city or pincode you cover")
      .max(MAX_SERVICE_AREAS, `You can cover up to ${MAX_SERVICE_AREAS} areas`),
    serviceIds: z.array(z.string().uuid()).min(1, "Pick at least one service you offer"),
    upiId: z.string().trim().transform((v, ctx) => {
      if (v === "") return null;
      if (!UPI_REGEX.test(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a UPI ID like name@bank" });
        return z.NEVER;
      }
      return v;
    }),
    bankAccountName: optionalText(100),
    bankAccountNumber: z.string().transform((v) => v.replace(/\s/g, "")),
    bankIfsc: z.string().transform((v) => v.trim().toUpperCase()),
  })
  .superRefine((v, ctx) => {
    // Bank details are all-or-nothing: a half-filled account cannot receive a payout.
    const anyBank = !!v.bankAccountName || v.bankAccountNumber !== "" || v.bankIfsc !== "";
    if (!anyBank) return;
    if (!v.bankAccountName) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountName"], message: "Enter the account holder's name" });
    if (!ACCOUNT_REGEX.test(v.bankAccountNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountNumber"], message: "Enter the 9-18 digit account number" });
    }
    if (!IFSC_REGEX.test(v.bankIfsc)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankIfsc"], message: "Enter an 11-character IFSC like SBIN0001234" });
  });

export type ProviderProfileInput = z.input<typeof providerProfileSchema>;
export type ProviderProfile = z.output<typeof providerProfileSchema>;

/** Columns of `service_providers` this form writes. */
export type ProviderProfilePatch = {
  full_name?: string;
  phone?: string;
  bio: string | null;
  experience_years: number;
  city: string | null;
  pincodes: string[];
  service_ids: string[];
  upi_id: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
};

/** The update to send. Name and mobile are left out while identity is locked, so the database never sees a change. */
export function toProviderProfilePatch(p: ProviderProfile, identityLocked: boolean): ProviderProfilePatch {
  return {
    ...(identityLocked ? {} : { full_name: p.fullName, phone: p.phone }),
    bio: p.bio,
    experience_years: p.experienceYears,
    city: p.city,
    pincodes: p.serviceAreas,
    service_ids: p.serviceIds,
    upi_id: p.upiId,
    bank_account_name: p.bankAccountName,
    bank_account_number: p.bankAccountNumber || null,
    bank_ifsc: p.bankIfsc || null,
  };
}

/** "••••1234" for showing a saved account number. */
export const maskAccountNumber = (n: string | null | undefined): string | null =>
  n && n.length >= 4 ? `••••${n.slice(-4)}` : null;
