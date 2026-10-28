import {
  DAY_NAMES, MIN_WINDOW_MINUTES, copyDayTo, describeDay, formatSlot, normalizeClock, validateWindow, windowsOn, type DayName,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, Screen, ScreenHeader, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import { addWindow, availabilityKey, deleteWindow, fetchAvailability, replaceDays, updateWindow, type ScheduleRow } from "@/features/schedule/api";
import { colors } from "@/theme/colors";

const ORDER: DayName[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const LABEL: Record<DayName, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};
const WEEKDAYS: DayName[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** Every half hour from 6 AM to 10 PM. */
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const t = 6 * 60 + i * 30;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
});

export default function Schedule() {
  const { provider } = useSession();
  return provider ? <ScheduleScreen providerId={provider.id} approved={provider.kyc_status === "approved"} /> : null;
}

function ScheduleScreen({ providerId, approved }: { providerId: string; approved: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: availabilityKey(providerId), queryFn: () => fetchAvailability(providerId) });
  const [editing, setEditing] = useState<{ day: DayName; id: string | null } | null>(null);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = rows.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: availabilityKey(providerId) });

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await task(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  };

  const openAdd = (day: DayName) => { setEditing({ day, id: null }); setStart("09:00"); setEnd("17:00"); setFormError(null); };
  const openEdit = (r: ScheduleRow) => {
    setEditing({ day: r.day_of_week as DayName, id: r.id });
    setStart(normalizeClock(r.start_time) ?? "09:00");
    setEnd(normalizeClock(r.end_time) ?? "17:00");
    setFormError(null);
  };

  const save = () => {
    if (!editing) return;
    const others = data.filter((r) => r.day_of_week === editing.day && r.id !== editing.id).map((r) => ({ start: r.start_time, end: r.end_time }));
    const problem = validateWindow(start, end, others);
    if (problem) return setFormError(problem);
    void run(async () => {
      if (editing.id) await updateWindow(editing.id, { start_time: start, end_time: end });
      else await addWindow(providerId, editing.day, start, end);
      setEditing(null);
    });
  };

  const copyToWeekdays = (day: DayName) => {
    const copied = copyDayTo(data, day, WEEKDAYS);
    if (!copied.length) return setError(`Set ${LABEL[day]}'s hours first, then copy them.`);
    const others = WEEKDAYS.filter((d) => d !== day);
    const oldIds = data.filter((r) => others.includes(r.day_of_week as DayName)).map((r) => r.id);
    void run(() => replaceDays(providerId, others, copied, oldIds));
  };

  return (
    <Screen>
      <ScreenHeader title="Working hours" onBack={() => router.back()} />
      <Body muted>Customers can only book you for times inside these hours. With no hours set, you are bookable every day from 8 AM to 8 PM.</Body>
      {rows.isSuccess && data.length === 0 ? <InfoBanner message="No hours set yet, so customers can book you any day from 8 AM to 8 PM. Add hours to narrow that down. To stop getting requests, use the Go online switch on Home." /> : null}
      {!approved ? <InfoBanner message="You can set your hours now. They apply once your identity check is approved." /> : null}
      <ErrorBanner message={error ?? (rows.isError ? "Could not load your working hours. Check your internet." : null)} />
      {rows.isError ? <Button label="Try again" variant="secondary" onPress={() => void rows.refetch()} /> : null}
      {rows.isPending ? <ListSkeleton rows={4} /> : null}

      {rows.isSuccess ? ORDER.map((day) => {
        const date = new Date(2026, 10, 1 + DAY_NAMES.indexOf(day)); // any date on that weekday (1 Nov 2026 is a Sunday)
        const dayRows = data.filter((r) => r.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
        const active = windowsOn(data, date) ?? [];
        return (
          <Card key={day}>
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-fg">{LABEL[day]}</Text>
              <Text className="text-sm text-muted">{data.length === 0 ? "Open all day" : describeDay(active)}</Text>
            </View>

            {dayRows.map((r) => (
              <View key={r.id} className="flex-row items-center gap-2 border-t border-line pt-2">
                <Switch accessibilityLabel={`${LABEL[day]} ${formatSlot(normalizeClock(r.start_time) ?? "09:00")} on or off`}
                  value={r.is_available === true} disabled={busy} trackColor={{ false: "#D9D2C4", true: colors.brand }} thumbColor="#FFFFFF"
                  onValueChange={(v) => void run(() => updateWindow(r.id, { is_available: v }))} />
                <Text className={`flex-1 text-base ${r.is_available ? "text-fg" : "text-muted line-through"}`}>
                  {formatSlot(normalizeClock(r.start_time) ?? "09:00")} – {formatSlot(normalizeClock(r.end_time) ?? "17:00")}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Edit hours" onPress={() => openEdit(r)} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center">
                  <Pencil size={18} color={colors.brand} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove hours" disabled={busy} onPress={() => void run(() => deleteWindow(r.id))} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center">
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            {dayRows.length === 0 && data.length > 0 ? <Text className="text-sm text-muted">Day off. Add hours to work this day.</Text> : null}

            {editing?.day === day ? (
              <View className="gap-3 rounded-2xl bg-field p-3">
                <Text className="text-sm font-semibold text-fg">{editing.id ? "Change hours" : "New hours"}</Text>
                <TimeRow label="From" value={start} onChange={(t) => { setStart(t); setFormError(null); }} />
                <TimeRow label="To" value={end} onChange={(t) => { setEnd(t); setFormError(null); }} />
                <Text className="text-xs text-muted">At least {MIN_WINDOW_MINUTES / 60} hour. Customers pick a start time inside these hours.</Text>
                <ErrorBanner message={formError} />
                <Button label="Save hours" loading={busy} onPress={save} />
                <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => setEditing(null)} />
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2 pt-1">
                <Pressable accessibilityRole="button" onPress={() => openAdd(day)} disabled={busy}
                  className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-3 active:opacity-80">
                  <Plus size={16} color={colors.brand} /><Text className="text-sm font-semibold text-fg">Add hours</Text>
                </Pressable>
                {dayRows.length > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => copyToWeekdays(day)} disabled={busy}
                    className="min-h-[44px] flex-row items-center gap-1.5 rounded-xl border border-line bg-card px-3 active:opacity-80">
                    <Copy size={16} color={colors.brand} /><Text className="text-sm font-semibold text-fg">Copy to weekdays</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Card>
        );
      }) : null}
    </Screen>
  );
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-fg">{label}: {formatSlot(value)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {TIMES.map((t) => <Chip key={t} label={formatSlot(t)} selected={t === value} onPress={() => onChange(t)} />)}
      </ScrollView>
    </View>
  );
}
