import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import api from "@/lib/api";
import { PROJECT_TONE, projLabel } from "../projects";

interface Bottleneck { id: string; title: string; is_resolved?: boolean }
interface ProjMember { id: string; user_name?: string; role?: string }
interface Project {
  id: string; name: string; description?: string; location?: string;
  client_name?: string | null; site_name?: string | null; manager_name?: string | null;
  status: string; status_display?: string; progress: number;
  start_date?: string | null; target_date?: string | null; completed_date?: string | null;
  budget?: string | number | null; notes?: string;
  bottlenecks?: Bottleneck[]; members?: ProjMember[];
}

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/teams/projects/${id}/`);
      setP(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!p) return <SafeAreaView style={styles.safe}><Text style={styles.err}>Project not found.</Text></SafeAreaView>;

  const tone = PROJECT_TONE[p.status] ?? { fg: colors.textMuted, bg: colors.border };
  const openBn = (p.bottlenecks ?? []).filter((b) => !b.is_resolved);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.head}>
          <Text style={styles.name}>{p.name}</Text>
          <Pill label={p.status_display || projLabel(p.status)} fg={tone.fg} bg={tone.bg} />
        </View>
        {p.location || p.client_name ? <Text style={styles.sub}>{[p.client_name, p.location].filter(Boolean).join(" · ")}</Text> : null}

        <Card style={{ marginTop: spacing.lg, gap: 8 }}>
          <View style={styles.progHead}><Text style={styles.progLabel}>Progress</Text><Text style={[styles.pct, { color: tone.fg }]}>{p.progress}%</Text></View>
          <View style={styles.track}><View style={[styles.fill, { width: `${p.progress}%`, backgroundColor: tone.fg }]} /></View>
        </Card>

        <Card style={{ marginTop: spacing.md, gap: 10 }}>
          <Row label="Site" value={p.site_name || "—"} />
          <Row label="Manager" value={p.manager_name || "—"} />
          <Row label="Start" value={p.start_date ? formatDate(p.start_date) : "—"} />
          <Row label="Target" value={p.target_date ? formatDate(p.target_date) : "—"} />
          {p.completed_date ? <Row label="Completed" value={formatDate(p.completed_date)} /> : null}
          {p.budget ? <Row label="Budget" value={Number(p.budget).toLocaleString()} /> : null}
        </Card>

        {p.description ? (
          <Card style={{ marginTop: spacing.md }}><Text style={styles.blockLabel}>Description</Text><Text style={styles.body}>{p.description}</Text></Card>
        ) : null}

        {openBn.length > 0 && (
          <>
            <Text style={styles.section}>Bottlenecks ({openBn.length})</Text>
            {openBn.map((b) => (
              <Card key={b.id} style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View style={styles.dot} />
                <Text style={styles.bnTitle}>{b.title}</Text>
              </Card>
            ))}
          </>
        )}

        {(p.members ?? []).length > 0 && (
          <>
            <Text style={styles.section}>Team ({p.members!.length})</Text>
            {p.members!.map((m) => (
              <Card key={m.id} style={{ marginBottom: spacing.sm, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.body}>{m.user_name || "—"}</Text>
                {m.role ? <Text style={styles.memberRole}>{m.role}</Text> : null}
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.kv}><Text style={styles.k}>{label}</Text><Text style={styles.v} numberOfLines={2}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, marginTop: 4 },
  progHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progLabel: { fontSize: font.body, fontWeight: "700", color: colors.text },
  pct: { fontSize: font.h3, fontWeight: "800" },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  blockLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  body: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  bnTitle: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600" },
  memberRole: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
});
