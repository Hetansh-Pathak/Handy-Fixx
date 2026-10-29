import { useLocalSearchParams } from "expo-router";
import { LegalScreen } from "@/features/legal/legal-screen";

// Outside the signed-in and signed-out groups on purpose: the privacy policy must be readable before signing in too.
export default function LegalRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  return <LegalScreen doc={doc} />;
}
