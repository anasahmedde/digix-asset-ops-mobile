import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";

import { Button, Card, EmptyState, Loading, Row, StatusPill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { toast } from "@/lib/toast";
import { Device, labelize } from "@/lib/types";

const CATEGORIES = ["repair", "replacement", "inspection", "relocation", "installation", "other"];
const PRIORITIES = ["low", "medium", "high", "critical"];
const WARRANTY_TONE: Record<string, { fg: string; bg: string; label: string }> = {
  active: { fg: "#047857", bg: colors.successSoft, label: "Under Warranty" },
  expired: { fg: colors.danger, bg: colors.dangerSoft, label: "Warranty Expired" },
  none: { fg: colors.textMuted, bg: "#eef1f5", label: "No Warranty" },
};

export default function AssetDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<{ title: string; category: string; priority: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [install, setInstall] = useState<{ id: string; progress: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/assets/devices/", { params: { search: code, page_size: 1 } });
        const results = data.results ?? data;
        if (results.length) {
          setDevice(results[0]);
          try {
            const inst = await api.get("/sites/installations/", { params: { device: results[0].id, ordering: "-installed_at", page_size: 1 } });
            const list = inst.data.results ?? inst.data;
            if (list.length) setInstall({ id: list[0].id, progress: list[0].progress ?? 0 });
          } catch { /* no installation */ }
        } else setNotFound(true);
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    })();
  }, [code]);

  async function raiseTicket() {
    if (!form?.title.trim()) { toast.error("Please enter a title"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/tickets/", {
        title: form.title, description: form.description, priority: form.priority,
        category: form.category, device: device?.id,
      });
      toast.success("Ticket created");
      setForm(null);
      router.push(`/ticket/${data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not create ticket");
    } finally { setSaving(false); }
  }

  if (loading) return <><Stack.Screen options={{ title: "Asset" }} /><Loading /></>;
  if (notFound || !device) {
    return (
      <><Stack.Screen options={{ title: "Asset" }} />
        <EmptyState icon="alert-circle-outline" title="Asset not found" subtitle={`No asset matches "${code}".`} />
      </>
    );
  }

  const w = WARRANTY_TONE[device.warranty_status || "none"] || WARRANTY_TONE.none;

  return (
    <>
      <Stack.Screen options={{ title: device.asset_code }} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="tv-outline" size={26} color={colors.primary} /></View>
            <Text style={styles.assetCode}>{device.asset_code}</Text>
            {device.display_name ? <Text style={styles.assetName}>{device.display_name}</Text> : null}
            <View style={styles.badges}>
              <StatusPill status={device.status} />
              <View style={[styles.wPill, { backgroundColor: w.bg }]}><Text style={[styles.wText, { color: w.fg }]}>{w.label}</Text></View>
            </View>
          </View>

          <Card>
            <Row label="Type" value={device.asset_type_name || device.device_model_name || "—"} />
            <Row label="Model" value={device.device_model_name || "—"} />
            <Row label="Serial No." value={device.serial_number} />
            <Row label="Status" value={labelize(device.status)} />
            <Row label="Site" value={device.site_name || "—"} />
            <Row label="Client" value={device.client_name || "—"} />
          </Card>

          {install ? (
            <Card style={{ marginTop: spacing.lg }} onPress={() => router.push(`/installation/${install.id}`)}>
              <View style={styles.instRow}>
                <View style={styles.instIcon}><Ionicons name="construct-outline" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.instTitle}>Installation progress</Text>
                  <View style={styles.instTrack}><View style={[styles.instFill, { width: `${install.progress}%` }]} /></View>
                </View>
                <Text style={styles.instPct}>{install.progress}%</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
            </Card>
          ) : null}

          <Button
            title="Raise a Ticket for this Asset"
            icon="add-circle-outline"
            style={{ marginTop: spacing.lg }}
            onPress={() => setForm({ title: "", category: "repair", priority: "medium", description: "" })}
          />
        </ScrollView>
      </View>

      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>New Ticket · {device.asset_code}</Text>
              <Pressable onPress={() => setForm(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Title</Text>
              <TextInput value={form?.title} onChangeText={(t) => setForm((f) => f && { ...f, title: t })} placeholder="e.g. Screen flickering" placeholderTextColor={colors.textLight} style={styles.input} />

              <Text style={styles.label}>Category</Text>
              <View style={styles.pillRow}>
                {CATEGORIES.map((c) => (
                  <Pressable key={c} onPress={() => setForm((f) => f && { ...f, category: c })} style={[styles.selPill, form?.category === c && styles.selPillActive]}>
                    <Text style={[styles.selPillText, form?.category === c && styles.selPillTextActive]}>{labelize(c)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Priority</Text>
              <View style={styles.pillRow}>
                {PRIORITIES.map((p) => (
                  <Pressable key={p} onPress={() => setForm((f) => f && { ...f, priority: p })} style={[styles.selPill, form?.priority === p && styles.selPillActive]}>
                    <Text style={[styles.selPillText, form?.priority === p && styles.selPillTextActive]}>{labelize(p)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput value={form?.description} onChangeText={(t) => setForm((f) => f && { ...f, description: t })} placeholder="Describe the issue…" placeholderTextColor={colors.textLight} multiline style={[styles.input, { height: 90, textAlignVertical: "top" }]} />

              <Button title="Create Ticket" icon="checkmark" loading={saving} onPress={raiseTicket} style={{ marginTop: spacing.sm, marginBottom: spacing.lg }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  heroIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  assetCode: { fontSize: font.h1, fontWeight: "800", color: colors.text },
  assetName: { fontSize: font.body, color: colors.textMuted, marginTop: 2 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  wPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  instRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  instIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  instTitle: { fontSize: font.sm, fontWeight: "700", color: colors.text, marginBottom: 5 },
  instTrack: { height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  instFill: { height: 6, borderRadius: 999, backgroundColor: colors.primary },
  instPct: { fontSize: font.sm, fontWeight: "800", color: colors.primary },
  wText: { fontSize: font.xs, fontWeight: "700" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted, marginBottom: 6, marginTop: spacing.sm },
  input: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontSize: font.body, color: colors.text },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selPill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  selPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selPillText: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted },
  selPillTextActive: { color: "#fff" },
});
