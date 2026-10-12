import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

import { Text } from "@/components/text";
import { Button } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { Presence } from "@/lib/attendance";

type IconName = keyof typeof Ionicons.glyphMap;

/** The desktop's wash: ink at the top fading to mint, behind every screen. */
export function Wash({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <LinearGradient
        colors={["#b3c5d2", "#d9e4ea", "#e9f1f0", "#e7f5ee"]}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/**
 * Where the technician stands with this site. The job's buttons open only
 * when they are clocked in here; the card says so and offers the clock.
 */
export function PresenceCard({
  presence, site, siteName, mine, busy, onCheckIn, onCheckOut,
}: {
  presence: Presence | null; site: string | null | undefined; siteName: string;
  mine: boolean; busy?: boolean; onCheckIn: () => void; onCheckOut: () => void;
}) {
  if (!mine) {
    return (
      <View style={[styles.gate, { backgroundColor: colors.secondary }]}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
        <Text style={styles.gateText}>This job is assigned to somebody else. You can look, not act.</Text>
      </View>
    );
  }
  const here = !!presence?.checked_in && presence.site === site;
  if (here) {
    return (
      <View style={[styles.gate, { backgroundColor: colors.successSoft }]}>
        <Ionicons name="location" size={18} color={colors.success} />
        <Text style={[styles.gateText, { color: "#0b6e44" }]}>Checked in at {siteName}</Text>
        <Button title="Check out" small variant="secondary" loading={busy} onPress={onCheckOut} />
      </View>
    );
  }
  const elsewhere = !!presence?.checked_in;
  return (
    <View style={[styles.gate, { backgroundColor: colors.warningSoft }]}>
      <Ionicons name="location-outline" size={18} color="#b45309" />
      <Text style={[styles.gateText, { color: "#92400e" }]}>
        {elsewhere ? `You are checked in at ${presence?.site_name ?? "another site"}. ` : ""}
        Check in at {siteName} to work this job.
      </Text>
      <Button title="Check in" small loading={busy} onPress={onCheckIn} />
    </View>
  );
}

export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** One step of the flow: a number, a name, where it stands, and what can be done now. */
export function FlowStep({ n, title, state, children }: { n: number; title: string; state: "done" | "now" | "later"; children?: ReactNode }) {
  const tone = state === "done" ? colors.success : state === "now" ? colors.primary : colors.textLight;
  const icon: IconName = state === "done" ? "checkmark" : state === "now" ? "play" : "ellipse-outline";
  return (
    <View style={[styles.flow, state === "now" && styles.flowNow]}>
      <View style={[styles.flowNum, { backgroundColor: tone }]}>
        {state === "later" ? <Text style={styles.flowNumText}>{n}</Text> : <Ionicons name={icon} size={14} color="#fff" />}
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={[styles.flowTitle, state === "later" && { color: colors.textMuted }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "bad" }) {
  const bg = tone === "warn" ? colors.warningSoft : tone === "bad" ? colors.dangerSoft : colors.infoSoft;
  const fg = tone === "warn" ? "#92400e" : tone === "bad" ? "#991b1b" : "#1e40af";
  return <Text style={[styles.note, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  gate: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, flexWrap: "wrap" },
  gateText: { flex: 1, minWidth: 160, fontSize: font.sm, fontWeight: "600", color: colors.textMuted, lineHeight: 19 },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  sectionHint: { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
  flow: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.55)", marginBottom: spacing.sm },
  flowNow: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary + "55" },
  flowNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 1 },
  flowNumText: { color: "#fff", fontSize: font.xs, fontWeight: "800" },
  flowTitle: { fontSize: font.body, fontWeight: "700", color: colors.text },
  note: { fontSize: font.sm, lineHeight: 19, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
});
