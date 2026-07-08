import { Platform } from "react-native";

export const colors = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  primarySoft: "#eff4ff",
  bg: "#f4f6fa",
  card: "#ffffff",
  border: "#e6e9ef",
  borderStrong: "#d3d8e2",
  text: "#0f172a",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  white: "#ffffff",
  success: "#10b981",
  successSoft: "#e7f7f0",
  warning: "#f59e0b",
  warningSoft: "#fef3e2",
  danger: "#ef4444",
  dangerSoft: "#fdecec",
  info: "#3b82f6",
  infoSoft: "#eaf2fe",
  violet: "#8b5cf6",
  violetSoft: "#f1ecfe",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
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
