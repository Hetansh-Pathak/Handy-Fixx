import { KYC_STEP_LABELS, KYC_TOTAL_STEPS, PARTNER_TERMS, PARTNER_TERMS_EFFECTIVE, PARTNER_TERMS_TITLE, TERMS_VERSION, type KycDocKey } from "@handyfix/shared";
import { Camera, CircleCheck, ImagePlus, Trash2, X, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { Button, ErrorBanner, Screen, ScreenHeader, TextLink } from "@/components/ui";
import { IconTile } from "@/components/brand";
import { useThemeColors } from "@/theme/theme";
import { isPermissionDenied, pickKycImage } from "./images";
import { useKycWizard } from "./wizard-context";
import { ScreenBackground } from "@/components/screen-background";

/** The frame every step shares: header, progress, the rejection reason, one primary button. */
export function StepFrame({ step, icon: Icon, title, hint, onBack, onNext, nextLabel, busy, error, children }: {
  step: number;
  icon: LucideIcon;
  title: string;
  hint: string;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  busy: boolean;
  error: string | null;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const { record } = useKycWizard();
  const percent = Math.round((step / KYC_TOTAL_STEPS) * 100);
  const last = step === KYC_TOTAL_STEPS;
  return (
    <Screen>
      <ScreenHeader title="Identity check" onBack={onBack} />
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-brand">Step {step} of {KYC_TOTAL_STEPS} · {KYC_STEP_LABELS[step]}</Text>
          <Text className="text-sm text-muted">{percent}%</Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: KYC_TOTAL_STEPS, now: step }} className="h-2 overflow-hidden rounded-full bg-field">
          <View className="h-2 rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </View>
      </View>

      {record.kycStatus === "rejected" ? (
        <View accessibilityRole="alert" className="gap-1 rounded-tile border border-danger bg-danger/10 p-3">
          <Text className="text-sm font-semibold text-danger">Fix what the reviewer asked for</Text>
          <Text className="text-sm text-danger">{record.rejectionReason?.trim() || "Please correct your details and upload clear photos."}</Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-3 pt-1">
        <IconTile size={48}><Icon size={24} color={colors.brand} /></IconTile>
        <View className="flex-1 gap-0.5">
          <Text className="text-xl font-bold text-fg">{title}</Text>
          <Text className="text-sm text-muted">{hint}</Text>
        </View>
      </View>

      <View className="gap-4">{children}</View>

      <ErrorBanner message={error} />
      <Button label={nextLabel ?? (last ? "Submit for review" : "Save and continue")} loading={busy} onPress={onNext} />
    </Screen>
  );
}

/**
 * One document: take a photo or pick one, preview it, retake or remove.
 * A document saved earlier shows as "Uploaded"; the pro only touches it to replace it.
 */
export function DocField({ docKey, label, hint, required = true, selfie = false }: {
  docKey: KycDocKey;
  label: string;
  hint?: string;
  required?: boolean;
  /** Opens the front camera first; the gallery stays available as a smaller option. */
  selfie?: boolean;
}) {
  const colors = useThemeColors();
  const { localDoc, hasDoc, setDoc } = useKycWizard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSettings, setNeedsSettings] = useState(false);
  const local = localDoc(docKey);
  const present = hasDoc(docKey);

  const pick = async (source: "camera" | "gallery") => {
    setBusy(true);
    setError(null);
    setNeedsSettings(false);
    try {
      const doc = await pickKycImage(source, { frontCamera: selfie });
      if (doc) setDoc(docKey, doc);
    } catch (e) {
      setNeedsSettings(isPermissionDenied(e));
      setError(e instanceof Error ? e.message : "Could not open the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-fg">{label}{required ? "" : " (optional)"}</Text>
      {hint ? <Text className="text-sm text-muted">{hint}</Text> : null}

      {present ? (
        <View className="gap-3 rounded-tile border border-ok/50 bg-ok/5 p-3">
          <View className="flex-row items-center gap-3">
            {local ? (
              <Image source={{ uri: local.uri }} accessibilityLabel={`${label} preview`} style={{ width: 72, height: 72, borderRadius: 12 }} />
            ) : (
              <View className="h-[72px] w-[72px] items-center justify-center rounded-tile bg-ok/10"><CircleCheck size={32} color={colors.ok} /></View>
            )}
            <View className="flex-1">
              <Text className="text-base font-semibold text-ok">{local ? "Photo ready" : "Uploaded"}</Text>
              <Text className="text-sm text-muted">{local ? "It uploads when you save this step." : "Saved on your application."}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            <SmallAction icon={Camera} label={selfie ? "Retake" : "Retake photo"} disabled={busy} onPress={() => void pick("camera")} />
            <SmallAction icon={ImagePlus} label="Choose another" disabled={busy} onPress={() => void pick("gallery")} />
            {!required || local ? <SmallAction icon={Trash2} label="Remove" danger disabled={busy} onPress={() => setDoc(docKey, null)} /> : null}
          </View>
        </View>
      ) : (
        <View className="gap-2 rounded-tile border-2 border-dashed border-line bg-card p-4">
          {busy ? <ActivityIndicator color={colors.brand} /> : null}
          <Button label={selfie ? "Take a selfie" : "Take a photo"} variant="primary" disabled={busy} onPress={() => void pick("camera")} />
          <Button label="Choose from gallery" variant="secondary" disabled={busy} onPress={() => void pick("gallery")} />
          <Text className="text-center text-xs text-muted">JPG, PNG or WebP. We shrink it for you.</Text>
        </View>
      )}

      <ErrorBanner message={error} />
      {needsSettings ? <TextLink label="Open phone settings" onPress={() => void Linking.openSettings()} /> : null}
    </View>
  );
}

function SmallAction({ icon: Icon, label, onPress, disabled, danger = false }: {
  icon: LucideIcon; label: string; onPress: () => void; disabled: boolean; danger?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      className={`min-h-[44px] flex-row items-center gap-2 rounded-tile border border-line bg-card px-3 ${disabled ? "opacity-40" : "active:opacity-80"}`}>
      <Icon size={16} color={danger ? colors.danger : colors.brand} />
      <Text className={`text-sm font-semibold ${danger ? "text-danger" : "text-fg"}`}>{label}</Text>
    </Pressable>
  );
}

/** The full Partner Agreement in a sheet. Reused by the Help screens. */
export function TermsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScreenBackground><SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between border-b border-line px-5 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-lg font-bold text-fg" numberOfLines={2}>{PARTNER_TERMS_TITLE}</Text>
            <Text className="text-xs text-muted">{TERMS_VERSION} · effective {PARTNER_TERMS_EFFECTIVE}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close agreement" onPress={onClose} hitSlop={12}
            className="min-h-[44px] min-w-[44px] items-center justify-center"><X size={24} color={colors.fg} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {PARTNER_TERMS.map((s) => (
            <View key={s.heading} className="gap-1">
              <Text className="text-base font-semibold text-fg">{s.heading}</Text>
              <Text className="text-base leading-6 text-muted">{s.body}</Text>
            </View>
          ))}
          <Button label="Close" variant="secondary" onPress={onClose} />
        </ScrollView>
      </SafeAreaView></ScreenBackground>
    </Modal>
  );
}
