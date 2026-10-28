import { useEffect, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import { Text } from "@/components/text";
import { Button } from "@/components/ui";
import { env } from "@/lib/env";

type Point = { latitude: number; longitude: number };

/**
 * Live map of the pro and the customer's address. The embedded map needs a Google Maps key in the build; without
 * one (or on web) the card still works: it hands off to Google Maps with the pro's position.
 */
export function TrackingMap({ pro, destination }: { pro: Point | null; destination: Point | null }) {
  const canEmbed = env.mapsEnabled && Platform.OS !== "web" && !!destination;
  return canEmbed ? <NativeMap pro={pro} destination={destination!} /> : <MapFallback pro={pro} destination={destination} />;
}

function NativeMap({ pro, destination }: { pro: Point | null; destination: Point }) {
  // Loaded lazily so web builds and non-map screens never import the native module.
  const Maps = require("react-native-maps") as typeof import("react-native-maps");
  const MapView = Maps.default;
  const ref = useRef<InstanceType<typeof MapView>>(null);

  useEffect(() => {
    const points = pro ? [pro, destination] : [destination];
    ref.current?.fitToCoordinates(points, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
  }, [pro?.latitude, pro?.longitude, destination.latitude, destination.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View className="h-64 overflow-hidden rounded-2xl border border-line">
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        provider={Maps.PROVIDER_GOOGLE}
        initialRegion={{ ...destination, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        toolbarEnabled={false}
        accessibilityLabel="Map showing your pro and your address"
      >
        <Maps.Marker coordinate={destination} title="Your address" pinColor="#2FB36D" />
        {pro ? <Maps.Marker coordinate={pro} title="Your pro" pinColor="#B05526" /> : null}
      </MapView>
    </View>
  );
}

function MapFallback({ pro, destination }: { pro: Point | null; destination: Point | null }) {
  const target = pro ?? destination;
  return (
    <View className="gap-2 rounded-2xl border border-line bg-card p-4">
      <Text className="text-base font-semibold text-fg">{pro ? "Your pro is on the way" : "Waiting for your pro's location"}</Text>
      <Text className="text-sm text-muted">The in-app map needs the phone app with maps enabled. You can follow your pro in Google Maps.</Text>
      {target ? (
        <Button label="Open in Google Maps" variant="secondary"
          onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${target.latitude},${target.longitude}`)} />
      ) : null}
    </View>
  );
}
