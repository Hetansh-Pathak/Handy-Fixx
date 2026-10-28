import { CLOCK_MINUTES, formatSlot, fromClock, snapToAvailable, toClock, type BookingSlot, type ClockTime } from "@handyfix/shared";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";

const SIZE = 248;
const CENTER = SIZE / 2;
const NUMBER_RADIUS = SIZE / 2 - 26;
const HOUR_BUTTON = 40;
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/**
 * An analog clock for the booking time: tap an hour on the dial, flip AM/PM, then pick the minutes.
 * Only times in `options` (working hours, not in the past) can be chosen; the rest are greyed out.
 * Plain views, so it behaves the same on Android, iOS and web.
 */
export function ClockPicker({ options, value, onChange }: {
  options: readonly BookingSlot[];
  value: BookingSlot | null;
  onChange: (time: BookingSlot) => void;
}) {
  const current: ClockTime = (value && toClock(value)) || (options[0] && toClock(options[0])) || { hour: 10, minute: 0, pm: false };
  const has = (c: ClockTime) => options.includes(fromClock(c));
  const hourOpen = (hour: number, pm: boolean) => CLOCK_MINUTES.some((minute) => has({ hour, minute, pm }));
  const sideOpen = (pm: boolean) => HOURS.some((h) => hourOpen(h, pm));

  const pick = (c: ClockTime) => {
    const next = snapToAvailable(fromClock(c), options);
    if (next) onChange(next);
  };

  if (!options.length) {
    return <Text className="text-sm text-muted">No times left on this day. Pick another date.</Text>;
  }

  const handAngle = (current.hour % 12) * 30;
  return (
    <View className="items-center gap-4">
      {/* Digital readout + AM/PM */}
      <View className="flex-row items-center gap-3">
        <Text accessibilityLiveRegion="polite" className="text-4xl font-extrabold text-fg">
          {value ? formatSlot(value).replace(/ (AM|PM)$/, "") : "--:--"}
        </Text>
        <View className="overflow-hidden rounded-xl border border-line">
          {([false, true] as const).map((pm) => {
            const selected = current.pm === pm;
            const disabled = !sideOpen(pm);
            return (
              <Pressable key={String(pm)} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled}
                onPress={() => pick({ ...current, pm })}
                className={`min-h-[32px] min-w-[52px] items-center justify-center px-3 ${selected ? "bg-brand" : "bg-card"} ${disabled ? "opacity-30" : ""}`}>
                <Text className={`text-sm font-bold ${selected ? "text-white" : "text-fg"}`}>{pm ? "PM" : "AM"}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Dial */}
      <View style={{ width: SIZE, height: SIZE }} className="rounded-full border border-line bg-field">
        <View pointerEvents="none" style={{ position: "absolute", width: SIZE, height: SIZE, transform: [{ rotate: `${handAngle}deg` }] }}>
          <View style={{ position: "absolute", left: CENTER - 1, top: CENTER - NUMBER_RADIUS + HOUR_BUTTON / 2, width: 2, height: NUMBER_RADIUS - HOUR_BUTTON / 2 }} className="bg-brand" />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: CENTER - 5, top: CENTER - 5, width: 10, height: 10 }} className="rounded-full bg-brand" />
        {HOURS.map((hour, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const selected = current.hour === hour;
          const disabled = !hourOpen(hour, current.pm);
          return (
            <Pressable key={hour} accessibilityRole="button" accessibilityLabel={`${hour} ${current.pm ? "PM" : "AM"}`}
              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => pick({ ...current, hour })}
              style={{
                position: "absolute", width: HOUR_BUTTON, height: HOUR_BUTTON,
                left: CENTER + NUMBER_RADIUS * Math.sin(angle) - HOUR_BUTTON / 2,
                top: CENTER - NUMBER_RADIUS * Math.cos(angle) - HOUR_BUTTON / 2,
              }}
              className={`items-center justify-center rounded-full ${selected ? "bg-brand" : ""} ${disabled ? "opacity-25" : "active:bg-brand/20"}`}>
              <Text className={`text-base font-semibold ${selected ? "text-white" : "text-fg"}`}>{hour}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Minutes */}
      <View className="flex-row gap-2">
        {CLOCK_MINUTES.map((minute) => {
          const selected = current.minute === minute;
          const disabled = !has({ ...current, minute });
          return (
            <Pressable key={minute} accessibilityRole="button" accessibilityLabel={`${minute} minutes`} accessibilityState={{ selected, disabled }}
              disabled={disabled} onPress={() => onChange(fromClock({ ...current, minute }))}
              className={`min-h-[44px] min-w-[60px] items-center justify-center rounded-xl border ${selected ? "border-brand bg-brand" : "border-line bg-card"} ${disabled ? "opacity-30" : ""}`}>
              <Text className={`text-base font-semibold ${selected ? "text-white" : "text-fg"}`}>:{String(minute).padStart(2, "0")}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs text-muted">Pros work 8:00 AM to 8:00 PM. Book at least 1 hour ahead.</Text>
    </View>
  );
}
