/**
 * Single source of truth for the brand. The product name is still undecided, so screens read
 * it from here — renaming means changing `name` (plus the static strings in index.html and
 * vite.config.ts, which can't import from src).
 */
export const BRAND = {
  name: "HandyFix",
  tagline: "Verified pros for every fix at home",
  ink: "#121212",
  gold: "#FAB60A",
} as const;
