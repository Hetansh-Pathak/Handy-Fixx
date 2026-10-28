import { KYC_TOTAL_STEPS } from "@handyfix/shared";
import { Redirect, useLocalSearchParams } from "expo-router";
import { KycStepScreen } from "@/features/kyc/steps";
import { useKycWizard } from "@/features/kyc/wizard-context";

export default function KycStepRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const { record } = useKycWizard();
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > KYC_TOTAL_STEPS) return <Redirect href="/provider/kyc" />;
  // Once submitted (pending or approved) the application is read-only: show its status instead of the form.
  if (record.kycStatus === "pending" || record.kycStatus === "approved") return <Redirect href="/provider/kyc" />;
  return <KycStepScreen step={n} />;
}
