import { formatBookingWhen, formatInr, type RequestEconomics } from "@handyfix/shared";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Image as ImageIcon, Mic } from "lucide-react-native";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Glass } from "@/components/glass";
import { Text } from "@/components/text";
import { Button } from "@/components/ui";
import { attachmentsKey, fetchBookingAttachments } from "@/features/attachments/api";
import { useThemeColors } from "@/theme/theme";
import { serviceNameOf, type ProviderBooking } from "./api";

/**
 * "You have a new request" popup. No timer and no decision here: the pro opens the request to see the full
 * details, photos and voice note, then accepts or declines. "Later" just closes it; the request stays in Jobs → New.
 */
export function RequestPopup({ request, economics, more, onView, onLater }: {
  request: ProviderBooking; economics: RequestEconomics; more: number; onView: () => void; onLater: () => void;
}) {
  const colors = useThemeColors();
  const files = useQuery({ queryKey: attachmentsKey(request.id), queryFn: () => fetchBookingAttachments(request.id) });
  const photos = (files.data ?? []).filter((f) => f.type === "image").length;
  const voice = (files.data ?? []).some((f) => f.type === "audio");

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onLater}>
      <Pressable accessibilityLabel="Close" onPress={onLater} className="flex-1 items-center justify-center bg-black/50 p-6">
        {/* Inner Pressable stops taps on the card from closing it. */}
        <Pressable accessibilityViewIsModal className="w-full max-w-[400px] gap-4 overflow-hidden rounded-hero border border-line p-6" style={{ zIndex: 0 }} onPress={() => undefined}>
          <Glass tone="sheet" intensity={60} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
          <View className="items-center gap-2">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand"><BellRing size={26} color={colors.onBrand} /></View>
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-brand">New job request{more ? ` · +${more} more` : ""}</Text>
            <Text className="text-center text-2xl font-bold text-fg">{serviceNameOf(request)}</Text>
            <Text className="text-center text-sm text-muted">{formatBookingWhen(request.booking_date, request.booking_time)} · {request.city ?? "Nearby"}</Text>
          </View>

          {request.special_instructions ? (
            <Text className="rounded-tile bg-field p-3 text-sm text-fg" numberOfLines={3}>“{request.special_instructions}”</Text>
          ) : null}
          {photos || voice ? (
            <View className="flex-row justify-center gap-4">
              {photos ? <View className="flex-row items-center gap-1.5"><ImageIcon size={16} color={colors.brand} /><Text className="text-sm font-medium text-fg">{photos} {photos === 1 ? "photo" : "photos"}</Text></View> : null}
              {voice ? <View className="flex-row items-center gap-1.5"><Mic size={16} color={colors.brand} /><Text className="text-sm font-medium text-fg">Voice note</Text></View> : null}
            </View>
          ) : null}

          <View className="gap-2 rounded-panel bg-tint p-4">
            <View className="items-center">
              <Text className="text-sm font-semibold text-tint-fg">You earn</Text>
              <Text className="text-4xl font-extrabold text-price">{formatInr(economics.earning)}</Text>
            </View>
            <View className="flex-row justify-between border-t border-line pt-2">
              <Text className="text-sm text-muted">HandyFix fee</Text>
              <Text className="text-sm text-fg">{economics.feeWaived ? `${formatInr(economics.fee)} waived` : formatInr(economics.fee)}</Text>
            </View>
          </View>

          <View className="gap-2">
            <Button label="View request" onPress={onView} />
            <Button label="Later" variant="secondary" onPress={onLater} />
          </View>
          <Text className="text-center text-xs text-muted">No timer. It stays in Jobs → New until you accept or decline.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
