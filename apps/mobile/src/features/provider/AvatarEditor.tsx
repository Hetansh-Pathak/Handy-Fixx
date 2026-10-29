import { resolveAttachmentMime } from "@handyfix/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Text } from "@/components/text";
import { providerRowKey } from "@/features/auth/session-provider";
import { useThemeColors } from "@/theme/theme";
import { providerProfileKey, removeProviderAvatar, uploadProviderAvatar } from "./profile-api";

const PICK: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 };

function Action({ label, icon: Icon, onPress, disabled, danger = false }: {
  label: string; icon: typeof Camera; onPress: () => void; disabled: boolean; danger?: boolean;
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

/** Profile photo with gallery / camera / remove. Saves straight away (it is not part of the profile form). */
export function AvatarEditor({ userId, providerId, name, url }: { userId: string; providerId: string; name: string; url: string | null }) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: providerProfileKey(providerId) }),
    queryClient.invalidateQueries({ queryKey: providerRowKey(userId) }),
  ]);

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your photo.");
    } finally {
      setBusy(false);
    }
  };

  const upload = (r: ImagePicker.ImagePickerResult) => {
    const a = r.canceled ? null : r.assets[0];
    if (!a) return;
    void run(() => uploadProviderAvatar({ userId, providerId, uri: a.uri, mimeType: resolveAttachmentMime(a.mimeType, a.fileName ?? a.uri) }));
  };

  const fromGallery = async () => upload(await ImagePicker.launchImageLibraryAsync(PICK));
  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Camera permission was denied. Pick a photo from the gallery instead.");
    upload(await ImagePicker.launchCameraAsync({ ...PICK, cameraType: ImagePicker.CameraType.front }));
  };

  return (
    <View className="items-center gap-3">
      <View>
        <Avatar name={name} url={url} size={96} />
        {busy ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-black/50"><ActivityIndicator color={colors.white} /></View>
        ) : null}
      </View>
      <View className="flex-row flex-wrap justify-center gap-2">
        <Action label={url ? "Change" : "Gallery"} icon={ImagePlus} disabled={busy} onPress={() => void fromGallery()} />
        <Action label="Camera" icon={Camera} disabled={busy} onPress={() => void fromCamera()} />
        {url ? <Action label="Remove" icon={Trash2} danger disabled={busy} onPress={() => void run(() => removeProviderAvatar({ userId, providerId, currentUrl: url }))} /> : null}
      </View>
      <Text className="text-center text-xs text-muted">A clear photo of your face helps customers trust you. Customers see it on your card.</Text>
      {error ? <Text className="text-center text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
