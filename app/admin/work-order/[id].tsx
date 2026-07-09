import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { WO_STATUS_TONE, labelWO } from "../work-orders";

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["issued", "cancelled"],
  issued: ["in_progress", "cancelled"],
  in_progress: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["delivered", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

interface Item { id: string; description: string; quantity: string | number; unit_price: string | number; line_total: string | number; }
interface WO {
  id: string; wo_number: string; title: string; description?: string;
  order_type_display?: string; status: string; status_display?: string;
  supplier_name?: string | null; client_name?: string | null; site_name?: string | null;
  currency?: string; total_amount?: string | number; items?: Item[];
}

export default function WorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [wo, setWo] = useState<WO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/work-orders/${id}/`);
      setWo(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function transition(status: string) {
    setBusy(true);
    try {
      await api.post(`/work-orders/${id}/transition/`, { status });
      toast.success(`Moved to ${labelWO(status)}`);
      await load();
    } catch {
      toast.error("Could not change status (check permissions).");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!wo) return <SafeAreaView style={styles.safe}><Text style={styles.err}>Work order not found.</Text></SafeAreaView>;

  const tone = WO_STATUS_TONE[wo.status] ?? { fg: colors.textMuted, bg: colors.border };
  const next = NEXT_STATUS[wo.status] ?? [];
  const cur = wo.currency || "";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={styles.head}>
          <Text style={styles.wo}>{wo.wo_number}</Text>
          <Pill label={wo.status_display || labelWO(wo.status)} fg={tone.fg} bg={tone.bg} />
        </View>
        <Text style={styles.title}>{wo.title}</Text>
        {wo.order_type_display ? <Text style={styles.type}>{wo.order_type_display}</Text> : null}

        <Card style={{ marginTop: spacing.lg, gap: 10 }}>
          <Row label="Supplier" value={wo.supplier_name || "—"} />
          <Row label="Client" value={wo.client_name || "—"} />
          <Row label="Site" value={wo.site_name || "—"} />
          <View style={styles.divider} />
          <Row label="Total" value={`${cur} ${Number(wo.total_amount || 0).toLocaleString()}`} bold />
        </Card>

        {wo.description ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.desc}>{wo.description}</Text>
          </Card>
        ) : null}

        {/* Items */}
        <Text style={styles.section}>Items ({wo.items?.length ?? 0})</Text>
        {(wo.items ?? []).length === 0 ? (
          <Card><Text style={styles.desc}>No line items.</Text></Card>
        ) : (
          wo.items!.map((it) => (
            <Card key={it.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.itemDesc}>{it.description}</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemMeta}>{it.quantity} × {cur} {Number(it.unit_price).toLocaleString()}</Text>
                <Text style={styles.itemTotal}>{cur} {Number(it.line_total).toLocaleString()}</Text>
              </View>
            </Card>
          ))
        )}

        {/* Status transitions */}
        {next.length > 0 && (
          <>
            <Text style={styles.section}>Advance status</Text>
            <View style={styles.actions}>
              {next.map((s) => (
                <Button
                  key={s}
                  title={labelWO(s)}
                  small
                  variant={s === "cancelled" ? "danger" : "primary"}
                  loading={busy}
                  onPress={() => transition(s)}
                  style={{ marginRight: spacing.sm, marginBottom: spacing.sm }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{label}</Text>
      <Text style={[styles.v, bold && { fontWeight: "800", fontSize: font.body }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  wo: { fontSize: font.h3, fontWeight: "800", color: colors.primary },
  title: { fontSize: font.h2, fontWeight: "800", color: colors.text, marginTop: 6 },
  type: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  sectionLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  desc: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  itemDesc: { fontSize: font.body, fontWeight: "600", color: colors.text },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  itemMeta: { fontSize: font.sm, color: colors.textMuted },
  itemTotal: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", flexWrap: "wrap" },
});
