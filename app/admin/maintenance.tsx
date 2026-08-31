import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Chip, EmptyState, Loading, Pill } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

interface Schedule {
  id: string;
  title: string;
  maintenance_type?: string;
  frequency?: string;
  device?: string | null;
  device_code?: string | null;
  site_name?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  next_due?: string | null;
  status?: string;
  status_display?: string;
  effective_status?: string;
  instructions?: string;
}
interface Component { id: string; name: string }

const TONE: Record<string, { fg: string; bg: string }> = {
  overdue: { fg: colors.danger, bg: colors.dangerSoft },
  due_soon: { fg: "#b45309", bg: "#fef3c7" },
  scheduled: { fg: colors.info, bg: colors.infoSoft },
  upcoming: { fg: colors.info, bg: colors.infoSoft },
  in_process: { fg: "#b45309", bg: "#fef3c7" },
  completed: { fg: "#047857", bg: colors.successSoft },
  active: { fg: colors.primary, bg: colors.primarySoft },
};
const cap = (s?: string) => (s ? s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "");
const RECORD_STATUSES = ["completed", "partial", "skipped"] as const;

export default function MaintenanceScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);

  // Complete-cycle form
  const [completing, setCompleting] = useState(false);
  const [recStatus, setRecStatus] = useState<(typeof RECORD_STATUSES)[number]>("completed");
  const [recNotes, setRecNotes] = useState("");
  const [recCost, setRecCost] = useState("");
  const [billable, setBillable] = useState<boolean | null>(null); // null = let the server derive
  const [components, setComponents] = useState<Component[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [recPhoto, setRecPhoto] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/schedules/", { params: { page_size: 300, ordering: "next_due" } });
      setSchedules(data.results ?? data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    getCurrentUser().then((u) => setMeId(u.id)).catch(() => {});
  }, [load]);

  async function startWork() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/maintenance/schedules/${selected.id}/`, { status: "in_process" });
      setSelected(data);
      toast.success("Maintenance started");
      load();
    } catch {
      toast.error("Could not start maintenance");
    } finally {
      setBusy(false);
    }
  }

  async function openComplete() {
    if (!selected) return;
    setRecStatus("completed");
    setRecNotes("");
    setRecCost("");
    setBillable(null);
    setUsedIds(new Set());
    setRecPhoto(null);
    setComponents([]);
    setCompleting(true);
    if (selected.device) {
      try {
        const { data } = await api.get(`/assets/devices/${selected.device}/`);
        setComponents((data.components ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } catch { /* components optional */ }
    }
  }

  async function pickRecordPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const result = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (!result.canceled && result.assets?.length) setRecPhoto(result.assets[0].uri);
  }

  async function submitRecord() {
    if (!selected || savingRecord) return;
    setSavingRecord(true);
    try {
      const payload: Record<string, unknown> = {
        schedule: selected.id,
        performed_at: new Date().toISOString(),
        status: recStatus,
        notes: recNotes,
        components_used: Array.from(usedIds),
      };
      if (recCost.trim()) payload.cost = recCost.trim();
      if (billable !== null) {
        payload.is_billable = billable;
        payload.charge_to = billable ? "client" : "company";
      }
      const { data } = await api.post("/maintenance/records/", payload);
      if (recPhoto) {
        try {
          const fd = new FormData();
          fd.append("record", data.id);
          fd.append("image", { uri: recPhoto, name: "maintenance.jpg", type: "image/jpeg" } as never);
          await api.post("/maintenance/record-photos/", fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch {
          toast.error("Record saved, photo upload failed");
        }
      }
      const chargeNote = data.is_billable ? "Billable to client" : "Covered — no client charge";
      toast.success(`Maintenance recorded · ${chargeNote}`);
      setCompleting(false);
      setSelected(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Could not save the record");
    } finally {
      setSavingRecord(false);
    }
  }

  if (loading) return <Loading />;

  const q = search.trim().toLowerCase();
  let filtered = q ? schedules.filter((s) => [s.title, s.device_code, s.site_name].some((v) => (v || "").toLowerCase().includes(q))) : schedules;
  if (mineOnly && meId) filtered = filtered.filter((s) => s.assigned_to === meId);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={colors.textLight} />
        <TextInput style={styles.search} placeholder="Search maintenance…" placeholderTextColor={colors.textLight} value={search} onChangeText={setSearch} autoCapitalize="none" />
      </View>
      <View style={styles.scopeRow}>
        <Chip label="All" active={!mineOnly} onPress={() => setMineOnly(false)} />
        <Chip label="Mine" active={mineOnly} onPress={() => setMineOnly(true)} />
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

      {/* Schedule detail */}
      <Modal visible={!!selected && !completing} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
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
              <View style={styles.actions}>
                {selected?.status !== "in_process" && selected?.status !== "completed" ? (
                  <Button title={busy ? "Starting…" : "Start work"} icon="play" small loading={busy} onPress={startWork} />
                ) : null}
                {selected?.status !== "completed" ? (
                  <Button title="Complete cycle" icon="checkmark-done" small variant="success" onPress={openComplete} />
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Complete-cycle form */}
      <Modal visible={completing} animationType="slide" transparent onRequestClose={() => setCompleting(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Complete · {selected?.title}</Text>
              <Pressable onPress={() => setCompleting(false)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView>
              <Text style={styles.insLabel}>Outcome</Text>
              <View style={styles.chipRow}>
                {RECORD_STATUSES.map((s) => (
                  <Chip key={s} label={cap(s)} active={recStatus === s} onPress={() => setRecStatus(s)} />
                ))}
              </View>
              {components.length ? (
                <>
                  <Text style={styles.insLabel}>Components serviced</Text>
                  <View style={styles.chipRow}>
                    {components.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        active={usedIds.has(c.id)}
                        onPress={() =>
                          setUsedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={styles.insLabel}>Notes</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} multiline value={recNotes} onChangeText={setRecNotes} placeholder="What was done?" placeholderTextColor={colors.textLight} />
              <Text style={styles.insLabel}>Cost</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={recCost} onChangeText={setRecCost} placeholder="0.00" placeholderTextColor={colors.textLight} />
              <Text style={styles.insLabel}>Billing</Text>
              <View style={styles.chipRow}>
                <Chip label="Auto (from warranty)" active={billable === null} onPress={() => setBillable(null)} />
                <Chip label="Billable to client" active={billable === true} onPress={() => setBillable(true)} />
                <Chip label="Company bears cost" active={billable === false} onPress={() => setBillable(false)} />
              </View>
              <Button
                title={recPhoto ? "Photo attached ✓" : "Attach photo"}
                icon="camera"
                small
                style={{ marginTop: spacing.md }}
                onPress={pickRecordPhoto}
              />
              <Button
                title={savingRecord ? "Saving…" : "Save record"}
                icon="checkmark"
                loading={savingRecord}
                style={{ marginTop: spacing.md, marginBottom: spacing.lg }}
                onPress={submitRecord}
              />
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
  scopeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  sub: { flex: 1, fontSize: font.sm, color: colors.textLight },
  due: { fontSize: font.xs, color: colors.text, fontWeight: "600" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md, gap: spacing.sm },
  sheetTitle: { flex: 1, fontSize: font.h3, fontWeight: "800", color: colors.text },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  k: { fontSize: font.sm, color: colors.textMuted },
  v: { flex: 1, fontSize: font.sm, color: colors.text, fontWeight: "600", textAlign: "right" },
  insLabel: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  ins: { fontSize: font.sm, color: colors.text, lineHeight: 20 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontSize: font.body, color: colors.text },
});
