import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import api from "@/lib/api";

interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  order_type_display?: string;
  status: string;
  status_display?: string;
  supplier_name?: string | null;
  currency?: string;
  total_amount?: string | number;
}

export const WO_STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  draft: { fg: colors.textMuted, bg: colors.border },
  pending_approval: { fg: "#b45309", bg: "#fef3c7" },
  approved: { fg: colors.info, bg: colors.infoSoft },
  issued: { fg: colors.info, bg: colors.infoSoft },
  in_progress: { fg: "#7c3aed", bg: "#f1ecfe" },
  partially_delivered: { fg: "#b45309", bg: "#fef3c7" },
  delivered: { fg: colors.primary, bg: colors.primarySoft },
  completed: { fg: "#047857", bg: colors.successSoft },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft },
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "in_progress", label: "In Progress" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export const labelWO = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function WorkOrdersScreen() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async (st: string) => {
    try {
      const params: Record<string, string | number> = { page_size: 100, ordering: "-created_at" };
      if (st) params.status = st;
      const { data } = await api.get("/work-orders/", { params });
      setOrders(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(status); }, [status, load]);

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key || "all"}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => setStatus(item.key)} style={[styles.chip, status === item.key && styles.chipActive]}>
            <Text style={[styles.chipText, status === item.key && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        )}
      />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={orders.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(status); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="document-text-outline" title="No work orders" subtitle="Work orders will appear here." />}
        renderItem={({ item }) => {
          const tone = WO_STATUS_TONE[item.status] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/admin/work-order/${item.id}`)}>
              <View style={styles.topRow}>
                <Text style={styles.wo}>{item.wo_number}</Text>
                <Pill label={item.status_display || labelWO(item.status)} fg={tone.fg} bg={tone.bg} />
              </View>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta} numberOfLines={1}>{item.supplier_name || "No supplier"}</Text>
                <Text style={styles.amount}>{item.currency || ""} {Number(item.total_amount || 0).toLocaleString()}</Text>
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
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  wo: { fontSize: font.sm, fontWeight: "800", color: colors.primary },
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  meta: { flex: 1, fontSize: font.sm, color: colors.textMuted },
  amount: { fontSize: font.sm, fontWeight: "700", color: colors.text },
});
