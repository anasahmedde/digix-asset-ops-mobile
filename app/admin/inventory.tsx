import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";

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
          </Card>
        )}
      />
    </SafeAreaView>
  );
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  loc: { fontSize: font.xs, color: colors.textLight, marginTop: 2 },
  qty: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  min: { fontSize: font.xs, color: colors.textLight },
});
