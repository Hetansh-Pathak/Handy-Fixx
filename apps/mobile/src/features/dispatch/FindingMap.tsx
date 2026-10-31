import { jitteredPoint, mapOffset, ringFractions, type DispatchSettings, type LatLng } from "@handyfix/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/text";
import { useTheme } from "@/theme/theme";

export type MapMode = "searching" | "found" | "no_pro";

/**
 * The "Finding your pro" map: a stylised vector city (no map key needed), the customer as a blue "You" pin, dashed
 * rings (first ring, second ring, city), a radar sweep, three pulse rings and the notified pros as amber dots.
 * Only transform and opacity are animated (Reanimated, UI thread). With reduce-motion on, everything stands still.
 * The whole map is decoration for screen readers: the sheet below says the same thing in words.
 */
export function FindingMap({ settings, customer, dots, mode, proInitials, etaText }: {
  settings: DispatchSettings;
  customer: LatLng;
  dots: { key: string; point: LatLng }[];
  mode: MapMode;
  /** Found: the pro's marker label. */
  proInitials?: string;
  /** Found: "8 min away" tag next to the pro. */
  etaText?: string | null;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  // The customer sits in the upper part, above the sheet; the city ring may run off the sides.
  const cx = size.w / 2;
  const cy = size.h * 0.36;
  const R = Math.max(40, Math.min(size.w * 0.62, size.h * 0.4));
  const fractions = ringFractions(settings);
  const drawn = [0, 1, fractions.length - 1].filter((v, i, a) => a.indexOf(v) === i && v < fractions.length);
  const labels = drawn.map((i) => (i === fractions.length - 1 ? "City" : `${settings.rings[i]?.radiusKm ?? ""} km`));

  const placed = useMemo(
    () => dots.map((d) => {
      const p = jitteredPoint(d.point, d.key) ?? d.point;
      const o = mapOffset(settings, customer, p);
      return { key: d.key, x: cx + o.x * R, y: cy + o.y * R };
    }),
    [dots, settings, customer, cx, cy, R],
  );
  const pro = mode === "found" ? placed[0] : undefined;

  const street = dark ? "rgba(167,179,204,0.10)" : "rgba(11,27,58,0.07)";
  const park = dark ? "rgba(91,227,168,0.07)" : "rgba(8,112,72,0.07)";
  const water = dark ? "rgba(91,147,255,0.10)" : "rgba(31,91,255,0.08)";

  return (
    <View onLayout={onLayout} style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {size.w > 0 ? (
        <>
          <Svg width={size.w} height={size.h}>
            <Defs>
              <RadialGradient id={`you${id}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={colors.brand} stopOpacity={0.45} />
                <Stop offset="1" stopColor={colors.brand} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            {/* stylised city: water, parks, a few soft streets */}
            <Path d={`M0 ${size.h * 0.78} C ${size.w * 0.3} ${size.h * 0.7}, ${size.w * 0.55} ${size.h * 0.9}, ${size.w} ${size.h * 0.8} L ${size.w} ${size.h} L 0 ${size.h} Z`} fill={water} />
            <Rect x={size.w * 0.06} y={size.h * 0.12} width={size.w * 0.22} height={size.h * 0.1} rx={18} fill={park} />
            <Rect x={size.w * 0.7} y={size.h * 0.46} width={size.w * 0.2} height={size.h * 0.12} rx={18} fill={park} />
            {[0.18, 0.42, 0.63].map((f) => <Line key={`h${f}`} x1={0} y1={size.h * f} x2={size.w} y2={size.h * (f + 0.05)} stroke={street} strokeWidth={10} strokeLinecap="round" />)}
            {[0.22, 0.56, 0.84].map((f) => <Line key={`v${f}`} x1={size.w * f} y1={0} x2={size.w * (f - 0.08)} y2={size.h} stroke={street} strokeWidth={8} strokeLinecap="round" />)}
            <Path d={`M ${size.w * 0.1} ${size.h * 0.55} Q ${cx} ${cy - R * 0.2} ${size.w * 0.95} ${size.h * 0.25}`} stroke={street} strokeWidth={14} fill="none" strokeLinecap="round" />

            {/* dashed rings with labels */}
            {mode !== "found" ? drawn.map((i, k) => {
              const r = (fractions[i] ?? 0) * R;
              return (
                <G key={i}>
                  <Circle cx={cx} cy={cy} r={r} stroke={colors.brand} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="5 7" fill="none" />
                  <SvgText x={cx + r * 0.71 + 4} y={cy - r * 0.71 - 4} fill={colors.muted} fontSize={12} fontWeight="600">{labels[k]}</SvgText>
                </G>
              );
            }) : null}

            {/* found: dashed route from the pro to the customer */}
            {pro ? <Line x1={pro.x} y1={pro.y} x2={cx} y2={cy} stroke={colors.brand} strokeWidth={3} strokeDasharray="8 7" strokeLinecap="round" /> : null}

            <Circle cx={cx} cy={cy} r={34} fill={`url(#you${id})`} />
            <Circle cx={cx} cy={cy} r={10} fill={colors.brand} stroke={colors.white} strokeWidth={3} />
          </Svg>

          {mode === "searching" && !reduceMotion ? <Radar cx={cx} cy={cy} r={(fractions[fractions.length - 1] ?? 0.9) * R} color={colors.brand} /> : null}
          {mode === "searching" && !reduceMotion ? [0, 1, 2].map((i) => <Pulse key={i} index={i} cx={cx} cy={cy} r={(fractions[1] ?? 0.5) * R} color={colors.brand} />) : null}

          {mode !== "found" ? placed.map((p) => <ProDot key={p.key} x={p.x} y={p.y} color={colors.accent} ring={colors.canvas} still={reduceMotion} />) : null}

          <View style={{ position: "absolute", left: cx - 30, top: cy + 14, width: 60, alignItems: "center" }}>
            <Text className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-onbrand">You</Text>
          </View>

          {pro ? (
            <>
              <View style={{ position: "absolute", left: pro.x - 22, top: pro.y - 22, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.white, alignItems: "center", justifyContent: "center" }}>
                <Text className="text-sm font-extrabold" style={{ color: colors.onAccent }}>{proInitials ?? "★"}</Text>
              </View>
              {etaText ? (
                <View style={{ position: "absolute", left: pro.x - 50, top: pro.y - 52, width: 100, alignItems: "center" }}>
                  <Text className="rounded-full border border-line bg-card px-2 py-0.5 text-xs font-bold text-fg">{etaText}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {mode === "no_pro" ? <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(5,8,15,0.55)" : "rgba(243,247,255,0.6)" }]} /> : null}
        </>
      ) : null}
    </View>
  );
}

/** Rotating sweep: a 60-degree fan of thin slices fading out behind the leading edge (a conic fade), 3.2 s per turn. */
function Radar({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const slices = 12;
  const wedge = (a0: number, a1: number) => {
    const p = (a: number) => `${r + r * Math.cos((a * Math.PI) / 180)} ${r + r * Math.sin((a * Math.PI) / 180)}`;
    return `M ${r} ${r} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`;
  };
  return (
    <Animated.View style={[{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2 }, style]}>
      <Svg width={r * 2} height={r * 2}>
        {Array.from({ length: slices }, (_, i) => (
          <Path key={i} d={wedge(-90 - (i + 1) * 5, -90 - i * 5)} fill={color} fillOpacity={0.22 * (1 - i / slices)} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** One of three expanding rings: scale 0.25 -> 1.35 while fading out, 2.6 s, staggered 0.87 s. */
function Pulse({ index, cx, cy, r, color }: { index: number; cx: number; cy: number; r: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(index * 870, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [t, index]);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 0.25 + 1.1 * t.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r, borderWidth: 2, borderColor: color }, style]} />
  );
}

/** A notified pro: pops in, then breathes gently. */
function ProDot({ x, y, color, ring, still }: { x: number; y: number; color: string; ring: string; still: boolean }) {
  const s = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    s.value = withSequence(withSpring(1, { damping: 9, stiffness: 180 }), withRepeat(withTiming(1.18, { duration: 900 }), -1, true));
    return () => cancelAnimation(s);
  }, [s, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: x - 7, top: y - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: ring }, style]} />
  );
}
