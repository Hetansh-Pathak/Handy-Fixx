import {
  KYC_BIO_MAX, KYC_TOTAL_STEPS, formatDobInput, maskAadhaar, maskPAN, normalizeAadhaar, parseDobInput, validateAadhaar, validatePAN,
} from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Award, Briefcase, Calendar, Camera, Check, CreditCard, FileText, MapPin, ShieldCheck, User, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Card, Chip, ErrorBanner, TextField, TextLink } from "@/components/ui";
import { fetchServices } from "@/features/customer/catalog-api";
import { ServiceAreasField } from "@/features/provider/ServiceAreasField";
import { loadErrorMessage } from "@/lib/load-error";
import { useThemeColors } from "@/theme/theme";
import { DocField, StepFrame, TermsSheet } from "./components";
import { useKycWizard } from "./wizard-context";

const ICONS: Record<number, LucideIcon> = { 1: User, 2: Calendar, 3: CreditCard, 4: Camera, 5: FileText, 6: MapPin, 7: Briefcase, 8: Award, 9: ShieldCheck };

const COPY: Record<number, { title: string; hint: string }> = {
  1: { title: "What is your full name?", hint: "Write it exactly as it is on your Aadhaar card." },
  2: { title: "When were you born?", hint: "You must be 18 or older to work on HandyFix." },
  3: { title: "Aadhaar card", hint: "We keep only the last 4 digits and a scrambled code, never the full number." },
  4: { title: "Your selfie", hint: "A clear photo of your face. We compare it with your ID photo." },
  5: { title: "PAN card", hint: "Needed for tax rules and to pay your withdrawals." },
  6: { title: "Where can you work?", hint: "Add every city or pincode you can reach. Customers there can book you." },
  7: { title: "What do you do?", hint: "Pick the services you offer. You only get requests for these." },
  8: { title: "Show your skills", hint: "A trade certificate and a short bio help customers choose you. Both are optional." },
  9: { title: "Check and submit", hint: "Look through your answers. After you submit, our team reviews them in 1–2 working days." },
};

const groupDigits = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

export function KycStepScreen({ step }: { step: number }) {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromReview = from === "review";
  const w = useKycWizard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const copy = COPY[step]!;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/provider/kyc"));

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      if (step === KYC_TOTAL_STEPS) {
        await w.submit();
        // Drop the step screens so Back from the status page never reopens a locked form.
        if (router.canDismiss()) router.dismissAll();
        else router.replace("/provider/kyc");
        return;
      }
      await w.saveStep(step);
      if (fromReview) router.back();
      else router.push(`/provider/kyc/${step + 1}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (target: number) => router.push(`/provider/kyc/${target}?from=review`);

  return (
    <StepFrame step={step} icon={ICONS[step]!} title={copy.title} hint={copy.hint} onBack={back} onNext={() => void next()}
      nextLabel={fromReview && step < KYC_TOTAL_STEPS ? "Save and return" : undefined} busy={busy} error={error}>
      {step === 1 ? <NameStep /> : null}
      {step === 2 ? <DobStep /> : null}
      {step === 3 ? <AadhaarStep /> : null}
      {step === 4 ? <DocField docKey="selfie" label="Selfie" selfie hint="Face the light, no sunglasses or cap." /> : null}
      {step === 5 ? <PanStep /> : null}
      {step === 6 ? <AreasStep /> : null}
      {step === 7 ? <ServicesStep /> : null}
      {step === 8 ? <ExtrasStep /> : null}
      {step === 9 ? <ReviewStep onEdit={edit} onTerms={() => setTerms(true)} /> : null}
      <TermsSheet visible={terms} onClose={() => setTerms(false)} />
    </StepFrame>
  );
}

function NameStep() {
  const { draft, set } = useKycWizard();
  return (
    <>
      <TextField label="First name" value={draft.firstName} onChangeText={(t) => set("firstName", t)}
        autoCapitalize="words" autoComplete="given-name" placeholder="e.g. Ramesh" maxLength={40} />
      <TextField label="Last name" value={draft.lastName} onChangeText={(t) => set("lastName", t)}
        autoCapitalize="words" autoComplete="family-name" placeholder="e.g. Patel" maxLength={40} />
    </>
  );
}

function DobStep() {
  const { draft, set } = useKycWizard();
  const complete = draft.dobText.length === 10;
  const notReal = complete && !parseDobInput(draft.dobText);
  return (
    <TextField label="Date of birth" value={draft.dobText} onChangeText={(t) => set("dobText", formatDobInput(t))}
      keyboardType="number-pad" placeholder="DD/MM/YYYY" maxLength={10}
      error={notReal ? "That is not a real date." : undefined} hint="Day, month, year. For example 05/03/1990." />
  );
}

function AadhaarStep() {
  const { draft, set, record } = useKycWizard();
  const digits = normalizeAadhaar(draft.aadhaarNumber);
  const checked = digits.length === 12;
  const valid = checked && validateAadhaar(digits);
  return (
    <>
      <TextField label="12-digit Aadhaar number" value={groupDigits(digits)} onChangeText={(t) => set("aadhaarNumber", t.replace(/\D/g, "").slice(0, 12))}
        keyboardType="number-pad" placeholder="1234 5678 9012" maxLength={14}
        error={checked && !valid ? "That number does not pass the check. Look for a typo." : undefined}
        hint={checked && valid ? "✓ Number looks right." : record.aadhaarOnFile ? `Saved: ${maskAadhaar(record.aadhaarLast4 ?? "XXXX")}. Leave empty to keep it.` : undefined} />
      <DocField docKey="aadhaar_front" label="Front of the card" hint="Your name, photo and number must be readable." />
      <DocField docKey="aadhaar_back" label="Back of the card" required={false} hint="Helps us check your address." />
    </>
  );
}

function PanStep() {
  const { draft, set } = useKycWizard();
  const pan = draft.panNumber.toUpperCase();
  const checked = pan.length === 10;
  return (
    <>
      <TextField label="PAN number" value={pan} onChangeText={(t) => set("panNumber", t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
        autoCapitalize="characters" autoCorrect={false} placeholder="ABCDE1234F" maxLength={10}
        error={checked && !validatePAN(pan) ? "PAN is 5 letters, 4 digits, then 1 letter." : undefined}
        hint={checked && validatePAN(pan) ? "✓ Format looks right." : undefined} />
      <DocField docKey="pan" label="Photo of your PAN card" />
    </>
  );
}

function AreasStep() {
  const { draft, set } = useKycWizard();
  return <ServiceAreasField areas={draft.areas} onChange={(areas) => set("areas", areas)} />;
}

function ServicesStep() {
  const { draft, set } = useKycWizard();
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const toggle = (id: string) =>
    set("serviceIds", draft.serviceIds.includes(id) ? draft.serviceIds.filter((s) => s !== id) : [...draft.serviceIds, id]);
  return (
    <>
      {services.isPending ? <Body muted>Loading services…</Body> : null}
      {services.isError ? (
        <View className="gap-2">
          <ErrorBanner message={loadErrorMessage("services", services.error)} />
          <TextLink label="Try again" onPress={() => void services.refetch()} />
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {(services.data ?? []).map((s) => <Chip key={s.id} label={s.name} selected={draft.serviceIds.includes(s.id)} onPress={() => toggle(s.id)} />)}
      </View>
      <TextField label="Years of experience" value={draft.experienceYears} onChangeText={(t) => set("experienceYears", t.replace(/\D/g, "").slice(0, 2))}
        keyboardType="number-pad" maxLength={2} placeholder="e.g. 5" hint="Write 0 if you are new to this work." />
    </>
  );
}

function ExtrasStep() {
  const { draft, set } = useKycWizard();
  return (
    <>
      <DocField docKey="certificate" label="Trade certificate or licence" required={false} hint="For example an ITI certificate." />
      <TextField label="About your work" value={draft.bio} onChangeText={(t) => set("bio", t)} multiline maxLength={KYC_BIO_MAX}
        placeholder="e.g. 8 years fixing ACs and fridges. Own tools. Always on time."
        hint={`${draft.bio.length}/${KYC_BIO_MAX} characters. Customers see this on your profile.`} />
    </>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-line py-2">
      <View className="flex-1">
        <Text className="text-xs uppercase tracking-wider text-muted">{label}</Text>
        <Text className="text-base font-semibold text-fg">{value}</Text>
      </View>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Change ${label}`} onPress={onEdit} hitSlop={8} className="min-h-[44px] justify-center px-2">
          <Text className="text-sm font-semibold text-brand">Change</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReviewStep({ onEdit, onTerms }: { onEdit: (step: number) => void; onTerms: () => void }) {
  const colors = useThemeColors();
  const { draft, set, record, facts, hasDoc, problems } = useKycWizard();
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const typed = normalizeAadhaar(draft.aadhaarNumber);
  const aadhaar = typed.length === 12 ? maskAadhaar(typed.slice(-4)) : record.aadhaarOnFile ? maskAadhaar(record.aadhaarLast4 ?? "XXXX") : "Not added";
  const names = (services.data ?? []).filter((s) => draft.serviceIds.includes(s.id)).map((s) => s.name);
  const open = problems.filter((p) => p.step < KYC_TOTAL_STEPS);
  const yes = (v: boolean) => (v ? "Added" : "Missing");

  return (
    <>
      {open.length ? (
        <View accessibilityRole="alert" className="gap-2 rounded-tile border border-danger bg-danger/10 p-3">
          <Text className="text-sm font-semibold text-danger">Fix these before you submit</Text>
          {open.map((p) => (
            <Pressable key={p.step} accessibilityRole="button" onPress={() => onEdit(p.step)} className="min-h-[44px] justify-center">
              <Text className="text-sm text-danger">• {p.message} <Text className="font-semibold underline">Fix</Text></Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Card>
        <Row label="Name" value={`${draft.firstName.trim()} ${draft.lastName.trim()}`.trim() || "Missing"} onEdit={() => onEdit(1)} />
        <Row label="Date of birth" value={draft.dobText || "Missing"} onEdit={() => onEdit(2)} />
        <Row label="Aadhaar" value={`${aadhaar} · front ${yes(hasDoc("aadhaar_front")).toLowerCase()}`} onEdit={() => onEdit(3)} />
        <Row label="Selfie" value={yes(hasDoc("selfie"))} onEdit={() => onEdit(4)} />
        <Row label="PAN" value={`${draft.panNumber ? maskPAN(draft.panNumber.toUpperCase()) : "Not added"} · card ${yes(hasDoc("pan")).toLowerCase()}`} onEdit={() => onEdit(5)} />
        <Row label="Work areas" value={draft.areas.length ? draft.areas.join(", ") : "Missing"} onEdit={() => onEdit(6)} />
        <Row label="Services" value={names.length ? names.join(", ") : draft.serviceIds.length ? `${draft.serviceIds.length} selected` : "Missing"} onEdit={() => onEdit(7)} />
        <Row label="Experience" value={draft.experienceYears ? `${draft.experienceYears} years` : "Missing"} onEdit={() => onEdit(7)} />
        <Row label="Certificate" value={hasDoc("certificate") ? "Added" : "None"} onEdit={() => onEdit(8)} />
      </Card>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.termsAccepted }}
        onPress={() => set("termsAccepted", !draft.termsAccepted)} className="min-h-[48px] flex-row items-start gap-3">
        <View className={`mt-0.5 h-7 w-7 items-center justify-center rounded-lg border-2 ${draft.termsAccepted ? "border-brand bg-brand" : "border-line bg-card"}`}>
          {draft.termsAccepted ? <Check size={18} color={colors.onBrand} /> : null}
        </View>
        <Text className="flex-1 text-sm leading-5 text-fg">
          I confirm that everything I submitted is genuine and belongs to me, and I agree to the HandyFix Pro Partner Agreement.
        </Text>
      </Pressable>
      <TextLink label="Read the Partner Agreement" onPress={onTerms} />
      {facts.termsAccepted ? null : <Text className="text-center text-xs text-muted">Tick the box to submit.</Text>}
    </>
  );
}
