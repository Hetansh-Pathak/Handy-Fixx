import {
  kycDocPath, kycSaveErrorMessage, validateKycFile, type KycDocKey,
} from "@handyfix/shared";
import { readBytes } from "@/features/attachments/api";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "provider-kyc";

/** The pro's own application: draft fields on `service_providers` and the private `provider_kyc` row. */
export type KycRecord = {
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string | null;
  areas: string[];
  serviceIds: string[];
  experienceYears: number | null;
  bio: string | null;
  kycStatus: string;
  rejectionReason: string | null;
  onboardingStep: number | null;
  aadhaarLast4: string | null;
  aadhaarOnFile: boolean;
  panNumber: string | null;
  paths: Record<KycDocKey, string | null>;
  consentAcceptedAt: string | null;
};

type ProviderRow = {
  first_name: string | null; last_name: string | null; full_name: string | null; date_of_birth: string | null;
  pincodes: string[] | null; service_ids: string[] | null; experience_years: number | null; bio: string | null;
  kyc_status: string | null; kyc_rejection_reason: string | null; onboarding_step: number | null;
};
type KycRow = {
  aadhaar_last4: string | null; aadhaar_hash: string | null; pan_number: string | null;
  aadhaar_front_path: string | null; aadhaar_back_path: string | null; selfie_path: string | null; pan_path: string | null;
  certificate_path: string | null; consent_accepted_at: string | null;
};

export const kycKey = (providerId: string) => ["kyc-record", providerId] as const;

const PROVIDER_COLUMNS =
  "first_name, last_name, full_name, date_of_birth, pincodes, service_ids, experience_years, bio, kyc_status, kyc_rejection_reason, onboarding_step";
const KYC_COLUMNS =
  "aadhaar_last4, aadhaar_hash, pan_number, aadhaar_front_path, aadhaar_back_path, selfie_path, pan_path, certificate_path, consent_accepted_at";

function readable(error: { code?: string | null; message: string }): Error {
  return new Error(kycSaveErrorMessage(error));
}

/** Splits "Ramesh Kumar Patel" for a pro who signed up with one name box. */
function splitName(full: string | null): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export async function fetchKycRecord(providerId: string): Promise<KycRecord> {
  const supabase = getSupabase();
  const [providerRes, kycRes] = await Promise.all([
    supabase.from("service_providers").select(PROVIDER_COLUMNS).eq("id", providerId).single(),
    supabase.from("provider_kyc").select(KYC_COLUMNS).eq("provider_id", providerId).maybeSingle(),
  ]);
  if (providerRes.error) throw readable(providerRes.error);
  if (kycRes.error) throw readable(kycRes.error);
  const p = providerRes.data as ProviderRow;
  const k = (kycRes.data as KycRow | null) ?? null;
  const fallback = splitName(p.full_name);
  return {
    firstName: p.first_name ?? fallback.first,
    lastName: p.last_name ?? fallback.last,
    fullName: p.full_name ?? "",
    dob: p.date_of_birth,
    areas: p.pincodes ?? [],
    serviceIds: p.service_ids ?? [],
    experienceYears: p.experience_years,
    bio: p.bio,
    kycStatus: p.kyc_status ?? "not_submitted",
    rejectionReason: p.kyc_rejection_reason,
    onboardingStep: p.onboarding_step,
    aadhaarLast4: k?.aadhaar_last4 ?? null,
    aadhaarOnFile: !!k?.aadhaar_hash,
    panNumber: k?.pan_number ?? null,
    paths: {
      aadhaar_front: k?.aadhaar_front_path ?? null,
      aadhaar_back: k?.aadhaar_back_path ?? null,
      selfie: k?.selfie_path ?? null,
      pan: k?.pan_path ?? null,
      certificate: k?.certificate_path ?? null,
    },
    consentAcceptedAt: k?.consent_accepted_at ?? null,
  };
}

const storageProblem = (message: string): string => {
  if (/bucket not found/i.test(message)) return "Document upload is not switched on yet. Ask the HandyFix team to enable it.";
  if (/row-level security|not authorized|unauthorized/i.test(message)) {
    return "Your application can no longer be edited. It may already be under review.";
  }
  if (/network request failed|failed to fetch|timeout/i.test(message)) return "No internet connection. Check your internet and try again.";
  return "The photo could not be uploaded. Please try again.";
};

/** Uploads one photo to the private bucket, inside the pro's own folder (the storage rule requires it). */
export async function uploadKycDoc(args: { userId: string; key: KycDocKey; uri: string; mimeType: string }): Promise<string> {
  const bytes = await readBytes(args.uri);
  const problem = validateKycFile({ type: args.mimeType, size: bytes.byteLength });
  if (problem) throw new Error(problem);
  const path = kycDocPath(args.userId, args.key, args.mimeType, Date.now());
  const { error } = await getSupabase().storage.from(BUCKET).upload(path, bytes, { contentType: args.mimeType, upsert: false });
  if (error) throw new Error(storageProblem(error.message));
  return path;
}

/** Best effort: a leftover file is harmless, a failed cleanup must never fail the step. */
export async function removeKycFiles(paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  await getSupabase().storage.from(BUCKET).remove([...paths]).catch(() => undefined);
}

export type KycSavePlan = {
  /** Columns on `service_providers` (name, dob, areas, services, experience, bio, onboarding_step). */
  provider: Record<string, unknown>;
  /** Columns on `provider_kyc`. Only what this step changed, so other steps' data is never wiped. */
  kyc: Record<string, unknown>;
};

export async function saveKycPlan(providerId: string, plan: KycSavePlan): Promise<void> {
  const supabase = getSupabase();
  // The plain details go first. The document paths go last: if this step fails, the caller deletes the files it
  // uploaded, and nothing in the database points at them yet.
  if (Object.keys(plan.provider).length) {
    // RLS lets a pro update only their own row; no row back means the update did not apply.
    const { data, error } = await supabase.from("service_providers").update(plan.provider).eq("id", providerId).select("id").maybeSingle();
    if (error) throw readable(error);
    if (!data) throw new Error("Your details could not be saved. Sign out and in again, then retry.");
  }
  if (Object.keys(plan.kyc).length) {
    const { error } = await supabase.from("provider_kyc").upsert({ provider_id: providerId, ...plan.kyc }, { onConflict: "provider_id" });
    if (error) throw readable(error);
  }
}

/** The server checks everything again and moves the application to "pending". */
export async function submitKyc(): Promise<void> {
  const { data, error } = await getSupabase().rpc("submit_kyc");
  if (error) throw readable(error);
  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) throw new Error(result?.error || "We could not submit your application. Please check every step and try again.");
}
