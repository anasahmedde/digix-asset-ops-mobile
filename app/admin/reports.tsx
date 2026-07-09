import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";

type IconName = keyof typeof Ionicons.glyphMap;
interface Stats {
  total: number; working: number; installed: number; out_of_order: number;
  under_maintenance: number; in_stock: number;
  by_status?: Record<string, number>;
  by_city?: { city: string; count: number }[];
}
const cap = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const STATUS_COLOR: Record<string, string> = {
  active: colors.success, installed: colors.primary, in_stock: "#f59e0b",
  under_maintenance: "#f97316", assigned: colors.info, rma: colors.danger,
  decommissioned: colors.textMuted, procured: "#8b5cf6", in_transit: "#0ea5e9",
};

export default function ReportsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/assets/devices/dashboard_stats/");
      setStats(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const kpis: { label: string; value: number; icon: IconName; tint: string }[] = [
    { label: "Total Screens", value: stats?.total ?? 0, icon: "tv-outline", tint: colors.primary },
    { label: "Working", value: stats?.working ?? 0, icon: "checkmark-circle-outline", tint: colors.success },
    { label: "Installed", value: stats?.installed ?? 0, icon: "cube-outline", tint: colors.info },
    { label: "Out of Order", value: stats?.out_of_order ?? 0, icon: "alert-circle-outline", tint: colors.danger },
    { label: "Maintenance", value: stats?.under_maintenance ?? 0, icon: "construct-outline", tint: "#f97316" },
    { label: "In Stock", value: stats?.in_stock ?? 0, icon: "file-tray-stacked-outline", tint: "#8b5cf6" },
  ];
  const byStatus = Object.entries(stats?.by_status ?? {}).sort((a, b) => b[1] - a[1]);
  const statusMax = Math.max(1, ...byStatus.map(([, v]) => v));
  const byCity = (stats?.by_city ?? []).slice(0, 12);
  const cityMax = Math.max(1, ...byCity.map((c) => c.count));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <Text style={styles.h1}>Reports</Text>
        <Text style={styles.subtitle}>Asset overview across all sites</Text>

        <View style={styles.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <View style={[styles.kpiIcon, { backgroundColor: k.tint + "1a" }]}><Ionicons name={k.icon} size={16} color={k.tint} /></View>
              <Text style={styles.kpiValue}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {byStatus.length > 0 && (
          <Card style={{ marginTop: spacing.lg, gap: 12 }}>
            <Text style={styles.cardTitle}>Assets by status</Text>
            {byStatus.map(([st, v]) => (
              <View key={st}>
                <View style={styles.barLabelRow}><Text style={styles.barLabel}>{cap(st)}</Text><Text style={styles.barVal}>{v}</Text></View>
                <View style={styles.track}><View style={[styles.fill, { width: `${(v / statusMax) * 100}%`, backgroundColor: STATUS_COLOR[st] || colors.primary }]} /></View>
              </View>
            ))}
          </Card>
        )}

        {byCity.length > 0 && (
          <Card style={{ marginTop: spacing.md, gap: 12 }}>
            <Text style={styles.cardTitle}>Assets by city</Text>
            {byCity.map((c) => (
              <View key={c.city}>
                <View style={styles.barLabelRow}><Text style={styles.barLabel}>{c.city}</Text><Text style={styles.barVal}>{c.count}</Text></View>
                <View style={styles.track}><View style={[styles.fill, { width: `${(c.count / cityMax) * 100}%`, backgroundColor: colors.primary }]} /></View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const GAP = spacing.md;
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  kpiCard: { width: "30%", flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiValue: { fontSize: 22, fontWeight: "800", color: colors.text },
  kpiLabel: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  cardTitle: { fontSize: font.body, fontWeight: "800", color: colors.text },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: font.sm, color: colors.text, fontWeight: "600" },
  barVal: { fontSize: font.sm, color: colors.textMuted, fontWeight: "700" },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
});
