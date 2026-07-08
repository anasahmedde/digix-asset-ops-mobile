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
import { Site } from "@/lib/types";

export default function VisitsScreen() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/sites/?is_active=true");
      setSites(data.results ?? data);
    } catch {
      setError("Could not load sites. Pull to retry.");
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
      data={sites}
      keyExtractor={(s) => s.id}
      contentContainerStyle={sites.length === 0 ? styles.emptyWrap : styles.list}
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
          <Text style={styles.emptyTitle}>No sites</Text>
          <Text style={styles.hint}>{error || "Active sites will appear here."}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          {item.client_name ? <Text style={styles.client}>{item.client_name}</Text> : null}
          <Text style={styles.address}>
            {[item.address, item.city].filter(Boolean).join(", ")}
          </Text>
          <View style={styles.footer}>
            <Text style={styles.count}>{item.device_count ?? 0} assets</Text>
            {item.latitude != null && item.longitude != null ? (
              <Text style={styles.geo}>📍 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</Text>
            ) : null}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  list: { padding: 16 },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#333" },
  hint: { fontSize: 14, color: "#888", marginTop: 8, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  name: { fontSize: 15, fontWeight: "600", color: "#111" },
  client: { fontSize: 13, color: "#2563eb", marginTop: 2 },
  address: { fontSize: 13, color: "#888", marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  count: { fontSize: 12, fontWeight: "600", color: "#444" },
  geo: { fontSize: 12, color: "#888" },
});
