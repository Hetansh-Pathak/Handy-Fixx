import { formatDuration, formatInr } from "@handyfix/shared";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { IconTile, ServiceIcon } from "@/components/brand";
import { Text } from "@/components/text";
import type { ServiceRow } from "./types";

/** Two-column service cards. Tapping one opens the service and its list of pros. */
export function ServiceGrid({ services }: { services: readonly ServiceRow[] }) {
  const router = useRouter();
  return (
    <View className="flex-row flex-wrap justify-between gap-y-4">
      {services.map((s) => (
        <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name}
          onPress={() => router.push({ pathname: "/customer/service/[slug]", params: { slug: s.slug } })}
          className="w-[48%] gap-2 rounded-3xl border border-line bg-card p-4 active:opacity-80">
          <IconTile><ServiceIcon name={s.icon_name} /></IconTile>
          <Text className="mt-2 text-lg font-semibold text-fg">{s.name}</Text>
          {s.description ? <Text className="text-sm leading-5 text-muted" numberOfLines={2}>{s.description}</Text> : null}
          <View className="mt-1 flex-row flex-wrap items-center gap-x-3">
            <Text className="text-base font-bold text-brand">{s.base_price ? `From ${formatInr(s.base_price)}` : "On request"}</Text>
            {s.duration_minutes ? <Text className="text-sm text-muted">{formatDuration(s.duration_minutes)}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
