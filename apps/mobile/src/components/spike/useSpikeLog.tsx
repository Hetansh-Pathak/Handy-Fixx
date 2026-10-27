import { useCallback, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Card } from "../ui";

export type LogLevel = "info" | "ok" | "fail";
type Line = { id: number; time: string; level: LogLevel; text: string };

let counter = 0;
const stamp = () => new Date().toLocaleTimeString("en-GB");

/** On-screen log so a tester can read results (and screenshot them) without a debugger. */
export function useSpikeLog() {
  const [lines, setLines] = useState<Line[]>([]);
  const log = useCallback((text: string, level: LogLevel = "info") => {
    setLines((prev) => [{ id: ++counter, time: stamp(), level, text }, ...prev].slice(0, 80));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  return { lines, log, clear };
}

const COLOR: Record<LogLevel, string> = { info: "text-muted", ok: "text-ok", fail: "text-danger" };

export function SpikeLog({ lines }: { lines: { id: number; time: string; level: LogLevel; text: string }[] }) {
  return (
    <Card>
      <Text className="text-sm font-semibold text-fg">Log</Text>
      {lines.length === 0 ? <Text className="text-sm text-muted">Nothing yet.</Text> : null}
      {lines.map((l) => (
        <View key={l.id} className="flex-row gap-2">
          <Text className="text-xs text-muted">{l.time}</Text>
          <Text selectable className={`flex-1 text-xs ${COLOR[l.level]}`}>{l.text}</Text>
        </View>
      ))}
    </Card>
  );
}
