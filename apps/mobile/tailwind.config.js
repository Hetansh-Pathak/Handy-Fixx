/** @type {import('tailwindcss').Config} */
module.exports = {
  // Dark-only app today. "class" lets NativeWind accept Expo's manual color-scheme setting (the default
  // "media" throws on web); there are no dark: variants to switch yet.
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // HandyFix design system: black, white and gold.
      colors: {
        ink: "#0A0A0A",
        surface: "#16161A",
        line: "#26262C",
        muted: "#9A9AA3",
        gold: { DEFAULT: "#FBB614", dark: "#C98F00" },
        ok: "#2FB36D",
        danger: "#E5484D",
      },
    },
  },
  plugins: [],
};
