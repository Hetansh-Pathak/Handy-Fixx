import {
  billFromBooking, canAddExtraWork, canAnswerExtraWork, formatInr, resolveAttachmentMime, validateNewExtraWork,
  type BookingStatus, type ExtraRow, type ExtraWorkKind,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Button, Card, Chip, ErrorBanner, TextField } from "@/components/ui";
import { addExtra, billPhotoUrl, decideExtra, extrasKey, fetchExtras, uploadBillPhoto, withdrawExtra } from "./api";

const STATUS_TEXT: Record<ExtraRow["status"], string> = {
  pending: "Waiting for customer",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/** Polls only while extras can still change; a finished job's list is stable. */
export function useExtras(bookingId: string, status: BookingStatus) {
  const live = canAnswerExtraWork(status);
  return useQuery({
    queryKey: extrasKey(bookingId),
    queryFn: () => fetchExtras(bookingId),
    enabled: status !== "pending" && status !== "confirmed" && status !== "cancelled",
    refetchInterval: live ? 10_000 : false,
  });
}

function BillPhoto({ path }: { path: string }) {
  const url = useQuery({ queryKey: ["extra-photo", path], queryFn: () => billPhotoUrl(path), staleTime: 50 * 60_000 });
  if (!url.data) return <Text className="text-xs text-muted">Bill photo attached</Text>;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open the bill photo" onPress={() => void Linking.openURL(url.data!)}
      className="h-20 w-20 overflow-hidden rounded-tile border border-line active:opacity-80">
      <Image source={{ uri: url.data }} className="h-full w-full" resizeMode="cover" />
    </Pressable>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className={`text-base ${strong ? "font-semibold text-fg" : "text-muted"}`}>{label}</Text>
      <Text className={`text-base ${strong ? "font-bold text-brand" : "text-fg"}`}>{value}</Text>
    </View>
  );
}

/** Service price, approved extras, parts and the total: the same numbers on both apps (PDF p.3). */
export function BillCard({ providerAmount, rows, payTo }: { providerAmount: number | string | null; rows: ExtraRow[]; payTo?: string }) {
  const bill = billFromBooking({ provider_amount: providerAmount }, rows);
  return (
    <Card>
      <Row label="Service price" value={formatInr(bill.rate)} />
      {bill.extraServiceTotal > 0 ? <Row label="Extra work approved" value={`+ ${formatInr(bill.extraServiceTotal)}`} /> : null}
      {bill.partsTotal > 0 ? <Row label="Parts (bill attached)" value={`+ ${formatInr(bill.partsTotal)}`} /> : null}
      <Row label="Platform fee" value={formatInr(bill.customerPlatformFee)} />
      <Row label={payTo ? `Pay ${payTo}` : "Total"} value={formatInr(bill.customerTotal)} strong />
      {bill.pendingTotal > 0 ? <Text className="text-xs text-muted">{formatInr(bill.pendingTotal)} more is waiting for approval and is not in the total.</Text> : null}
    </Card>
  );
}

/** Customer: one-tap Approve / Decline for each pending item. Nothing is added without a tap (PDF p.5). */
export function CustomerExtras({ bookingId, status, pro, total }: { bookingId: string; status: BookingStatus; pro: string; total: number }) {
  const queryClient = useQueryClient();
  const extras = useExtras(bookingId, status);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = (extras.data ?? []).filter((e) => e.status === "pending");
  if (!pending.length || !canAnswerExtraWork(status)) return null;

  const answer = async (id: string, approve: boolean) => {
    setBusy(id + approve);
    setError(null);
    try {
      await decideExtra(id, approve);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: extrasKey(bookingId) }),
        queryClient.invalidateQueries({ queryKey: ["booking", bookingId] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answer.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3 rounded-tile border border-brand bg-brand/10 p-4">
      <Text className="text-lg font-semibold text-fg">Extra work request</Text>
      <ErrorBanner message={error} />
      {pending.map((e) => (
        <View key={e.id} className="gap-2 rounded-tile bg-card p-3">
          <View className="flex-row justify-between gap-3">
            <Text className="flex-1 text-base font-semibold text-fg">{e.title}</Text>
            <Text className="text-base font-bold text-brand">+ {formatInr(Number(e.amount))}</Text>
          </View>
          <Text className="text-xs text-muted">{e.kind === "parts" ? "Parts or materials, bill photo attached." : "Extra labour."} Your price stays {formatInr(total)} unless you approve.</Text>
          {e.photo_path ? <BillPhoto path={e.photo_path} /> : null}
          <Text className="text-sm text-fg">If approved: {formatInr(total + Number(e.amount))}</Text>
          <View className="flex-row gap-2">
            <View className="flex-1"><Button label="Decline" variant="secondary" loading={busy === e.id + "false"} disabled={!!busy} onPress={() => void answer(e.id, false)} /></View>
            <View className="flex-1"><Button label="Approve" loading={busy === e.id + "true"} disabled={!!busy} onPress={() => void answer(e.id, true)} /></View>
          </View>
        </View>
      ))}
      <Text className="text-xs text-muted">Ask {pro} about anything you are unsure of before you approve.</Text>
    </View>
  );
}

/** Pro: list of extras with withdraw, and the "+ Add extra work" form (parts need a bill photo, PDF p.7). */
export function ProviderExtras({ bookingId, status, userId }: { bookingId: string; status: BookingStatus; userId: string }) {
  const queryClient = useQueryClient();
  const extras = useExtras(bookingId, status);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<ExtraWorkKind>("service");
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (extras.data ?? []).filter((e) => e.status !== "withdrawn");
  const addable = canAddExtraWork(status);
  if (!addable && !rows.length) return null;

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: extrasKey(bookingId) }),
    queryClient.invalidateQueries({ queryKey: ["provider-booking", bookingId] }),
  ]);

  const pick = async (camera: boolean) => {
    setError(null);
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setError("Camera permission was denied. Pick the photo from the gallery instead."); return; }
    }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (r.canceled) return;
    const a = r.assets[0];
    setPhoto({ uri: a.uri, mimeType: resolveAttachmentMime(a.mimeType, a.fileName ?? a.uri) ?? "image/jpeg" });
    setErrors((x) => ({ ...x, billPhoto: "" }));
  };

  const submit = async () => {
    const value = Number(amount);
    const found = validateNewExtraWork({ description: title, amount: value, kind, billPhotoPath: photo ? "picked" : null }, status);
    setErrors(found as Record<string, string>);
    if (Object.keys(found).length) return;
    setBusy("add");
    setError(null);
    try {
      const path = kind === "part" && photo ? await uploadBillPhoto(userId, bookingId, photo.uri, photo.mimeType) : null;
      await addExtra({ bookingId, title, amount: Math.round(value), kind, photoPath: path });
      setTitle(""); setAmount(""); setPhoto(null); setKind("service"); setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the extra work.");
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await withdrawExtra(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw it.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Text className="text-lg font-semibold text-fg">Extra work</Text>
      <ErrorBanner message={error} />
      {rows.map((e) => (
        <View key={e.id} className="gap-1 border-b border-line pb-2">
          <View className="flex-row justify-between gap-3">
            <Text className="flex-1 text-base text-fg">{e.title}{e.kind === "parts" ? " (parts)" : ""}</Text>
            <Text className="text-base font-semibold text-fg">+ {formatInr(Number(e.amount))}</Text>
          </View>
          <Text className={`text-xs ${e.status === "approved" ? "text-ok" : e.status === "declined" ? "text-danger" : "text-brand"}`}>{STATUS_TEXT[e.status]}</Text>
          {e.status === "pending" && addable ? (
            <Button label="Withdraw" variant="secondary" loading={busy === e.id} disabled={!!busy} onPress={() => void withdraw(e.id)} />
          ) : null}
        </View>
      ))}
      {rows.some((e) => e.status === "pending") ? <Text className="text-xs text-muted">The job can close only after the customer approves or declines every item.</Text> : null}
      {addable && !open ? <Button label="+ Add extra work" variant="secondary" onPress={() => setOpen(true)} /> : null}
      {addable && open ? (
        <View className="gap-3">
          <View className="flex-row gap-2">
            <Chip label="Labour" selected={kind === "service"} onPress={() => setKind("service")} />
            <Chip label="Parts / materials" selected={kind === "part"} onPress={() => setKind("part")} />
          </View>
          <TextField label="What is the extra work?" value={title} onChangeText={setTitle} error={errors.description || undefined} placeholder="Pipe joint replaced" maxLength={120} />
          <TextField label="Amount (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, "").slice(0, 6))} error={errors.amount || undefined} keyboardType="number-pad" />
          {kind === "part" ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-fg">Photo of the shop bill (required for parts)</Text>
              {photo ? <Image source={{ uri: photo.uri }} className="h-24 w-24 rounded-tile" resizeMode="cover" accessibilityLabel="Bill photo" /> : null}
              <View className="flex-row gap-2">
                <View className="flex-1"><Button label="Camera" variant="secondary" onPress={() => void pick(true)} /></View>
                <View className="flex-1"><Button label="Gallery" variant="secondary" onPress={() => void pick(false)} /></View>
              </View>
              {errors.billPhoto ? <Text className="text-sm text-danger">{errors.billPhoto}</Text> : null}
              <Text className="text-xs text-muted">Parts are not part of your HandyFix fee.</Text>
            </View>
          ) : null}
          {errors.status ? <Text className="text-sm text-danger">{errors.status}</Text> : null}
          <Button label="Send to customer for approval" loading={busy === "add"} onPress={() => void submit()} />
          <Button label="Cancel" variant="secondary" disabled={busy === "add"} onPress={() => { setOpen(false); setErrors({}); }} />
        </View>
      ) : null}
    </Card>
  );
}
