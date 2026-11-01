import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";
import { cssVars, PALETTES, type Palette, type ThemeName } from "./palettes";

/** Profile > Appearance. Stored on this device only. */
export type Appearance = "system" | "light" | "dark";

const STORAGE_KEY = "apnabanda.appearance";
const APPEARANCES: readonly Appearance[] = ["system", "light", "dark"];

type ThemeContextValue = {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  /** The theme actually shown (System resolved to the phone's setting). */
  scheme: ThemeName;
  colors: Palette;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const VARS: Record<ThemeName, ReturnType<typeof vars>> = {
  light: vars(cssVars(PALETTES.light)),
  dark: vars(cssVars(PALETTES.dark)),
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>("system");

  // Read the saved choice once. Storage can be missing or blocked (private web window): System is the fallback.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => { if (alive && saved && (APPEARANCES as readonly string[]).includes(saved)) setAppearanceState(saved as Appearance); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const scheme: ThemeName = appearance === "system" ? (system === "light" ? "light" : "dark") : appearance;
  const colors = PALETTES[scheme];

  // Web: pop-ups (Modal) are portalled to <body>, outside this View, so the variables also go on the page root.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVars(colors))) root.style.setProperty(name, value);
    root.style.setProperty("color-scheme", scheme);
    document.body.style.backgroundColor = colors.canvas;
  }, [colors, scheme]);

  const value = useMemo(() => ({ appearance, setAppearance, scheme, colors }), [appearance, setAppearance, scheme, colors]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={[{ flex: 1, backgroundColor: colors.canvas }, VARS[scheme]]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/**
 * Always-dark island for brand posters (the opening screen, the login poster): everything inside, classes and
 * `useTheme()` / `useThemeColors()` alike, sees the Dark palette even when the phone is in Light. Layout via `style`.
 */
export function DarkScope({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(() => ({ ...parent, scheme: "dark", colors: PALETTES.dark }), [parent]);
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ backgroundColor: PALETTES.dark.canvas }, VARS.dark, style]}>{children}</View>
    </ThemeContext.Provider>
  );
}

/** Colour values for props that cannot take a class (icons, switches, placeholders, maps). */
export function useThemeColors(): Palette {
  return useTheme().colors;
}
