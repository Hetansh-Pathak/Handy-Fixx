import {
  KYC_TOTAL_STEPS, TERMS_VERSION, dobToInput, hashAadhaar, normalizeAadhaar, parseDobInput, validateAllKycSteps, validateKycStep,
  type KycDocKey, type KycFacts,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { loadErrorMessage } from "@/lib/load-error";
import {
  fetchKycRecord, kycKey, removeKycFiles, saveKycPlan, submitKyc, uploadKycDoc, type KycRecord, type KycSavePlan,
} from "./api";
import type { LocalDoc } from "./images";

/** A document the pro has changed on this phone: a new photo, or "removed". Untouched documents are not listed. */
type DocChange = LocalDoc | "removed";

export type KycDraft = {
  firstName: string;
  lastName: string;
  dobText: string;
  aadhaarNumber: string;
  panNumber: string;
  areas: string[];
  serviceIds: string[];
  experienceYears: string;
  bio: string;
  termsAccepted: boolean;
};

type WizardValue = {
  record: KycRecord;
  draft: KycDraft;
  set: <K extends keyof KycDraft>(key: K, value: KycDraft[K]) => void;
  facts: KycFacts;
  /** The new photo for a document, if one was picked on this phone. */
  localDoc: (key: KycDocKey) => LocalDoc | null;
  /** True when the document exists, either picked now or saved earlier. */
  hasDoc: (key: KycDocKey) => boolean;
  setDoc: (key: KycDocKey, doc: LocalDoc | null) => void;
  /** Checks, uploads and saves one step. Throws an Error with text for the pro. */
  saveStep: (step: number) => Promise<void>;
  submit: () => Promise<void>;
  /** Steps that still have a problem, for the review screen. */
  problems: { step: number; message: string }[];
};

const WizardContext = createContext<WizardValue | null>(null);

const STEP_DOCS: Partial<Record<number, KycDocKey[]>> = {
  3: ["aadhaar_front", "aadhaar_back"],
  4: ["selfie"],
  5: ["pan"],
  8: ["certificate"],
};

const PATH_COLUMN: Record<KycDocKey, string> = {
  aadhaar_front: "aadhaar_front_path",
  aadhaar_back: "aadhaar_back_path",
  selfie: "selfie_path",
  pan: "pan_path",
  certificate: "certificate_path",
};

function draftFromRecord(r: KycRecord): KycDraft {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    dobText: dobToInput(r.dob),
    aadhaarNumber: "",
    panNumber: r.panNumber ?? "",
    areas: r.areas,
    serviceIds: r.serviceIds,
    experienceYears: r.experienceYears === null || r.experienceYears === undefined ? "" : String(r.experienceYears),
    bio: r.bio ?? "",
    termsAccepted: !!r.consentAcceptedAt,
  };
}

export function useKycWizard(): WizardValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useKycWizard must be used inside <KycWizardProvider>");
  return ctx;
}

/** Loads the pro's application once and keeps the draft in memory while the pro moves between steps. */
export function KycWizardProvider({ children, loading, failed }: {
  children: ReactNode;
  loading: ReactNode;
  failed: (message: string, retry: () => void) => ReactNode;
}) {
  const { provider, userId } = useSession();
  const queryClient = useQueryClient();
  const providerId = provider?.id ?? "";
  const query = useQuery({ queryKey: kycKey(providerId), enabled: !!providerId, queryFn: () => fetchKycRecord(providerId) });
  const [draft, setDraft] = useState<KycDraft | null>(null);
  const [changes, setChanges] = useState<Partial<Record<KycDocKey, DocChange>>>({});
  const seeded = useRef(false);

  // Fill the form once from the saved application. Later refetches must never overwrite what the pro is typing.
  useEffect(() => {
    if (query.data && !seeded.current) {
      seeded.current = true;
      setDraft(draftFromRecord(query.data));
    }
  }, [query.data]);

  const record = query.data;

  const set = useCallback(<K extends keyof KycDraft>(key: K, value: KycDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const setDoc = useCallback((key: KycDocKey, doc: LocalDoc | null) => {
    setChanges((prev) => ({ ...prev, [key]: doc ?? "removed" }));
  }, []);

  const localDoc = useCallback((key: KycDocKey): LocalDoc | null => {
    const c = changes[key];
    return c && c !== "removed" ? c : null;
  }, [changes]);

  const hasDoc = useCallback((key: KycDocKey): boolean => {
    const c = changes[key];
    if (c === "removed") return false;
    if (c) return true;
    return !!record?.paths[key];
  }, [changes, record]);

  const facts = useMemo<KycFacts | null>(() => {
    if (!draft || !record) return null;
    return {
      firstName: draft.firstName,
      lastName: draft.lastName,
      dob: parseDobInput(draft.dobText) ?? "",
      aadhaarNumber: draft.aadhaarNumber,
      aadhaarOnFile: record.aadhaarOnFile,
      hasAadhaarFront: hasDoc("aadhaar_front"),
      hasSelfie: hasDoc("selfie"),
      panNumber: draft.panNumber,
      hasPanDoc: hasDoc("pan"),
      areas: draft.areas,
      serviceIds: draft.serviceIds,
      experienceYears: draft.experienceYears,
      bio: draft.bio,
      termsAccepted: draft.termsAccepted,
    };
  }, [draft, record, hasDoc]);

  const saveStep = useCallback(async (step: number) => {
    if (!draft || !record || !facts || !userId) throw new Error("Your application is still loading. Try again in a moment.");
    const problem = validateKycStep(step, facts, new Date());
    if (problem) throw new Error(problem);

    const plan: KycSavePlan = { provider: {}, kyc: {} };
    const nextStep = Math.min(Math.max(record.onboardingStep ?? 1, step + 1), KYC_TOTAL_STEPS);
    plan.provider.onboarding_step = nextStep;

    switch (step) {
      case 1: {
        const first = draft.firstName.trim();
        const last = draft.lastName.trim();
        Object.assign(plan.provider, { first_name: first, last_name: last, full_name: `${first} ${last}` });
        break;
      }
      case 2:
        plan.provider.date_of_birth = facts.dob;
        break;
      case 3: {
        const typed = normalizeAadhaar(draft.aadhaarNumber);
        if (typed) Object.assign(plan.kyc, { aadhaar_last4: typed.slice(-4), aadhaar_hash: hashAadhaar(typed) });
        break;
      }
      case 5:
        plan.kyc.pan_number = draft.panNumber.trim().toUpperCase();
        break;
      case 6:
        plan.provider.pincodes = draft.areas;
        break;
      case 7:
        Object.assign(plan.provider, { service_ids: draft.serviceIds, experience_years: Number(draft.experienceYears.trim()) });
        break;
      case 8:
        plan.provider.bio = draft.bio.trim() || null;
        break;
      case 9:
        Object.assign(plan.kyc, { terms_version: TERMS_VERSION, consent_accepted_at: draft.termsAccepted ? new Date().toISOString() : null });
        break;
      default:
        break;
    }

    // Photos first. If saving the details then fails, the new files are removed again.
    const uploaded: string[] = [];
    const replaced: string[] = [];
    try {
      for (const key of STEP_DOCS[step] ?? []) {
        const change = changes[key];
        if (!change) continue;
        const old = record.paths[key];
        if (change === "removed") {
          plan.kyc[PATH_COLUMN[key]] = null;
        } else {
          const path = await uploadKycDoc({ userId, key, uri: change.uri, mimeType: change.mimeType });
          uploaded.push(path);
          plan.kyc[PATH_COLUMN[key]] = path;
        }
        if (old) replaced.push(old);
      }
      await saveKycPlan(providerId, plan);
    } catch (e) {
      await removeKycFiles(uploaded);
      throw e;
    }

    await removeKycFiles(replaced);
    await queryClient.invalidateQueries({ queryKey: kycKey(providerId) });
    setChanges((prev) => {
      const next = { ...prev };
      for (const key of STEP_DOCS[step] ?? []) delete next[key];
      return next;
    });
    if (step === 3) set("aadhaarNumber", "");
  }, [draft, record, facts, userId, providerId, changes, queryClient, set]);

  const submit = useCallback(async () => {
    if (!facts) throw new Error("Your application is still loading. Try again in a moment.");
    const broken = validateAllKycSteps(facts, new Date());
    if (broken.length) throw new Error(broken[0]!.message);
    await saveStep(9);
    await submitKyc();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: providerRowKey(userId) }),
      queryClient.invalidateQueries({ queryKey: kycKey(providerId) }),
    ]);
  }, [facts, saveStep, queryClient, userId, providerId]);

  const problems = useMemo(() => (facts ? validateAllKycSteps(facts, new Date()) : []), [facts]);

  if (query.isError) return <>{failed(loadErrorMessage("your application", query.error), () => void query.refetch())}</>;
  if (!record || !draft || !facts) return <>{loading}</>;

  return (
    <WizardContext.Provider value={{ record, draft, set, facts, localDoc, hasDoc, setDoc, saveStep, submit, problems }}>
      {children}
    </WizardContext.Provider>
  );
}
