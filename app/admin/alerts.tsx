import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import { timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";
import api from "@/lib/api";

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  category?: string;
  device_code?: string | null;
  site_name?: string | null;
  is_dismissed: boolean;
  created_at: string;
}

const SEV: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  critical: { color: colors.danger, icon: "alert-circle" },
  error: { color: "#f97316", icon: "close-circle" },
  warning: { color: "#f59e0b", icon: "warning" },
  info: { color: colors.info, icon: "information-circle" },
};

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/analytics/alerts/", { params: { page_size: 100, ordering: "-created_at", is_dismissed: false } });
      setAlerts(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function dismiss(a: Alert) {
    setBusy(a.id);
    try {
      await api.patch(`/analytics/alerts/${a.id}/`, { is_dismissed: true });
      setAlerts((list) => list.filter((x) => x.id !== a.id));
    } catch {
      toast.error("Could not dismiss");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={alerts.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="checkmark-done-circle-outline" title="No active alerts" subtitle="You're all clear." />}
        renderItem={({ item }) => {
          const sev = SEV[item.severity] ?? SEV.info;
          return (
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={styles.row}>
                <Ionicons name={sev.icon} size={22} color={sev.color} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.message ? <Text style={styles.msg}>{item.message}</Text> : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.meta} numberOfLines={1}>{[item.device_code, item.site_name].filter(Boolean).join(" · ") || item.category || ""}</Text>
                    <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => dismiss(item)} hitSlop={8} disabled={busy === item.id}>
                  <Ionicons name={busy === item.id ? "hourglass-outline" : "close"} size={18} color={colors.textLight} />
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  msg: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: spacing.sm },
  meta: { flex: 1, fontSize: font.xs, color: colors.textLight },
  time: { fontSize: font.xs, color: colors.textLight },
});
