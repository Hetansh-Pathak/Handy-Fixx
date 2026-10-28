import { formatDuration, formatInr } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { Image, Pressable, View } from "react-native";
import { IconTile, ServiceIcon } from "@/components/brand";
import { Text } from "@/components/text";
import { serviceImage } from "./service-images";
import type { ServiceRow } from "./types";

/** Two-column service cards. Tapping one opens the service and its list of pros. */
export function ServiceGrid({ services }: { services: readonly ServiceRow[] }) {
  const router = useRouter();
  return (
    <View className="flex-row flex-wrap justify-between gap-y-4">
      {services.map((s) => {
        const image = serviceImage(s.slug);
        return (
          <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name}
            onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: s.slug } })}
            className="w-[48%] gap-2 overflow-hidden rounded-3xl border border-line bg-card p-4 active:opacity-80">
            {image ? (
              // Edge to edge across the top of the card (the card has 16 px padding). The wrapper stretches; the
              // image fills it with explicit sizes (web does not size an Image from flex alone).
              <View style={{ marginHorizontal: -16, marginTop: -16, marginBottom: 4, height: 96 }}>
                <Image source={image} accessibilityIgnoresInvertColors resizeMode="cover" style={{ width: "100%", height: "100%" }} />
              </View>
            ) : (
              <IconTile><ServiceIcon name={s.icon_name} /></IconTile>
            )}
            <Text className="mt-2 text-lg font-semibold text-fg">{s.name}</Text>
            {s.description ? <Text className="text-sm leading-5 text-muted" numberOfLines={2}>{s.description}</Text> : null}
            <View className="mt-1 flex-row flex-wrap items-center gap-x-3">
              <Text className="text-base font-bold text-brand">{s.base_price ? `Starts at ${formatInr(s.base_price)}` : "On request"}</Text>
              {s.duration_minutes ? <Text className="text-sm text-muted">{formatDuration(s.duration_minutes)}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
