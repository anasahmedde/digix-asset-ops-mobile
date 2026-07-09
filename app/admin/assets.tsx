import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Device, labelize } from "@/lib/types";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "installed", label: "Installed" },
  { key: "in_stock", label: "In Stock" },
  { key: "under_maintenance", label: "Maintenance" },
  { key: "assigned", label: "Assigned" },
  { key: "rma", label: "RMA" },
  { key: "decommissioned", label: "Decommissioned" },
];

const STATUS_TONE: Record<string, { fg: string; bg: string }> = {
  active: { fg: "#047857", bg: colors.successSoft },
  installed: { fg: colors.primary, bg: colors.primarySoft },
  in_stock: { fg: "#b45309", bg: "#fef3c7" },
  under_maintenance: { fg: "#b45309", bg: "#fef3c7" },
  rma: { fg: colors.danger, bg: colors.dangerSoft },
  decommissioned: { fg: colors.textMuted, bg: colors.border },
};

export default function AssetsListScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q: string, st: string) => {
    try {
      const params: Record<string, string | number> = { page_size: 100, ordering: "-created_at" };
      if (q) params.search = q;
      if (st) params.status = st;
      const { data } = await api.get("/assets/devices/", { params });
      setDevices(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(search, status), 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [search, status, load]);

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput
          style={styles.search}
          placeholder="Search asset code, serial, model…"
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search ? <Pressable onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.textLight} /></Pressable> : null}
      </View>

      {/* Status filter */}
      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={(s) => s.key || "all"}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <Pressable onPress={() => setStatus(item.key)} style={[styles.chip, status === item.key && styles.chipActive]}>
            <Text style={[styles.chipText, status === item.key && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        )}
        style={{ flexGrow: 0 }}
      />

      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={devices.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(search, status); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="hardware-chip-outline" title="No assets" subtitle="Try a different search or filter." />}
        renderItem={({ item }) => {
          const tone = STATUS_TONE[item.status] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/asset/${item.asset_code}`)}>
              <View style={styles.row}>
                <View style={styles.thumb}><Ionicons name="tv-outline" size={20} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{item.asset_code}</Text>
                  <Text style={styles.name} numberOfLines={1}>{item.display_name || item.device_model_name || item.asset_type_name || "Device"}</Text>
                  {item.site_name ? <Text style={styles.meta} numberOfLines={1}>{item.site_name}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Pill label={labelize(item.status.replace(/_/g, " "))} fg={tone.fg} bg={tone.bg} />
                  <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                </View>
              </View>
            </Card>
          );
        }}
        ListHeaderComponent={<Text style={styles.count}>{devices.length} asset{devices.length === 1 ? "" : "s"}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.sm, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  count: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600", marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  code: { fontSize: font.body, fontWeight: "800", color: colors.text },
  name: { fontSize: font.sm, color: colors.textMuted },
  meta: { fontSize: font.xs, color: colors.textLight, marginTop: 1 },
});
