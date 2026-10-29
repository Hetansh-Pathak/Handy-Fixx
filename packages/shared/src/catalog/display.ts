import { formatInr } from "../money/money";

const EMOJI: Record<string, string> = {
  Wrench: "🔧", Zap: "⚡", Sparkles: "✨", PaintBucket: "🎨", Wind: "❄️",
  Hammer: "🔨", Bug: "🐛", Thermometer: "🌡️", Settings: "⚙️", Scissors: "✂️",
};

/** `services.icon_name` holds a web icon name; the mobile app shows an emoji instead. */
export const serviceEmoji = (iconName: string | null | undefined): string => (iconName && EMOJI[iconName]) || "🛠️";

/** 45 → "45 min", 60 → "1 hr", 90 → "1 hr 30 min", 240 → "4 hr". Blank for missing or invalid values. */
export function formatDuration(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

/** "4.5" for a rating, "New" when a pro has none yet. */
export const formatRating = (rating: number | null | undefined): string =>
  typeof rating === "number" && Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "New";

/**
 * "₹249–₹449": the admin's price band for a job, shown before booking (PDF p.4 "see the price range for the job").
 * Null unless both ends are real positive numbers and the band is a real range (min below max): a job with no band,
 * a half-set band or a single price shows no range. Postgres numerics arrive as strings, so those are accepted.
 */
export function priceRangeLabel(min: unknown, max: unknown): string | null {
  if (min === null || min === undefined || min === "" || max === null || max === undefined || max === "") return null;
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= lo) return null;
  return `${formatInr(Math.round(lo))}–${formatInr(Math.round(hi))}`;
}
