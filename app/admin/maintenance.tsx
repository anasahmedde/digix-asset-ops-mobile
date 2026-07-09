import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";

interface Schedule {
  id: string;
  title: string;
  maintenance_type?: string;
  frequency?: string;
  device_code?: string | null;
  site_name?: string | null;
  assigned_to_name?: string | null;
  next_due?: string | null;
  status?: string;
  status_display?: string;
  effective_status?: string;
  instructions?: string;
}

const TONE: Record<string, { fg: string; bg: string }> = {
  overdue: { fg: colors.danger, bg: colors.dangerSoft },
  due_soon: { fg: "#b45309", bg: "#fef3c7" },
  scheduled: { fg: colors.info, bg: colors.infoSoft },
  upcoming: { fg: colors.info, bg: colors.infoSoft },
  completed: { fg: "#047857", bg: colors.successSoft },
  active: { fg: colors.primary, bg: colors.primarySoft },
};
const cap = (s?: string) => (s ? s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");

export default function MaintenanceScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/schedules/", { params: { page_size: 300, ordering: "next_due" } });
      setSchedules(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = q ? schedules.filter((s) => [s.title, s.device_code, s.site_name].some((v) => (v || "").toLowerCase().includes(q))) : schedules;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search maintenance…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="construct-outline" title="No schedules" subtitle="Maintenance schedules will appear here." />}
        renderItem={({ item }) => {
          const st = item.effective_status || item.status || "";
          const tone = TONE[st] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => setSelected(item)}>
              <View style={styles.topRow}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Pill label={item.status_display || cap(st)} fg={tone.fg} bg={tone.bg} />
              </View>
              <Text style={styles.meta} numberOfLines={1}>{[cap(item.maintenance_type), cap(item.frequency)].filter(Boolean).join(" · ")}</Text>
              <View style={styles.bottomRow}>
                <Text style={styles.sub} numberOfLines={1}>{item.device_code || item.site_name || "—"}</Text>
                {item.next_due ? <Text style={styles.due}>Due {formatDate(item.next_due)}</Text> : null}
              </View>
            </Card>
          );
        }}
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={2}>{selected?.title}</Text>
              <Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView>
              <Row label="Type" value={cap(selected?.maintenance_type)} />
              <Row label="Frequency" value={cap(selected?.frequency)} />
              <Row label="Device" value={selected?.device_code || "—"} />
              <Row label="Site" value={selected?.site_name || "—"} />
              <Row label="Assigned to" value={selected?.assigned_to_name || "—"} />
              <Row label="Next due" value={selected?.next_due ? formatDate(selected.next_due) : "—"} />
              <Row label="Status" value={selected?.status_display || cap(selected?.effective_status)} />
              {selected?.instructions ? (
                <>
                  <Text style={styles.insLabel}>Instructions</Text>
                  <Text style={styles.ins}>{selected.instructions}</Text>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}><Text style={styles.k}>{label}</Text><Text style={styles.v}>{value}</Text></View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  sub: { flex: 1, fontSize: font.sm, color: colors.textLight },
  due: { fontSize: font.xs, color: colors.text, fontWeight: "600" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: "80%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md, gap: spacing.sm },
  sheetTitle: { flex: 1, fontSize: font.h3, fontWeight: "800", color: colors.text },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  insLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  ins: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
});
