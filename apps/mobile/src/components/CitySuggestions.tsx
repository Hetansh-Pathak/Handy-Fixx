import { suggestCities } from "@handyfix/shared";
import { MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { useThemeColors } from "@/theme/theme";

/**
 * Gujarat cities that start with what was typed ("jam" → Jamnagar, Jamjodhpur, Jam Khambhalia).
 * Hidden until two letters are typed, for pincodes, and once the text already is a city.
 */
export function CitySuggestions({ query, onPick, exclude = [], limit = 6 }: {
  query: string; onPick: (city: string) => void; exclude?: readonly string[]; limit?: number;
}) {
  const colors = useThemeColors();
  const typed = query.trim().toLowerCase();
  const cities = suggestCities(query, exclude, limit).filter((c) => c.toLowerCase() !== typed);
  if (!cities.length) return null;
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel="City suggestions">
      {cities.map((c) => (
        <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Use ${c}`} onPress={() => onPick(c)}
          className="min-h-[40px] flex-row items-center gap-1.5 rounded-full border border-line bg-card px-3 active:opacity-80">
          <MapPin size={14} color={colors.brand} />
          <Text className="text-sm font-medium text-fg">{c}</Text>
        </Pressable>
      ))}
    </View>
  );
}
