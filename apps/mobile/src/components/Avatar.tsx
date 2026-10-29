import { nameInitials } from "@handyfix/shared";
import { useState } from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/text";

/** Round profile photo; falls back to terracotta initials when there is no photo or it fails to load. */
export function Avatar({ name, url, size = 64 }: { name: string | null | undefined; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!url && failed !== url;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2 }} className="items-center justify-center overflow-hidden bg-brand">
      {showPhoto ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover"
          accessibilityLabel={`Photo of ${name ?? "pro"}`} onError={() => setFailed(url)} />
      ) : (
        <Text style={{ fontSize: size * 0.38 }} className="font-bold text-onbrand">{nameInitials(name)}</Text>
      )}
    </View>
  );
}
