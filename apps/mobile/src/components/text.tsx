import { Text as RNText, type TextProps } from "react-native";

/**
 * Text that picks the Plus Jakarta Sans file for the weight class in `className`
 * (React Native cannot select a weight inside a custom font family).
 */
const FAMILY: [RegExp, string][] = [
  [/\bfont-(extrabold|black)\b/, "PlusJakartaSans_800ExtraBold"],
  [/\bfont-bold\b/, "PlusJakartaSans_700Bold"],
  [/\bfont-semibold\b/, "PlusJakartaSans_600SemiBold"],
  [/\bfont-medium\b/, "PlusJakartaSans_500Medium"],
];

export function fontFamilyFor(className: string | undefined): string {
  const found = FAMILY.find(([re]) => re.test(className ?? ""));
  return found ? found[1] : "PlusJakartaSans_400Regular";
}

export function Text({ className, style, ...rest }: TextProps & { className?: string }) {
  return <RNText {...rest} className={className} style={[{ fontFamily: fontFamilyFor(className) }, style]} />;
}
