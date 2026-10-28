/** @type {import('tailwindcss').Config} */
// apnabanda design system (owner decision 2026-10-29): Light = "Blue + White", Dark = "Black + Blur".
// Colours are CSS variables set per theme by src/theme/theme.tsx (values in src/theme/palettes.ts), so every
// screen adapts without changing its class names. Solid tokens are RGB channels (opacity modifiers such as
// `bg-brand/15` work); tokens that are see-through in Dark (card, field, line, tint, status backgrounds, strip,
// nav) are whole values and take no opacity modifier.
const ch = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const v = (name) => `var(--${name})`;

module.exports = {
  // "class" lets NativeWind accept the manual Light / Dark choice (the default "media" throws on web).
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: ch("canvas"),
        card: v("card"),
        fg: ch("fg"),
        muted: ch("muted"),
        field: v("field"),
        line: v("line"),
        // brand-soft / brand-dark are the old names of tint / tint-fg, kept for existing screens.
        brand: { DEFAULT: ch("brand"), dark: ch("tintfg"), soft: v("tint") },
        onbrand: ch("onbrand"),
        tint: { DEFAULT: v("tint"), fg: ch("tintfg") },
        price: ch("price"),
        accent: { DEFAULT: ch("accent"), fg: ch("onaccent") },
        sun: ch("accent"),
        strip: { DEFAULT: v("strip"), fg: ch("onstrip") },
        nav: v("nav"),
        ok: { DEFAULT: ch("ok"), bg: v("okbg") },
        warn: { DEFAULT: ch("warn"), bg: v("warnbg") },
        danger: { DEFAULT: ch("danger"), bg: v("dangerbg") },
      },
      borderRadius: {
        // Radius scale 14 / 20 / 28.
        tile: "14px",
        panel: "20px",
        hero: "28px",
      },
      fontFamily: {
        // One family per weight: React Native cannot switch weights inside a custom family.
        sans: ["PlusJakartaSans_400Regular"],
        jmed: ["PlusJakartaSans_500Medium"],
        jsemi: ["PlusJakartaSans_600SemiBold"],
        jbold: ["PlusJakartaSans_700Bold"],
        jxbold: ["PlusJakartaSans_800ExtraBold"],
      },
    },
  },
  plugins: [],
};
