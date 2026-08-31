import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Card, Chip, Loading, Pill, Row } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

interface Step {
  id: string;
  step_type: string;
  step_type_display: string;
  step_number: number;
  status: string;
  status_display: string;
  started_at: string | null;
  completed_at: string | null;
}
interface Photo { id: string; photo_type: string; image: string; caption: string }
interface Handover {
  id: string;
  handover_date: string;
  accepted_by_name: string;
  acceptance_notes: string;
  signature: string | null;
  client_name: string;
  performed_by_name: string | null;
}
interface Installation {
  id: string;
  device_code: string;
  device_name: string;
  site_name: string;
  position_label: string;
  progress: number;
  installed_at: string;
  due_date: string | null;
  completed_at: string | null;
  installed_by: string | null;
  escalated?: boolean;
  escalation_state?: Record<string, string>;
  handover: Handover | null;
  steps: Step[];
  photos: Photo[];
}

const STATUS_TONE: Record<string, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_started: { fg: colors.textMuted, bg: colors.border, icon: "ellipse-outline" },
  in_progress: { fg: "#b45309", bg: "#fef3c7", icon: "time" },
  on_hold: { fg: "#9333ea", bg: "#f3e8ff", icon: "pause-circle" },
  completed: { fg: "#047857", bg: colors.successSoft, icon: "checkmark-circle" },
  skipped: { fg: colors.textLight, bg: colors.border, icon: "remove-circle-outline" },
};

const PHOTO_TYPES = [
  { value: "pre_install", label: "Pre" },
  { value: "post_install", label: "Post" },
  { value: "verification", label: "Verify" },
  { value: "handover", label: "Handover" },
] as const;

const HANDOVER_ROLES = ["super_admin", "group_head", "ops_manager", "supervisor"];

export default function InstallationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inst, setInst] = useState<Installation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState<string>("post_install");
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);

  // Handover form state
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [acceptedBy, setAcceptedBy] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [handoverSaving, setHandoverSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/sites/installations/${id}/`);
      setInst(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    getCurrentUser().then((u) => setMe({ id: u.id, role: u.role })).catch(() => {});
  }, [load]);

  async function setStepStatus(step: Step, status: string) {
    if (busy) return;
    setBusy(step.id);
    try {
      await api.patch(`/sites/installation-steps/${step.id}/`, { status });
      await load();
    } catch {
      toast.error("Could not update step");
    } finally {
      setBusy(null);
    }
  }

  function stepActions(step: Step) {
    // Forward-only by default; reopening or holding is an explicit choice.
    const options: { text: string; onPress: () => void; style?: "cancel" | "destructive" }[] = [];
    if (step.status === "not_started") {
      options.push({ text: "Start", onPress: () => setStepStatus(step, "in_progress") });
    }
    if (step.status === "in_progress" || step.status === "on_hold") {
      options.push({ text: "Mark completed", onPress: () => setStepStatus(step, "completed") });
    }
    if (step.status === "in_progress") {
      options.push({ text: "Put on hold (client)", onPress: () => setStepStatus(step, "on_hold") });
    }
    if (step.status === "on_hold") {
      options.push({ text: "Resume", onPress: () => setStepStatus(step, "in_progress") });
    }
    if (step.status === "completed") {
      options.push({
        text: "Reopen step",
        style: "destructive",
        onPress: () =>
          Alert.alert("Reopen step?", "This clears the completion and reopens the installation.", [
            { text: "Cancel", style: "cancel" },
            { text: "Reopen", style: "destructive", onPress: () => setStepStatus(step, "in_progress") },
          ]),
      });
    }
    if (!options.length) return;
    Alert.alert(step.step_type_display, "Update this step", [
      ...options,
      { text: "Cancel", style: "cancel", onPress: () => {} },
    ]);
  }

  async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const result = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0];
  }

  async function addPhoto() {
    try {
      const asset = await pickImage();
      if (!asset) return;
      setUploading(true);
      const fd = new FormData();
      fd.append("installation", String(id));
      fd.append("photo_type", photoType);
      fd.append("image", { uri: asset.uri, name: "install.jpg", type: "image/jpeg" } as never);
      await api.post("/sites/installation-photos/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Photo added");
      await load();
    } catch {
      toast.error("Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function pickSignature() {
    const asset = await pickImage();
    if (asset) setSignature(asset.uri);
  }

  async function submitHandover() {
    if (handoverSaving) return;
    if (!acceptedBy.trim()) {
      toast.error("Enter who accepted the handover");
      return;
    }
    setHandoverSaving(true);
    try {
      const fd = new FormData();
      fd.append("accepted_by_name", acceptedBy.trim());
      if (handoverNotes.trim()) fd.append("acceptance_notes", handoverNotes.trim());
      if (signature) {
        fd.append("signature", { uri: signature, name: "signature.jpg", type: "image/jpeg" } as never);
      }
      const { data } = await api.post(`/sites/installations/${id}/handover/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setInst(data);
      setHandoverOpen(false);
      toast.success("Handover recorded — asset is now Active");
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: Record<string, unknown> } }).response;
      const detail =
        (typeof resp?.data?.detail === "string" && resp.data.detail) ||
        (Array.isArray(resp?.data?.client) && String(resp.data.client[0])) ||
        (typeof resp?.data?.client === "string" && resp.data.client) ||
        "Handover failed";
      toast.error(detail);
    } finally {
      setHandoverSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!inst) return <SafeAreaView style={styles.safe}><Text style={styles.err}>Installation not found.</Text></SafeAreaView>;

  const done = inst.steps.filter((s) => s.status === "completed").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !inst.completed_at && !!inst.due_date && inst.due_date < today;
  const stage2 = Object.keys(inst.escalation_state ?? {}).some((k) => k.endsWith(":2"));
  const nonHandoverPending = inst.steps.some(
    (s) => s.step_type !== "handover" && s.status !== "completed" && s.status !== "skipped"
  );
  const canHandover =
    !inst.handover &&
    !nonHandoverPending &&
    !!me &&
    (HANDOVER_ROLES.includes(me.role) || me.id === inst.installed_by);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Header */}
        <View style={styles.headRow}>
          <Text style={styles.code}>{inst.device_code}</Text>
          {inst.handover ? <Pill label="Handed over" fg="#047857" bg={colors.successSoft} /> : null}
        </View>
        <Text style={styles.sub}>{inst.device_name}</Text>
        <View style={styles.siteLine}>
          <Ionicons name="location-outline" size={14} color={colors.textLight} />
          <Text style={styles.site}>{inst.site_name}{inst.position_label ? ` · ${inst.position_label}` : ""}</Text>
          {inst.due_date ? (
            <Text style={[styles.dueText, overdue && { color: "#b91c1c", fontWeight: "800" }]}>
              · Due {inst.due_date}
            </Text>
          ) : null}
        </View>

        {inst.escalated && !inst.completed_at ? (
          <View style={styles.escBanner}>
            <Ionicons name="warning" size={16} color="#b91c1c" />
            <Text style={styles.escText}>
              {stage2 ? "Escalated to Group Head (L2)" : "Escalated — past its due date"}
            </Text>
          </View>
        ) : null}

        {/* Progress */}
        <Card style={{ marginTop: spacing.lg, gap: 8 }}>
          <View style={styles.progHead}>
            <Text style={styles.progLabel}>Installation progress</Text>
            <Text style={styles.progPct}>{inst.progress}%</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${inst.progress}%` }]} /></View>
          <Text style={styles.progSub}>{done} of {inst.steps.length} steps completed</Text>
        </Card>

        {/* Handover record / action */}
        {inst.handover ? (
          <Card style={{ marginTop: spacing.lg, gap: 6 }}>
            <Text style={styles.progLabel}>Handover</Text>
            <Row label="Date" value={inst.handover.handover_date} />
            <Row label="Accepted by" value={inst.handover.accepted_by_name} />
            <Row label="Client" value={inst.handover.client_name} />
            {inst.handover.performed_by_name ? <Row label="Performed by" value={inst.handover.performed_by_name} /> : null}
            {inst.handover.acceptance_notes ? <Text style={styles.notes}>{inst.handover.acceptance_notes}</Text> : null}
            {inst.handover.signature ? (
              <Image source={{ uri: mediaUrl(inst.handover.signature) }} style={styles.signature} resizeMode="contain" />
            ) : null}
          </Card>
        ) : canHandover ? (
          <Button
            title="Handover to client"
            icon="ribbon-outline"
            style={{ marginTop: spacing.lg }}
            onPress={() => setHandoverOpen(true)}
          />
        ) : null}

        {/* Steps */}
        <Text style={styles.section}>Steps</Text>
        <Text style={styles.hint}>Tap a step to update it. Completed steps need a confirmed reopen.</Text>
        {inst.steps.map((s) => {
          const tone = STATUS_TONE[s.status] ?? STATUS_TONE.not_started;
          return (
            <Card key={s.id} style={{ marginBottom: spacing.sm }} onPress={() => stepActions(s)}>
              <View style={styles.stepRow}>
                <View style={[styles.stepNum, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.stepNumText, { color: tone.fg }]}>{s.step_number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepName}>{s.step_type_display}</Text>
                  <View style={styles.statusRow}>
                    <Ionicons name={tone.icon} size={14} color={tone.fg} />
                    <Text style={[styles.statusText, { color: tone.fg }]}>{busy === s.id ? "Updating…" : s.status_display}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </View>
            </Card>
          );
        })}

        {/* Photos */}
        <View style={styles.photoHead}>
          <Text style={styles.section}>Photos</Text>
          <Button title={uploading ? "Uploading…" : "Add photo"} icon="camera" small loading={uploading} onPress={addPhoto} />
        </View>
        <View style={styles.typeRow}>
          {PHOTO_TYPES.map((t) => (
            <Chip key={t.value} label={t.label} active={photoType === t.value} onPress={() => setPhotoType(t.value)} />
          ))}
        </View>
        {inst.photos.length === 0 ? (
          <Card><Text style={styles.empty}>No photos yet. Capture the install for the record.</Text></Card>
        ) : (
          <View style={styles.photoGrid}>
            {inst.photos.map((p) => (
              <Image key={p.id} source={{ uri: mediaUrl(p.image) }} style={styles.photo} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Handover form */}
      <Modal visible={handoverOpen} animationType="slide" transparent onRequestClose={() => setHandoverOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Handover to client</Text>
            <Text style={styles.modalSub}>
              Records acceptance, assigns the client and site, and sets the asset to Active.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Accepted by (name) *"
              placeholderTextColor={colors.textLight}
              value={acceptedBy}
              onChangeText={setAcceptedBy}
            />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              placeholder="Acceptance notes"
              placeholderTextColor={colors.textLight}
              value={handoverNotes}
              onChangeText={setHandoverNotes}
              multiline
            />
            <Button
              title={signature ? "Signature attached ✓" : "Attach signature photo"}
              icon="create-outline"
              small
              onPress={pickSignature}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" small onPress={() => setHandoverOpen(false)} variant="secondary" />
              <Button
                title={handoverSaving ? "Recording…" : "Record handover"}
                small
                loading={handoverSaving}
                onPress={submitHandover}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  err: { padding: spacing.lg, color: colors.textMuted },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  siteLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap" },
  site: { fontSize: font.sm, color: colors.textMuted },
  dueText: { fontSize: font.sm, color: colors.textMuted },
  escBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md,
    backgroundColor: "#fee2e2", borderRadius: radius.md, padding: spacing.md,
  },
  escText: { flex: 1, fontSize: font.sm, fontWeight: "700", color: "#b91c1c" },
  progHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progLabel: { fontSize: font.body, fontWeight: "700", color: colors.text },
  progPct: { fontSize: font.h3, fontWeight: "800", color: colors.primary },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999, backgroundColor: colors.primary },
  progSub: { fontSize: font.xs, color: colors.textMuted, fontWeight: "600" },
  notes: { fontSize: font.sm, color: colors.textMuted },
  signature: { width: "100%", height: 90, borderRadius: radius.md, backgroundColor: "#fff", marginTop: 4 },
  section: { fontSize: font.h3, fontWeight: "800", color: colors.text, marginTop: spacing.xl, marginBottom: 4 },
  hint: { fontSize: font.xs, color: colors.textLight, marginBottom: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepNum: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontSize: font.body, fontWeight: "800" },
  stepName: { fontSize: font.body, fontWeight: "700", color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusText: { fontSize: font.sm, fontWeight: "600" },
  photoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, flexWrap: "wrap" },
  empty: { fontSize: font.sm, color: colors.textMuted },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.border },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.md,
  },
  modalTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  modalSub: { fontSize: font.sm, color: colors.textMuted },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text,
    backgroundColor: colors.bg,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.sm },
});
