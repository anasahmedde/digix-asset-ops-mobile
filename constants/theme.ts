import { Platform } from "react-native";

/**
 * The desktop's palette, resolved to hex.
 *
 * The web app defines these as HSL custom properties in globals.css; these
 * are the same values so a screen looks like itself on either device. Where
 * a name differs it is noted — React Native has no cascade, so the tokens
 * are named for what they are rather than for the CSS variable.
 *
 *   --primary      203 54% 23%   #1b405b   (the brand sheet: ink and mint)
 *   --background     0  0% 97%   #f7f7f7
 *   --card           0  0% 100%  #ffffff
 *   --border       220 13% 90%   #e2e4e9
 *   --foreground   220 20% 14%   #1d212b
 *   --muted-fg     220 10% 46%   #6a7181
 *   --secondary    220 13% 95%   #f1f2f4
 *   --destructive    0 72% 51%   #dc2828
 *   --success      152 70% 40%   #1fad6b
 *   --warning       38 92% 50%   #f59f0a
 */
export const colors = {
  primary: "#1b405b",
  primaryDark: "#163144",
  primarySoft: "#dff3eb",
  bg: "#eef3f5",
  card: "#ffffff",
  border: "#e2e4e9",
  borderStrong: "#cfd2da",
  // `secondary` on the web: the quiet fill behind chips and table headers.
  secondary: "#f1f2f4",
  text: "#163144",
  textMuted: "#6a7181",
  textLight: "#9aa1af",
  white: "#ffffff",
  success: "#1fad6b",
  successSoft: "#e9f7f0",
  warning: "#f59f0a",
  warningSoft: "#fef3e2",
  danger: "#dc2828",
  dangerSoft: "#fdeaea",
  info: "#3b82f6",
  infoSoft: "#eaf2fe",
  violet: "#8b5cf6",
  violetSoft: "#f1ecfe",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
// --radius on the web is 0.75rem = 12px, which `md` matches.
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const font = {
  h1: 26,
  h2: 20,
  h3: 17,
  body: 15,
  sm: 13,
  xs: 11,
};

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: {},
  }) as object,
  fab: Platform.select({
    ios: { shadowColor: "#2563eb", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: {},
  }) as object,
};

type Tone = { fg: string; bg: string };

export const STATUS_TONES: Record<string, Tone> = {
  open: { fg: "#2563eb", bg: colors.infoSoft },
  in_progress: { fg: "#b45309", bg: colors.warningSoft },
  on_hold: { fg: "#475569", bg: "#eef1f5" },
  blocked: { fg: "#dc2626", bg: colors.dangerSoft },
  alignment_pending: { fg: "#7c3aed", bg: colors.violetSoft },
  pending_ops_approval: { fg: "#c2410c", bg: colors.warningSoft },
  pending_client_approval: { fg: "#6d28d9", bg: colors.violetSoft },
  pending_review: { fg: "#7c3aed", bg: colors.violetSoft },
  approved: { fg: "#047857", bg: colors.successSoft },
  rejected: { fg: "#dc2626", bg: colors.dangerSoft },
  closed: { fg: "#475569", bg: "#eef1f5" },
  // device / asset statuses
  active: { fg: "#047857", bg: colors.successSoft },
  installed: { fg: "#047857", bg: colors.successSoft },
  in_stock: { fg: "#2563eb", bg: colors.infoSoft },
  under_maintenance: { fg: "#b45309", bg: colors.warningSoft },
  decommissioned: { fg: "#475569", bg: "#eef1f5" },
  lost_stolen: { fg: "#dc2626", bg: colors.dangerSoft },
};

export const PRIORITY_TONES: Record<string, Tone> = {
  low: { fg: "#475569", bg: "#eef1f5" },
  medium: { fg: "#2563eb", bg: colors.infoSoft },
  high: { fg: "#b45309", bg: colors.warningSoft },
  critical: { fg: "#dc2626", bg: colors.dangerSoft },
};

export function toneFor(map: Record<string, Tone>, key?: string | null): Tone {
  return (key && map[key]) || { fg: colors.textMuted, bg: "#eef1f5" };
}
