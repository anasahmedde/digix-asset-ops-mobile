import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, EmptyState, Loading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";

interface Supplier {
  id: string;
  name: string;
  code: string;
  service_category_names?: string[];
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  is_active: boolean;
}
type FormState = { name: string; contact_person: string; contact_email: string; contact_phone: string; website: string; address: string };
const EMPTY: FormState = { name: "", contact_person: "", contact_email: "", contact_phone: "", website: "", address: "" };

export default function SuppliersScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/suppliers/", { params: { page_size: 200 } });
      setSuppliers(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person, contact_email: s.contact_email, contact_phone: s.contact_phone, website: s.website, address: s.address });
  }

  async function save() {
    if (!form?.name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      if (editing) await api.patch(`/suppliers/${editing.id}/`, form);
      else await api.post("/suppliers/", form);
      toast.success(editing ? "Vendor updated" : "Vendor created");
      setForm(null);
      load();
    } catch {
      toast.error("You may not have permission, or a field is invalid.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  const filtered = q ? suppliers.filter((s) => [s.name, s.code, s.contact_person].some((v) => (v || "").toLowerCase().includes(q))) : suppliers;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search vendors…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { padding: spacing.lg, paddingTop: spacing.sm }}
        onRefresh={() => { setRefreshing(true); load(); }}
        refreshing={refreshing}
        ListEmptyComponent={<EmptyState icon="car-outline" title="No vendors" subtitle="Tap + to add a vendor." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.sm }} onPress={() => openEdit(item)}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{item.contact_person || "—"}{item.contact_phone ? ` · ${item.contact_phone}` : ""}</Text>
                {item.service_category_names?.length ? <Text style={styles.cats} numberOfLines={1}>{item.service_category_names.join(", ")}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
            </View>
          </Card>
        )}
      />
      <Pressable style={styles.fab} onPress={() => { setEditing(null); setForm({ ...EMPTY }); }}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing ? "Edit vendor" : "New vendor"}</Text>
              <Pressable onPress={() => setForm(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            {([
              ["Company name", "name", "words"],
              ["Contact person", "contact_person", "words"],
              ["Contact email", "contact_email", "none"],
              ["Contact phone", "contact_phone", "none"],
              ["Website", "website", "none"],
              ["Address", "address", "sentences"],
            ] as const).map(([label, key, cap]) => (
              <View key={key} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.label}>{label}{key === "name" ? " *" : ""}</Text>
                <TextInput
                  style={[styles.input, key === "address" && { height: 66, textAlignVertical: "top" }]}
                  value={form?.[key]}
                  onChangeText={(t) => setForm((f) => f && { ...f, [key]: t })}
                  autoCapitalize={cap}
                  keyboardType={key === "contact_email" ? "email-address" : key === "contact_phone" ? "phone-pad" : "default"}
                  multiline={key === "address"}
                  placeholderTextColor={colors.textLight}
                />
              </View>
            ))}
            <Button title={editing ? "Save changes" : "Create vendor"} icon="checkmark" loading={saving} onPress={save} style={{ marginTop: spacing.sm }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, fontSize: font.body, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.body, fontWeight: "800", color: colors.primary },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  cats: { fontSize: font.xs, color: colors.primary, marginTop: 2, fontWeight: "600" },
  fab: { position: "absolute", right: spacing.lg, bottom: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  label: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginBottom: 5 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: font.body, color: colors.text },
});
