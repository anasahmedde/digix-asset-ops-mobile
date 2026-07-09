import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, Loading, Pill } from "@/components/ui";
import { colors, font, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import api from "@/lib/api";
import { PO_TONE, poLabel } from "../procurement";

interface Item { id: string; description: string; quantity: string | number; unit_price: string | number; received_quantity?: string | number; line_total: string | number; }
interface PO {
  id: string; po_number: string; supplier_name?: string | null; status: string; currency?: string;
  order_date?: string | null; expected_delivery?: string | null; total_amount?: string | number;
  ordered_by_name?: string | null; notes?: string; items?: Item[];
}

export default function PurchaseOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/procurement/orders/${id}/`);
      setPo(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!po) return <SafeAreaView style={styles.safe}><Text style={styles.err}>Purchase order not found.</Text></SafeAreaView>;

  const tone = PO_TONE[po.status] ?? { fg: colors.textMuted, bg: colors.border };
  const cur = po.currency || "";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.head}>
          <Text style={styles.po}>{po.po_number}</Text>
          <Pill label={poLabel(po.status)} fg={tone.fg} bg={tone.bg} />
        </View>
        <Text style={styles.supplier}>{po.supplier_name || "No supplier"}</Text>

        <Card style={{ marginTop: spacing.lg, gap: 10 }}>
          <Row label="Order date" value={po.order_date ? formatDate(po.order_date) : "—"} />
          <Row label="Expected" value={po.expected_delivery ? formatDate(po.expected_delivery) : "—"} />
          <Row label="Ordered by" value={po.ordered_by_name || "—"} />
          <View style={styles.divider} />
          <Row label="Total" value={`${cur} ${Number(po.total_amount || 0).toLocaleString()}`} bold />
        </Card>

        {po.notes ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.desc}>{po.notes}</Text>
          </Card>
        ) : null}

        <Text style={styles.section}>Items ({po.items?.length ?? 0})</Text>
        {(po.items ?? []).length === 0 ? (
          <Card><Text style={styles.desc}>No line items.</Text></Card>
        ) : (
          po.items!.map((it) => (
            <Card key={it.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.itemDesc}>{it.description}</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemMeta}>{it.quantity} × {cur} {Number(it.unit_price).toLocaleString()}{it.received_quantity != null ? `  ·  recv ${it.received_quantity}` : ""}</Text>
                <Text style={styles.itemTotal}>{cur} {Number(it.line_total).toLocaleString()}</Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <View style={styles.kv}><Text style={styles.k}>{label}</Text><Text style={[styles.v, bold && { fontWeight: "800", fontSize: font.body }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  po: { fontSize: font.h3, fontWeight: "800", color: colors.primary },
  supplier: { fontSize: font.h2, fontWeight: "800", color: colors.text, marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.border },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  sectionLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  desc: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  itemDesc: { fontSize: font.body, fontWeight: "600", color: colors.text },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  itemMeta: { fontSize: font.sm, color: colors.textMuted, flex: 1 },
  itemTotal: { fontSize: font.sm, fontWeight: "700", color: colors.text },
});
