import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Card, Chip, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { getCurrentUser } from "@/lib/user";

interface InstallationRow {
  id: string;
  device_code: string;
  asset_name: string | null;
  device_name: string;
  site_name: string;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  escalated: boolean;
  escalation_state: Record<string, string>;
  client_names: string[];
}

type Scope = "mine" | "all";

export default function InstallationsScreen() {
  const [rows, setRows] = useState<InstallationRow[]>([]);
  const [scope, setScope] = useState<Scope>("mine");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (uid: string | null, s: Scope) => {
    try {
      const params: Record<string, string | number> = { page_size: 200, ordering: "due_date" };
      if (s === "mine" && uid) params.installed_by = uid;
      const { data } = await api.get("/sites/installations/", { params });
      setRows(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        setUserId(me.id);
        await load(me.id, "mine");
      } catch {
        setLoading(false);
      }
    })();
  }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  return loading ? (
    <Loading />
  ) : (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={rows.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(userId, scope);
          }}
        />
      }
      ListHeaderComponent={
        <View style={styles.scopeRow}>
          <Chip label="Mine" active={scope === "mine"} onPress={() => { setScope("mine"); load(userId, "mine"); }} />
          <Chip label="All" active={scope === "all"} onPress={() => { setScope("all"); load(userId, "all"); }} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="construct-outline"
          title="No installations"
          subtitle={scope === "mine" ? "Installations assigned to you will appear here." : "No installations found."}
        />
      }
      renderItem={({ item }) => {
        const overdue = !item.completed_at && !!item.due_date && item.due_date < today;
        const stage2 = Object.keys(item.escalation_state ?? {}).some((k) => k.endsWith(":2"));
        return (
          <Card style={{ marginBottom: spacing.md, gap: 6 }} onPress={() => router.push(`/installation/${item.id}`)}>
            <View style={styles.head}>
              <Text style={styles.code}>{item.device_code}</Text>
              <View style={styles.pills}>
                {item.completed_at ? (
                  <Pill label="Completed" fg="#047857" bg={colors.successSoft} />
                ) : item.escalated ? (
                  <Pill label={stage2 ? "Escalated · L2" : "Escalated"} fg="#b91c1c" bg="#fee2e2" />
                ) : overdue ? (
                  <Pill label="Overdue" fg="#b45309" bg="#fef3c7" />
                ) : null}
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.asset_name || item.device_name}
            </Text>
            <View style={styles.line}>
              <Ionicons name="location-outline" size={14} color={colors.textLight} />
              <Text style={styles.meta} numberOfLines={1}>
                {item.site_name}
                {item.client_names?.length ? ` · ${item.client_names[0]}` : ""}
              </Text>
            </View>
            <View style={styles.footer}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${item.progress}%` }]} />
              </View>
              <Text style={styles.pct}>{item.progress}%</Text>
              {item.due_date ? (
                <Text style={[styles.due, overdue && { color: "#b91c1c", fontWeight: "700" }]}>
                  Due {item.due_date}
                </Text>
              ) : null}
            </View>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  scopeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { fontSize: font.body, fontWeight: "800", color: colors.text },
  pills: { flexDirection: "row", gap: 6 },
  name: { fontSize: font.sm, color: colors.textMuted },
  line: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  track: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, borderRadius: 999, backgroundColor: colors.primary },
  pct: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, width: 36 },
  due: { fontSize: font.xs, color: colors.textLight },
});
