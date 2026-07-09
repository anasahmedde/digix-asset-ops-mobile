import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import api from "@/lib/api";

interface Warranty {
  id: string;
  device_code?: string | null;
  supplier_name?: string | null;
  warranty_type?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  coverage_details?: string;
  reference_number?: string;
  is_expired: boolean;
}
const cap = (s?: string) => (s ? s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");

export default function WarrantiesScreen() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [selected, setSelected] = useState<Warranty | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/warranties/", { params: { page_size: 300, ordering: "end_date" } });
      setWarranties(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = warranties.filter((w) => {
    if (filter === "active" && w.is_expired) return false;
    if (filter === "expired" && !w.is_expired) return false;
    if (q && ![w.device_code, w.supplier_name, w.reference_number].some((v) => (v || "").toLowerCase().includes(q))) return false;
    return true;
  });
  const expiredCount = warranties.filter((w) => w.is_expired).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search device, supplier, ref…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <View style={styles.chipsRow}>
        {([["all", `All (${warranties.length})`], ["active", `Active (${warranties.length - expiredCount})`], ["expired", `Expired (${expiredCount})`]] as const).map(([k, lbl]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipActive]}>
            <Text style={[styles.chipText, filter === k && styles.chipTextActive]}>{lbl}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(w) => w.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title="No warranties" subtitle="Warranties will appear here." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }} onPress={() => setSelected(item)}>
            <View style={styles.topRow}>
              <Text style={styles.device}>{item.device_code || "—"}</Text>
              {item.is_expired
                ? <Pill label="Expired" fg={colors.danger} bg={colors.dangerSoft} />
                : <Pill label="Active" fg="#047857" bg={colors.successSoft} />}
            </View>
            <Text style={styles.meta} numberOfLines={1}>{[cap(item.warranty_type), item.supplier_name].filter(Boolean).join(" · ")}</Text>
            {item.end_date ? <Text style={styles.end}>Ends {formatDate(item.end_date)}</Text> : null}
          </Card>
        )}
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{selected?.device_code || "Warranty"}</Text>
              <Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView>
              <Row label="Type" value={cap(selected?.warranty_type)} />
              <Row label="Supplier" value={selected?.supplier_name || "—"} />
              <Row label="Reference" value={selected?.reference_number || "—"} />
              <Row label="Start" value={selected?.start_date ? formatDate(selected.start_date) : "—"} />
              <Row label="End" value={selected?.end_date ? formatDate(selected.end_date) : "—"} />
              <Row label="Status" value={selected?.is_expired ? "Expired" : "Active"} />
              {selected?.coverage_details ? (<><Text style={styles.blockLabel}>Coverage</Text><Text style={styles.body}>{selected.coverage_details}</Text></>) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.kv}><Text style={styles.k}>{label}</Text><Text style={styles.v}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  chipsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  device: { fontSize: font.body, fontWeight: "800", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  end: { fontSize: font.xs, color: colors.textLight, marginTop: 4 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: "80%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { flex: 1, fontSize: font.h3, fontWeight: "800", color: colors.text },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  blockLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  body: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
});
