import { addServiceArea, isValidPincode, MAX_SERVICE_AREAS, normalizeServiceArea, suggestCities } from "@handyfix/shared";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Body, Button, Chip, TextField } from "@/components/ui";

/**
 * The cities and 6-digit pincodes a pro covers (`service_providers.pincodes`). Used by the Edit profile
 * screen and by the identity wizard so both follow the same rules (`addServiceArea`).
 */
export function ServiceAreasField({ areas, onChange, onCityFound }: {
  areas: string[];
  onChange: (areas: string[]) => void;
  /** Called with the city found from the phone's position, so a form can fill its "base city" box. */
  onCityFound?: (city: string) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const suggestions = useMemo(() => suggestCities(input, areas), [input, areas]);

  const add = (text: string) => {
    const r = addServiceArea(areas, text);
    if (!r.ok) return setError(r.error);
    onChange(r.areas);
    setInput("");
    setError(null);
  };

  /** Adds the city and pincode the phone is in right now (foreground permission only). */
  const addCurrent = async () => {
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error("Location permission was denied. You can type the city or pincode instead.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      const found = [place?.postalCode, place?.city, place?.subregion]
        .filter((v): v is string => !!v)
        .map(normalizeServiceArea)
        .filter((v): v is string => !!v);
      let next = areas;
      for (const a of found) {
        const r = addServiceArea(next, a);
        if (r.ok) next = r.areas;
      }
      if (next === areas) {
        throw new Error(found.length ? "Your current area is already in the list." : "Could not find a Gujarat city or pincode here. Type it instead.");
      }
      onChange(next);
      const city = found.find((a) => !isValidPincode(a));
      if (city) onCityFound?.(city);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View className="gap-3">
      {areas.length ? (
        <View className="flex-row flex-wrap gap-2">
          {areas.map((a) => <Chip key={a} label={`${a}  ✕`} selected onPress={() => onChange(areas.filter((x) => x !== a))} />)}
        </View>
      ) : <Body muted>No areas yet.</Body>}
      <TextField label="Add a city or pincode" value={input} onChangeText={(t) => { setInput(t); setError(null); }}
        error={error ?? undefined} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => add(input)}
        hint={`${areas.length} of ${MAX_SERVICE_AREAS}. Tap an area to remove it.`} />
      {suggestions.length ? (
        <View className="flex-row flex-wrap gap-2">
          {suggestions.map((c) => <Chip key={c} label={`+ ${c}`} onPress={() => add(c)} />)}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1"><Button label="Add" variant="secondary" disabled={!input.trim()} onPress={() => add(input)} /></View>
        <View className="flex-[2]"><Button label="Add my current area" variant="secondary" loading={locating} onPress={() => void addCurrent()} /></View>
      </View>
    </View>
  );
}
