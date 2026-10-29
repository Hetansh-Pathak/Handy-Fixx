/**
 * apnabanda colour tokens (owner decision 2026-10-29): Light = "Blue + White", Dark = "Black + Blur" (the hero theme).
 * Token NAMES are the ones screens already use (canvas, card, fg, muted, field, line, brand, strip …); only the values
 * change per theme. tailwind.config.js reads them as CSS variables, `useThemeColors()` returns them for colour props.
 */
export type ThemeName = "light" | "dark";

export type Palette = {
  canvas: string;
  card: string;
  fg: string;
  muted: string;
  /** Icons and placeholders that may be a little quieter than `muted` (still readable). */
  mutedSoft: string;
  /** Input and pressed-row background. */
  field: string;
  line: string;
  brand: string;
  /** Text and icons on a filled brand button. White fails contrast on the dark theme's lighter blue. */
  onBrand: string;
  /** Chip / soft highlight background and its text. */
  tint: string;
  tintFg: string;
  price: string;
  /** Hard-hat amber. */
  accent: string;
  onAccent: string;
  ok: string;
  okBg: string;
  warn: string;
  warnBg: string;
  danger: string;
  dangerBg: string;
  /** Dark hero card (stats strip) and its text. */
  strip: string;
  onStrip: string;
  nav: string;
  switchOff: string;
  skeleton: string;
  glowBlue: string;
  glowAmber: string;
  /** Glow strength 0-1: Dark stronger, Light very subtle. */
  glowOpacity: number;
  white: string;
  /** Old names kept so existing screens keep working. */
  brandSoft: string;
  sun: string;
};

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    canvas: "#F3F7FF",
    card: "#FFFFFF",
    fg: "#0B1B3A",
    muted: "#566684",
    mutedSoft: "#566684",
    field: "#EEF3FD",
    line: "#E1E8F7",
    brand: "#1F5BFF",
    onBrand: "#FFFFFF",
    tint: "#E6EEFF",
    tintFg: "#1745C7",
    price: "#1F5BFF",
    accent: "#FFB703",
    onAccent: "#1A1100",
    ok: "#087048",
    okBg: "#E3F6EE",
    warn: "#7A4E00",
    warnBg: "#FFF1CC",
    danger: "#C0262D",
    dangerBg: "#FDE8E9",
    strip: "#0B1B3A",
    onStrip: "#FFFFFF",
    nav: "rgba(255,255,255,0.88)",
    switchOff: "#C9D3E8",
    skeleton: "#E1E8F7",
    glowBlue: "#1F5BFF",
    glowAmber: "#FFB703",
    glowOpacity: 0.1,
    white: "#FFFFFF",
    brandSoft: "#E6EEFF",
    sun: "#FFB703",
  },
  dark: {
    canvas: "#05070D",
    card: "rgba(255,255,255,0.07)",
    fg: "#F4F7FF",
    muted: "#A7B3CC",
    mutedSoft: "#A7B3CC",
    field: "rgba(255,255,255,0.06)",
    line: "rgba(255,255,255,0.14)",
    brand: "#5B93FF",
    onBrand: "#04101F",
    tint: "rgba(91,147,255,0.16)",
    tintFg: "#A8C6FF",
    price: "#8FB4FF",
    accent: "#FFC233",
    onAccent: "#1A1100",
    ok: "#5BE3A8",
    okBg: "rgba(91,227,168,0.14)",
    warn: "#FFD27A",
    warnBg: "rgba(255,194,51,0.14)",
    danger: "#FF8A8F",
    dangerBg: "rgba(255,138,143,0.14)",
    strip: "rgba(255,255,255,0.10)",
    onStrip: "#F4F7FF",
    nav: "rgba(12,16,28,0.72)",
    switchOff: "rgba(255,255,255,0.22)",
    skeleton: "rgba(255,255,255,0.10)",
    glowBlue: "#3B6BFF",
    glowAmber: "#FFB703",
    glowOpacity: 0.32,
    white: "#FFFFFF",
    brandSoft: "rgba(91,147,255,0.16)",
    sun: "#FFC233",
  },
};

/** "#1F5BFF" → "31 91 255" (tailwind's rgb(var(--x) / <alpha-value>) form, so `bg-brand/15` keeps working). */
const channels = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/**
 * The CSS variables tailwind.config.js points at. Solid colours are RGB channels (opacity modifiers work);
 * colours that are see-through in Dark are whole values.
 */
export function cssVars(p: Palette): Record<`--${string}`, string> {
  return {
    "--canvas": channels(p.canvas),
    "--fg": channels(p.fg),
    "--muted": channels(p.muted),
    "--brand": channels(p.brand),
    "--onbrand": channels(p.onBrand),
    "--tintfg": channels(p.tintFg),
    "--price": channels(p.price),
    "--accent": channels(p.accent),
    "--onaccent": channels(p.onAccent),
    "--ok": channels(p.ok),
    "--warn": channels(p.warn),
    "--danger": channels(p.danger),
    "--onstrip": channels(p.onStrip),
    "--card": p.card,
    "--field": p.field,
    "--line": p.line,
    "--tint": p.tint,
    "--okbg": p.okBg,
    "--warnbg": p.warnBg,
    "--dangerbg": p.dangerBg,
    "--strip": p.strip,
    "--nav": p.nav,
  };
}
