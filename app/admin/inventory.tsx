import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";

interface Item {
  id: string;
  material_name: string;
  category_name?: string | null;
  sku: string;
  quantity: number;
  min_stock_level: number;
  location: string;
  unit_cost?: string | number;
  is_low_stock: boolean;
}

export default function InventoryScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [stock, setStock] = useState<{ item: Item; mode: "receive" | "issue"; qty: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitStock() {
    if (!stock) return;
    const qty = parseInt(stock.qty, 10);
    if (!qty || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    setBusy(true);
    try {
      if (stock.mode === "receive") {
        await api.post("/inventory/receipts/", { item: stock.item.id, quantity: qty, reference: stock.note });
        toast.success(`Received ${qty} into stock`);
      } else {
        await api.post("/inventory/issuances/", { item: stock.item.id, quantity: qty, reason: stock.note });
        toast.success(`Issued ${qty} from stock`);
      }
      setStock(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.items?.[0] || e?.response?.data?.quantity?.[0] || "Stock update failed");
    } finally { setBusy(false); }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/items/", { params: { page_size: 300, ordering: "material_name" } });
      setItems(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (lowOnly && !it.is_low_stock) return false;
    if (q && ![it.material_name, it.sku, it.category_name, it.location].some((v) => (v || "").toLowerCase().includes(q))) return false;
    return true;
  });
  const lowCount = items.filter((i) => i.is_low_stock).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search item, SKU, location…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <View style={styles.chipsRow}>
        <Pressable onPress={() => setLowOnly(false)} style={[styles.chip, !lowOnly && styles.chipActive]}><Text style={[styles.chipText, !lowOnly && styles.chipTextActive]}>All ({items.length})</Text></Pressable>
        <Pressable onPress={() => setLowOnly(true)} style={[styles.chip, lowOnly && styles.chipActive]}><Text style={[styles.chipText, lowOnly && styles.chipTextActive]}>Low stock ({lowCount})</Text></Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="cube-outline" title="No items" subtitle="Inventory items will appear here." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.material_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{[item.category_name, item.sku].filter(Boolean).join(" · ") || "—"}</Text>
                {item.location ? <Text style={styles.loc}><Ionicons name="location-outline" size={11} color={colors.textLight} /> {item.location}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[styles.qty, item.is_low_stock && { color: colors.danger }]}>{item.quantity}</Text>
                <Text style={styles.min}>min {item.min_stock_level}</Text>
                {item.is_low_stock ? <Pill label="Low" fg={colors.danger} bg={colors.dangerSoft} /> : null}
              </View>
            </View>
            <View style={styles.actionsRow}>
              <Pressable onPress={() => setStock({ item, mode: "receive", qty: "", note: "" })} style={[styles.stockBtn, styles.receiveBtn]}>
                <Ionicons name="arrow-down-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.stockBtnText, { color: colors.success }]}>Receive</Text>
              </Pressable>
              <Pressable onPress={() => setStock({ item, mode: "issue", qty: "", note: "" })} style={[styles.stockBtn, styles.issueBtn]}>
                <Ionicons name="arrow-up-circle-outline" size={16} color={colors.warning} />
                <Text style={[styles.stockBtnText, { color: "#b45309" }]}>Issue</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />

      <Modal visible={!!stock} animationType="slide" transparent onRequestClose={() => setStock(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{stock?.mode === "receive" ? "Receive Stock" : "Issue Stock"}</Text>
              <Pressable onPress={() => setStock(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={styles.sheetItem}>{stock?.item.material_name} · current {stock?.item.quantity}</Text>
            <Text style={styles.label}>Quantity</Text>
            <TextInput value={stock?.qty} onChangeText={(t) => setStock((s2) => s2 ? { ...s2, qty: t.replace(/[^0-9]/g, "") } : s2)} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textLight} style={styles.input} />
            <Text style={styles.label}>{stock?.mode === "receive" ? "Reference (GRN / PO)" : "Reason / destination"}</Text>
            <TextInput value={stock?.note} onChangeText={(t) => setStock((s2) => s2 ? { ...s2, note: t } : s2)} placeholder={stock?.mode === "receive" ? "e.g. PO-2026-00012" : "e.g. issued to site visit"} placeholderTextColor={colors.textLight} style={styles.input} />
            <Pressable onPress={submitStock} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.5 }]}>
              <Text style={styles.submitText}>{busy ? "Saving…" : stock?.mode === "receive" ? "Receive" : "Issue"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  stockBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: radius.sm, borderWidth: 1 },
  receiveBtn: { borderColor: "#bbf0dd", backgroundColor: colors.successSoft },
  issueBtn: { borderColor: "#fde4bf", backgroundColor: colors.warningSoft },
  stockBtnText: { fontSize: font.sm, fontWeight: "700" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sheetTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  sheetItem: { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.md },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted, marginTop: spacing.sm, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44, fontSize: font.body, color: colors.text, backgroundColor: colors.bg },
  submitBtn: { marginTop: spacing.lg, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  submitText: { color: "#fff", fontSize: font.body, fontWeight: "700" },
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  chipsRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  loc: { fontSize: font.xs, color: colors.textLight, marginTop: 2 },
  qty: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  min: { fontSize: font.xs, color: colors.textLight },
});
