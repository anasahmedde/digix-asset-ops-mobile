import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Site } from "@/lib/types";

export default function VisitsScreen() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/sites/sites/", { params: { is_active: true, page_size: 200 } });
      setSites(data.results ?? data);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={sites}
      keyExtractor={(s) => s.id}
      contentContainerStyle={sites.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={<EmptyState icon="map-outline" title="No sites" subtitle="Active sites will appear here." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing.md, gap: 4 }}>
          <Text style={styles.name}>{item.name}</Text>
          {item.client_name ? <Text style={styles.client}>{item.client_name}</Text> : null}
          <View style={styles.line}>
            <Ionicons name="location-outline" size={14} color={colors.textLight} />
            <Text style={styles.addr} numberOfLines={1}>{[item.address, item.city].filter(Boolean).join(", ") || "—"}</Text>
          </View>
          <View style={styles.footer}>
            <View style={styles.badge}><Ionicons name="tv-outline" size={13} color={colors.primary} /><Text style={styles.badgeText}>{item.device_count ?? 0} assets</Text></View>
            {item.latitude != null && item.longitude != null ? (
              <Text style={styles.geo}>{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</Text>
            ) : null}
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  client: { fontSize: font.sm, color: colors.primary, fontWeight: "600" },
  line: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  addr: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: font.xs, fontWeight: "700", color: colors.primary },
  geo: { fontSize: font.xs, color: colors.textLight },
});
