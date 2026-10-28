import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Children, Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { colors } from "@/theme/colors";

/** A white card holding menu rows, with hairlines between them (settings-list style). */
export function MenuGroup({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="overflow-hidden rounded-3xl border border-line bg-card">
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View className="ml-14 h-px bg-line" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function MenuRow({ icon: Icon, label, detail, onPress, danger = false }: {
  icon: LucideIcon; label: string; detail?: string | null; onPress: () => void; danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.fg;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={detail ? `${label}, ${detail}` : label} onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-4 px-4 py-3 active:bg-field">
      <Icon size={22} color={danger ? colors.danger : colors.muted} />
      <View className="flex-1">
        <Text className={`text-base font-medium ${danger ? "text-danger" : "text-fg"}`}>{label}</Text>
        {detail ? <Text className="text-sm text-muted" numberOfLines={1}>{detail}</Text> : null}
      </View>
      {danger ? null : <ChevronRight size={20} color={tint} />}
    </Pressable>
  );
}
