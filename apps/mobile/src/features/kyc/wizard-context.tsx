import {
  KYC_TOTAL_STEPS, TERMS_VERSION, dobToInput, normalizePan, parseDobInput, validateAllKycSteps, validateKycStep,
  type KycDocKey, type KycFacts,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { loadErrorMessage } from "@/lib/load-error";
import {
  fetchKycRecord, kycKey, removeKycFiles, savePan, saveKycPlan, submitKyc, uploadKycDoc, type KycRecord, type KycSavePlan,
} from "./api";
import type { LocalDoc } from "./images";

/** A document the pro has changed on this phone: a new photo, or "removed". Untouched documents are not listed. */
type DocChange = LocalDoc | "removed";

export type KycDraft = {
  firstName: string;
  lastName: string;
  dobText: string;
  /** Typed in the PAN box and sent once to the server. Cleared after saving: the app never holds a saved PAN. */
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
  3: ["selfie"],
  4: ["pan"],
  7: ["certificate"],
};

const PATH_COLUMN: Record<KycDocKey, string> = {
  selfie: "selfie_path",
  pan: "pan_path",
  certificate: "certificate_path",
};

function draftFromRecord(r: KycRecord): KycDraft {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    dobText: dobToInput(r.dob),
    panNumber: "",
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
      hasSelfie: hasDoc("selfie"),
      panNumber: draft.panNumber,
      panOnFile: !!record.panLast4,
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
      case 5:
        plan.provider.pincodes = draft.areas;
        break;
      case 6:
        Object.assign(plan.provider, { service_ids: draft.serviceIds, experience_years: Number(draft.experienceYears.trim()) });
        break;
      case 7:
        plan.provider.bio = draft.bio.trim() || null;
        break;
      case 8:
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
      // The PAN goes to the server function (encrypted there); only when it was typed on this step.
      if (step === 4 && normalizePan(draft.panNumber)) await savePan(normalizePan(draft.panNumber));
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
    if (step === 4) set("panNumber", "");
  }, [draft, record, facts, userId, providerId, changes, queryClient, set]);

  const submit = useCallback(async () => {
    if (!facts) throw new Error("Your application is still loading. Try again in a moment.");
    const broken = validateAllKycSteps(facts, new Date());
    if (broken.length) throw new Error(broken[0]!.message);
    await saveStep(KYC_TOTAL_STEPS);
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
