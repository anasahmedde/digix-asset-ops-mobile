import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TicketCard } from "@/components/ticket-card";
import { Chip, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Ticket } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "alignment_pending", label: "Alignment" },
  { key: "on_hold", label: "On Hold" },
  { key: "pending_review", label: "Review" },
  { key: "closed", label: "Closed" },
];

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [meId, setMeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      let uid = meId;
      if (!uid) {
        try { uid = (await getCurrentUser()).id; setMeId(uid); } catch { /* ignore */ }
      }
      const params: Record<string, string> = { ordering: "-created_at", page_size: "100" };
      if (status) params.status = status;
      if (scope === "mine" && uid) params.assigned_to = uid;
      const { data } = await api.get("/tickets/", { params });
      setTickets(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, scope, meId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tickets</Text>
        <View style={styles.segment}>
          <Pressable onPress={() => setScope("mine")} style={[styles.segBtn, scope === "mine" && styles.segActive]}>
            <Text style={[styles.segText, scope === "mine" && styles.segTextActive]}>Mine</Text>
          </Pressable>
          <Pressable onPress={() => setScope("all")} style={[styles.segBtn, scope === "all" && styles.segActive]}>
            <Text style={[styles.segText, scope === "all" && styles.segTextActive]}>All</Text>
          </Pressable>
        </View>
      </View>

      <View>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={(f) => f.key || "all"}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => (
            <Chip label={item.label} active={status === item.key} onPress={() => setStatus(item.key)} />
          )}
        />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={tickets.length === 0 ? { flexGrow: 1 } : styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<EmptyState icon="reader-outline" title="No tickets" subtitle={scope === "mine" ? "Nothing assigned to you in this filter." : "No tickets match this filter."} />}
          renderItem={({ item }) => <TicketCard ticket={item} onPress={() => router.push(`/ticket/${item.id}`)} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  segment: { flexDirection: "row", backgroundColor: "#e9edf3", borderRadius: radius.pill, padding: 3 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.card, ...({ elevation: 1 } as object) },
  segText: { fontSize: font.sm, fontWeight: "700", color: colors.textMuted },
  segTextActive: { color: colors.primary },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  list: { padding: spacing.lg, paddingTop: spacing.xs },
});
