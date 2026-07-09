import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import { formatDate } from "@/lib/format";
import api from "@/lib/api";

interface Member {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  phone: string;
  is_field_staff: boolean;
  is_active: boolean;
  date_joined?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", ops_manager: "Ops Manager", supervisor: "Supervisor",
  technician: "Technician", warehouse: "Warehouse", finance: "Finance", client_viewer: "Client",
};
const ROLE_TONE: Record<string, { fg: string; bg: string }> = {
  super_admin: { fg: "#7c3aed", bg: "#f1ecfe" },
  ops_manager: { fg: colors.primary, bg: colors.primarySoft },
  supervisor: { fg: colors.info, bg: colors.infoSoft },
  technician: { fg: "#047857", bg: colors.successSoft },
  warehouse: { fg: "#b45309", bg: "#fef3c7" },
  finance: { fg: "#0891b2", bg: "#e0f7fa" },
  client_viewer: { fg: colors.textMuted, bg: colors.border },
};

export default function TeamsScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/accounts/users/", { params: { page_size: 200, ordering: "first_name" } });
      setMembers(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = q ? members.filter((m) => [m.full_name, m.username, m.email, ROLE_LABELS[m.role]].some((v) => (v || "").toLowerCase().includes(q))) : members;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search people…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No people" subtitle="Team members will appear here." />}
        renderItem={({ item }) => {
          const tone = ROLE_TONE[item.role] ?? { fg: colors.textMuted, bg: colors.border };
          return (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => setSelected(item)}>
              <View style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: tone.bg }]}><Text style={[styles.avatarText, { color: tone.fg }]}>{(item.full_name || item.username || "?").charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.full_name || item.username}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{item.email || item.username}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Pill label={ROLE_LABELS[item.role] || item.role} fg={tone.fg} bg={tone.bg} />
                  {!item.is_active ? <Text style={styles.inactive}>Inactive</Text> : null}
                </View>
              </View>
            </Card>
          );
        }}
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{selected?.full_name || selected?.username}</Text>
              <Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <Row label="Role" value={ROLE_LABELS[selected?.role || ""] || selected?.role || "—"} />
            <Row label="Username" value={selected?.username || "—"} />
            <Row label="Email" value={selected?.email || "—"} onPress={selected?.email ? () => Linking.openURL(`mailto:${selected.email}`) : undefined} />
            <Row label="Phone" value={selected?.phone || "—"} onPress={selected?.phone ? () => Linking.openURL(`tel:${selected.phone}`) : undefined} />
            <Row label="Field staff" value={selected?.is_field_staff ? "Yes" : "No"} />
            <Row label="Status" value={selected?.is_active ? "Active" : "Inactive"} />
            <Row label="Joined" value={selected?.date_joined ? formatDate(selected.date_joined) : "—"} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.kv} onPress={onPress} disabled={!onPress}>
      <Text style={styles.k}>{label}</Text>
      <Text style={[styles.v, onPress && { color: colors.primary }]} numberOfLines={1}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.h3, fontWeight: "800" },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  inactive: { fontSize: font.xs, color: colors.danger, fontWeight: "600" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { flex: 1, fontSize: font.h3, fontWeight: "800", color: colors.text },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
});
