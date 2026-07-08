import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import api from "@/lib/api";
import { getCurrentUser } from "@/lib/user";
import { STATUS_COLORS, Ticket, labelize } from "@/lib/types";

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#3b82f6",
  high: "#f59e0b",
  critical: "#ef4444",
};

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const me = await getCurrentUser();
      const { data } = await api.get(`/tickets/?assigned_to=${me.id}`);
      setTickets(data.results ?? data);
    } catch {
      setError("Could not load your tickets. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={tickets}
      keyExtractor={(t) => t.id}
      contentContainerStyle={tickets.length === 0 ? styles.emptyWrap : styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No assigned tickets</Text>
          <Text style={styles.hint}>{error || "Tickets assigned to you will appear here."}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[item.status] ?? "#6b7280") + "22" }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] ?? "#6b7280" }]}>
                {labelize(item.status)}
              </Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.dot, { backgroundColor: PRIORITY_COLORS[item.priority] ?? "#6b7280" }]} />
            <Text style={styles.meta}>{labelize(item.priority)} priority</Text>
            <Text style={styles.metaDim}>· {labelize(item.category)}</Text>
          </View>
          {item.site_name ? <Text style={styles.metaDim}>📍 {item.site_name}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  list: { padding: 16, gap: 12 },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, textAlign: "center" },
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#eee",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 13, color: "#444" },
  metaDim: { fontSize: 13, color: "#888", marginTop: 4 },
});
