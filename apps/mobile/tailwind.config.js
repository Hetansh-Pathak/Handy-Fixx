/** @type {import('tailwindcss').Config} */
module.exports = {
  // "class" lets NativeWind accept Expo's manual color-scheme setting (the default "media" throws on web).
  // The app is light-only: it follows the old HandyFix look (warm cream, terracotta, charcoal).
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Colours taken from the old customer/provider apps (their CSS variables, converted to hex).
      colors: {
        canvas: "#FAF6EF", // --background
        card: "#FFFFFF", // --card
        fg: "#1C1C1C", // --foreground
        muted: "#5C5851", // --muted-foreground
        field: "#EFEAE1", // --secondary / --muted
        line: "#ECE6DA", // --border
        brand: { DEFAULT: "#B05526", dark: "#9A4A20", soft: "#FBEBE0" }, // --primary / --accent
        strip: "#1C1C1C", // dark stat strip
        sun: "#FBB614", // yellow promo banners and logo
        ok: "#17804B",
        danger: "#DC2626",
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
