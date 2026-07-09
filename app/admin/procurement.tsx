import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import api from "@/lib/api";

interface PO {
  id: string;
  po_number: string;
  supplier_name?: string | null;
  status: string;
  currency?: string;
  order_date?: string | null;
  total_amount?: string | number;
}

export const PO_TONE: Record<string, { fg: string; bg: string }> = {
  draft: { fg: colors.textMuted, bg: colors.border },
  approved: { fg: colors.info, bg: colors.infoSoft },
  ordered: { fg: "#6366f1", bg: "#eef2ff" },
  partially_received: { fg: "#7c3aed", bg: "#f1ecfe" },
  received: { fg: "#047857", bg: colors.successSoft },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft },
};
export const poLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "ordered", label: "Ordered" },
  { key: "partially_received", label: "Partial" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

export default function ProcurementScreen() {
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async (st: string) => {
    try {
      const params: Record<string, string | number> = { page_size: 100, ordering: "-order_date" };
      if (st) params.status = st;
      const { data } = await api.get("/procurement/orders/", { params });
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
        ListEmptyComponent={<EmptyState icon="cart-outline" title="No purchase orders" subtitle="POs will appear here." />}
        renderItem={({ item }) => {
          const tone = PO_TONE[item.status] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/admin/purchase-order/${item.id}`)}>
              <View style={styles.topRow}>
                <Text style={styles.po}>{item.po_number}</Text>
                <Pill label={poLabel(item.status)} fg={tone.fg} bg={tone.bg} />
              </View>
              <Text style={styles.supplier} numberOfLines={1}>{item.supplier_name || "No supplier"}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.date}>{item.order_date ? formatDate(item.order_date) : "—"}</Text>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  po: { fontSize: font.sm, fontWeight: "800", color: colors.primary },
  supplier: { fontSize: font.body, fontWeight: "700", color: colors.text },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  date: { fontSize: font.sm, color: colors.textMuted },
  amount: { fontSize: font.sm, fontWeight: "700", color: colors.text },
});
