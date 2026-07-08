import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { PRIORITY_TONES, STATUS_TONES, colors, font, radius, shadow, spacing, toneFor } from "@/constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ---------- Card ---------- */
export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}>
        {content}
      </Pressable>
    );
  }
  return content;
}

/* ---------- Badge / pills ---------- */
export function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const t = toneFor(STATUS_TONES, status);
  return <Pill label={label ?? labelize(status)} fg={t.fg} bg={t.bg} />;
}
export function PriorityBadge({ priority }: { priority: string }) {
  const t = toneFor(PRIORITY_TONES, priority);
  return (
    <View style={[styles.priorityBadge, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillText, { color: t.fg }]}>{labelize(priority)}</Text>
    </View>
  );
}

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "danger" | "ghost" | "success";
export function Button({
  title, onPress, variant = "primary", icon, loading, disabled, small, style,
}: {
  title: string; onPress?: () => void; variant?: BtnVariant; icon?: IconName;
  loading?: boolean; disabled?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const v = BTN[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 15 : 17} color={v.fg} />}
          <Text style={[styles.btnText, small && { fontSize: font.sm }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
const BTN: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: "#fff", border: colors.primary },
  success: { bg: colors.success, fg: "#fff", border: colors.success },
  danger: { bg: colors.danger, fg: "#fff", border: colors.danger },
  secondary: { bg: colors.card, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
};

/* ---------- Icon button ---------- */
export function IconButton({ name, onPress, color = colors.text, size = 22, badge }: {
  name: IconName; onPress?: () => void; color?: string; size?: number; badge?: number;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.iconBtn}>
      <Ionicons name={name} size={size} color={color} />
      {badge !== undefined && badge > 0 && (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, size = 40, color = colors.primary }: { name?: string | null; size?: number; color?: string }) {
  const initials = (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "1a" }]}>
      <Text style={{ color, fontWeight: "700", fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/* ---------- Empty / loading ---------- */
export function EmptyState({ icon = "file-tray-outline", title, subtitle }: { icon?: IconName; title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={colors.textLight} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}
export function Loading() {
  return <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>;
}

/* ---------- Chip (filter) ---------- */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Stat tile ---------- */
export function StatTile({ value, label, icon, tint = colors.primary }: { value: number | string; label: string; icon: IconName; tint?: string }) {
  return (
    <View style={[styles.card, styles.statTile]}>
      <View style={[styles.statIcon, { backgroundColor: tint + "1a" }]}><Ionicons name={icon} size={18} color={tint} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ---------- Row / section ---------- */
export function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{typeof value === "string" || typeof value === "number" ? <Text style={styles.rowValueText}>{value || "—"}</Text> : value}</View>
    </View>
  );
}
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

/* ---------- FAB ---------- */
export function Fab({ icon, onPress }: { icon: IconName; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.fab, shadow.fab]}>
      <Ionicons name={icon} size={26} color="#fff" />
    </Pressable>
  );
}

/* ---------- helpers ---------- */
export function labelize(v?: string | null): string {
  if (!v) return "—";
  return v.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: font.xs, fontWeight: "700" },
  priorityBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  btnSmall: { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  btnText: { fontSize: font.body, fontWeight: "700" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconBadge: { position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  iconBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  avatar: { alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 56, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef1f5", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: font.h3, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: font.sm, color: colors.textMuted, marginTop: 6, textAlign: "center", lineHeight: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: "#fff" },
  statTile: { flex: 1, padding: spacing.md, gap: 2 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  rowLabel: { fontSize: font.sm, color: colors.textMuted },
  rowValue: { flexShrink: 1, alignItems: "flex-end" },
  rowValueText: { fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md, marginTop: spacing.sm },
  sectionTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  fab: { position: "absolute", right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
