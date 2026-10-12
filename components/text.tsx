import { Text as RNText, StyleSheet, TextProps } from "react-native";

/**
 * The desktop's typeface, Urbanist, on every line of the app.
 *
 * A custom family on Android ignores fontWeight, so the weight a style asks
 * for picks the family here and the weight itself is dropped.
 */
const FAMILY: Record<string, string> = {
  "100": "Urbanist_400Regular",
  "200": "Urbanist_400Regular",
  "300": "Urbanist_400Regular",
  "400": "Urbanist_400Regular",
  normal: "Urbanist_400Regular",
  "500": "Urbanist_500Medium",
  "600": "Urbanist_600SemiBold",
  "700": "Urbanist_700Bold",
  bold: "Urbanist_700Bold",
  "800": "Urbanist_800ExtraBold",
  "900": "Urbanist_800ExtraBold",
};

export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) || {};
  const weight = String(flat.fontWeight ?? "400");
  return <RNText {...rest} style={[style, { fontFamily: FAMILY[weight] ?? FAMILY["400"], fontWeight: "normal" }]} />;
}

export const FONT_FAMILY = FAMILY;
