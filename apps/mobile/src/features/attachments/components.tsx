import { ATTACHMENT_LIMITS, checkAttachment, formatClipDuration, photosLeft, resolveAttachmentMime } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus,
  useAudioRecorder, useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Mic, Pause, Play, Square, Trash2, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { colors } from "@/theme/colors";
import { attachmentsKey, fetchBookingAttachments, type LocalAttachment } from "./api";

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function SmallButton({ label, icon: Icon, onPress, disabled = false }: {
  label: string; icon: typeof Camera; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      className={`min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 ${disabled ? "opacity-40" : "active:opacity-80"}`}>
      <Icon size={18} color={colors.brand} />
      <Text className="text-sm font-semibold text-fg">{label}</Text>
    </Pressable>
  );
}

/** Play/pause for one clip (a local recording or a signed URL). */
export function AudioClip({ uri, durationSeconds, onRemove }: { uri: string; durationSeconds: number | null; onRemove?: () => void }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  const toggle = () => (status.playing ? player.pause() : player.play());
  const total = status.duration || durationSeconds || 0;
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-line bg-field p-2">
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? "Pause voice note" : "Play voice note"} onPress={toggle}
        className="h-11 w-11 items-center justify-center rounded-full bg-brand active:opacity-80">
        {status.playing ? <Pause size={18} color={colors.white} /> : <Play size={18} color={colors.white} />}
      </Pressable>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-fg">Voice note</Text>
        <Text className="text-xs text-muted">{formatClipDuration(status.currentTime)} / {formatClipDuration(total)}</Text>
      </View>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete voice note" onPress={onRemove} hitSlop={8} className="h-11 w-11 items-center justify-center">
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Records one voice note, up to two minutes, then hands it back. */
function VoiceRecorder({ onDone, onError }: { onDone: (a: LocalAttachment) => void; onError: (message: string) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const seconds = state.durationMillis / 1000;

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return onError("Microphone permission was denied. You can type the problem instead.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      onError("Could not start recording.");
    }
  };

  const stopping = useRef(false);
  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const duration = recorder.currentTime || seconds;
    try {
      await recorder.stop();
    } finally {
      stopping.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
    const uri = recorder.uri;
    if (!uri) return onError("The recording could not be saved.");
    // Browsers record WebM (expo-audio's web preset); phones record AAC in .m4a.
    const mimeType = resolveAttachmentMime(null, uri) ?? (Platform.OS === "web" ? "audio/webm" : "audio/mp4");
    const draft: LocalAttachment = { key: newKey(), type: "audio", uri, mimeType, sizeBytes: null, durationSeconds: duration };
    const problem = checkAttachment(draft);
    if (problem) return onError(problem);
    onDone(draft);
  };

  // Stops by itself at the limit.
  useEffect(() => {
    if (state.isRecording && seconds >= ATTACHMENT_LIMITS.maxAudioSeconds) void stop();
  }, [state.isRecording, seconds]); // stop() is guarded against running twice

  if (!state.isRecording) return <SmallButton label="Record voice note" icon={Mic} onPress={() => void start()} />;
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-danger bg-danger/10 p-2">
      <View className="h-3 w-3 rounded-full bg-danger" />
      <Text className="flex-1 text-sm font-semibold text-danger">
        Recording {formatClipDuration(seconds)} / {formatClipDuration(ATTACHMENT_LIMITS.maxAudioSeconds)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop recording" onPress={() => void stop()}
        className="min-h-[44px] flex-row items-center gap-1 rounded-lg bg-danger px-3 active:opacity-80">
        <Square size={14} color={colors.white} fill={colors.white} />
        <Text className="text-sm font-semibold text-white">Stop</Text>
      </Pressable>
    </View>
  );
}

/** Up to 5 photos (gallery or camera) and one voice note, shown with the problem description. */
export function AttachmentPicker({ value, onChange }: { value: LocalAttachment[]; onChange: (next: LocalAttachment[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const photos = value.filter((a) => a.type === "image");
  const voice = value.find((a) => a.type === "audio");
  const left = photosLeft(photos.length);

  const addAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const added: LocalAttachment[] = [];
    let rejected: string | null = null;
    for (const a of assets.slice(0, left)) {
      const mimeType = resolveAttachmentMime(a.mimeType, a.fileName ?? a.uri);
      const draft: LocalAttachment = { key: newKey(), type: "image", uri: a.uri, mimeType: mimeType ?? "", sizeBytes: a.fileSize ?? null, durationSeconds: null };
      const problem = mimeType ? checkAttachment(draft) : "Pick a JPG, PNG or HEIC photo.";
      if (problem) rejected = problem;
      else added.push(draft);
    }
    if (assets.length > left) rejected = `You can add up to ${ATTACHMENT_LIMITS.maxPhotos} photos.`;
    setError(rejected);
    if (added.length) onChange([...value, ...added]);
  };

  const fromGallery = async () => {
    setError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: left, quality: 0.7 });
    if (!r.canceled) addAssets(r.assets);
  };

  const fromCamera = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Camera permission was denied. You can pick a photo from the gallery instead.");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (!r.canceled) addAssets(r.assets);
  };

  const remove = (key: string) => onChange(value.filter((a) => a.key !== key));

  return (
    <View className="gap-3">
      <Text className="text-sm font-medium text-fg">Photos and voice note (optional)</Text>
      {photos.length ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((p) => (
            <View key={p.key} className="h-20 w-20 overflow-hidden rounded-xl border border-line">
              <Image source={{ uri: p.uri }} className="h-full w-full" resizeMode="cover" accessibilityLabel="Problem photo" />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => remove(p.key)} hitSlop={6}
                className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-fg/70">
                <X size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <SmallButton label="Gallery" icon={ImagePlus} disabled={!left} onPress={() => void fromGallery()} />
        <SmallButton label="Camera" icon={Camera} disabled={!left} onPress={() => void fromCamera()} />
      </View>
      {voice ? (
        <AudioClip uri={voice.uri} durationSeconds={voice.durationSeconds} onRemove={() => remove(voice.key)} />
      ) : (
        <VoiceRecorder onDone={(a) => { setError(null); onChange([...value, a]); }} onError={setError} />
      )}
      <Text className="text-xs text-muted">
        {photos.length}/{ATTACHMENT_LIMITS.maxPhotos} photos · voice note up to 2 min. Only your pro sees these.
      </Text>
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

/** What the customer attached, for the booking status and the pro's job screen. Renders nothing if empty. */
export function AttachmentGallery({ bookingId }: { bookingId: string }) {
  // Files upload just after the booking is created: while none are visible yet, keep checking for a few minutes.
  const q = useQuery({
    queryKey: attachmentsKey(bookingId),
    queryFn: () => fetchBookingAttachments(bookingId),
    staleTime: 30 * 60_000,
    refetchInterval: (query) => (query.state.data?.length || query.state.dataUpdateCount > 20 ? false : 10_000),
  });
  const items = q.data ?? [];
  if (q.isError) return <Text className="text-sm text-muted">Could not load the photos for this job.</Text>;
  if (!items.length) return null;
  const photos = items.filter((a) => a.type === "image" && a.url);
  const clips = items.filter((a) => a.type === "audio" && a.url);
  return (
    <View className="gap-2">
      <Text className="text-sm text-muted">Photos and voice note</Text>
      {photos.length ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((p) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel="Open photo" onPress={() => void Linking.openURL(p.url!)}
              className="h-20 w-20 overflow-hidden rounded-xl border border-line active:opacity-80">
              <Image source={{ uri: p.url! }} className="h-full w-full" resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      ) : null}
      {clips.map((c) => <AudioClip key={c.id} uri={c.url!} durationSeconds={c.durationSeconds} />)}
    </View>
  );
}
