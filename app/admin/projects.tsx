import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import api from "@/lib/api";

interface Project {
  id: string;
  name: string;
  location?: string;
  client_name?: string | null;
  site_name?: string | null;
  status: string;
  status_display?: string;
  progress: number;
  target_date?: string | null;
  bottleneck_count?: number;
}

export const PROJECT_TONE: Record<string, { fg: string; bg: string }> = {
  planning: { fg: colors.textMuted, bg: colors.border },
  on_track: { fg: "#047857", bg: colors.successSoft },
  at_risk: { fg: "#b45309", bg: "#fef3c7" },
  delayed: { fg: colors.danger, bg: colors.dangerSoft },
  on_hold: { fg: colors.textMuted, bg: colors.border },
  completed: { fg: colors.primary, bg: colors.primarySoft },
};
export const projLabel = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/teams/projects/", { params: { page_size: 100, ordering: "-created_at" } });
      setProjects(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        contentContainerStyle={projects.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="clipboard-outline" title="No projects" subtitle="Projects will appear here." />}
        renderItem={({ item }) => {
          const tone = PROJECT_TONE[item.status] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/admin/project/${item.id}`)}>
              <View style={styles.topRow}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Pill label={item.status_display || projLabel(item.status)} fg={tone.fg} bg={tone.bg} />
              </View>
              {item.location || item.client_name ? <Text style={styles.meta} numberOfLines={1}>{[item.client_name, item.location].filter(Boolean).join(" · ")}</Text> : null}
              <View style={styles.progRow}>
                <View style={styles.track}><View style={[styles.fill, { width: `${item.progress}%`, backgroundColor: tone.fg }]} /></View>
                <Text style={styles.pct}>{item.progress}%</Text>
              </View>
              {item.bottleneck_count ? (
                <View style={styles.flag}><Ionicons name="warning-outline" size={12} color={colors.danger} /><Text style={styles.flagText}>{item.bottleneck_count} bottleneck{item.bottleneck_count > 1 ? "s" : ""}</Text></View>
              ) : null}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontSize: font.body, fontWeight: "800", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  progRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 10 },
  track: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: 999 },
  pct: { fontSize: font.sm, fontWeight: "800", color: colors.text, width: 42, textAlign: "right" },
  flag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  flagText: { fontSize: font.xs, color: colors.danger, fontWeight: "600" },
});
