import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlowStep, Note, PresenceCard, Section, Wash } from "@/components/field";
import { ScanSheet } from "@/components/scan-sheet";
import { Text } from "@/components/text";
import { Button, Card, Pill, Row } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Presence, checkIn, checkOut, getPresence, onSite } from "@/lib/attendance";
import { mediaUrl } from "@/lib/format";
import { asUpload, pickFromLibrary, takePhoto } from "@/lib/photos";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

/**
 * One asset going into one site, worked end to end from the phone: check in,
 * define and work the steps, mark it live with a photo, upload the signed
 * handover, check out. Every button is the assigned installer's, and only
 * while they are clocked in at this site.
 */
interface Step {
  id: string; step_type: string; step_type_display: string; custom_label: string | null;
  step_number: number; status: string; status_display: string;
  started_at: string | null; completed_at: string | null;
}
interface Photo { id: string; photo_type: string; image: string; caption: string }
interface Handover { id: string; handover_date: string; accepted_by_name: string; acceptance_notes: string; client_name: string; signed_document?: string | null }
interface Installation {
  id: string; device: string; device_code: string; device_name: string; device_status?: string;
  site: string; site_name: string; position_label: string; progress: number;
  due_date: string | null; completed_at: string | null; installed_by: string | null; installed_by_name?: string | null;
  client_names?: string[]; handover: Handover | null; steps: Step[]; photos: Photo[];
  asset_verified_at: string | null;
}

const STEP_TYPES = [
  ["survey", "Survey"], ["wiring", "Wiring"], ["structure", "Metal structure"], ["programming", "Programming"],
  ["testing", "Testing and commissioning"], ["other", "Other"],
] as const;
const STEP_TONE: Record<string, { fg: string; bg: string }> = {
  not_started: { fg: colors.textMuted, bg: colors.secondary },
  in_progress: { fg: "#b45309", bg: colors.warningSoft },
  on_hold: { fg: "#6d28d9", bg: colors.violetSoft },
  completed: { fg: "#047857", bg: colors.successSoft },
  skipped: { fg: colors.textLight, bg: colors.secondary },
};

export default function InstallationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inst, setInst] = useState<Installation | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [stepForm, setStepForm] = useState<{ type: string; label: string } | null>(null);
  const [handoverForm, setHandoverForm] = useState<{ name: string; notes: string; doc: ReturnType<typeof asUpload> | null; docName: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, p] = await Promise.allSettled([api.get(`/sites/installations/${id}/`), getPresence()]);
      if (i.status === "fulfilled") setInst(i.value.data);
      if (p.status === "fulfilled") setPresence(p.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    getCurrentUser().then((u) => setMe({ id: u.id })).catch(() => {});
  }, [load]);

  const fail = (err: unknown, fallback: string) => {
    const d = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
    const first = d && (typeof d.detail === "string" ? d.detail : Object.values(d).flat().find((v) => typeof v === "string"));
    toast.error(typeof first === "string" ? first : fallback);
  };

  async function run(key: string, fn: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      fail(err, fallback);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !inst) {
    return <Wash><SafeAreaView style={{ flex: 1 }}><Text style={styles.muted}>{loading ? "Loading…" : "Installation not found."}</Text></SafeAreaView></Wash>;
  }

  const mine = !!me && me.id === inst.installed_by;
  const here = onSite(presence, inst.site);
  // The phone has read the label on this asset: the checklist is being
  // worked on the right one.
  const verified = !!inst.asset_verified_at;
  const canAct = mine && here && verified && !inst.completed_at;
  const workSteps = inst.steps.filter((s) => s.step_type !== "handover");
  const allDone = workSteps.length > 0 && workSteps.every((s) => s.status === "completed" || s.status === "skipped");
  const active = inst.device_status === "active" || inst.photos.some((p) => p.photo_type === "post_install") && allDone && !!inst.handover;
  const isLive = inst.device_status ? inst.device_status === "active" || inst.device_status === "client_property" : active;
  const stage: 1 | 2 | 3 | 4 | 5 | 6 = !here && !inst.completed_at ? 1 : !verified && !inst.completed_at ? 2 : !allDone ? 3 : !isLive ? 4 : !inst.handover ? 5 : 6;

  // -- the actions
  const setStep = (s: Step, status: string) => run(s.id, async () => { await api.patch(`/sites/installation-steps/${s.id}/`, { status }); }, "Could not update the step");
  const removeStep = (s: Step) => Alert.alert("Remove step?", s.custom_label || s.step_type_display, [
    { text: "Keep", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => run(s.id, async () => { await api.delete(`/sites/installation-steps/${s.id}/`); }, "Could not remove the step") },
  ]);
  const addStep = () => {
    if (!stepForm) return;
    const body = { installation: inst.id, step_type: stepForm.type, custom_label: stepForm.type === "other" ? stepForm.label.trim() : stepForm.label.trim() || null, step_number: workSteps.length + 1 };
    if (stepForm.type === "other" && !body.custom_label) { toast.error("Name the step"); return; }
    setStepForm(null);
    run("add", async () => { await api.post("/sites/installation-steps/", body); }, "Could not add the step");
  };
  const addPhoto = (kind: "pre_install" | "post_install") => run(kind, async () => {
    const a = await takePhoto();
    if (!a) return;
    const fd = new FormData();
    fd.append("installation", inst.id);
    fd.append("photo_type", kind);
    fd.append("image", asUpload(a, "install.jpg"));
    await api.post("/sites/installation-photos/", fd, { headers: { "Content-Type": "multipart/form-data" } });
  }, "Photo upload failed");
  const verify = (code: string) => {
    setScan(false);
    run("verify", async () => {
      await api.post(`/sites/installations/${inst.id}/verify-asset/`, { code });
      toast.success(`${inst.device_code} confirmed`);
    }, "That label is not this installation's asset");
  };
  const activate = () => run("activate", async () => {
    const a = await takePhoto();
    if (!a) return;
    const fd = new FormData();
    fd.append("photos", asUpload(a, "live.jpg"));
    await api.post(`/sites/installations/${inst.id}/activate/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    toast.success("Asset is live");
  }, "Could not mark the asset active");
  const submitHandover = () => {
    if (!handoverForm) return;
    if (!handoverForm.name.trim()) { toast.error("Who accepted the handover?"); return; }
    if (!handoverForm.doc) { toast.error("Attach the signed handover document"); return; }
    const f = handoverForm;
    setHandoverForm(null);
    run("handover", async () => {
      const fd = new FormData();
      fd.append("accepted_by_name", f.name.trim());
      if (f.notes.trim()) fd.append("acceptance_notes", f.notes.trim());
      fd.append("signed_document", f.doc as Blob);
      await api.post(`/sites/installations/${inst.id}/handover/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Handover recorded");
    }, "Handover failed");
  };
  const clockIn = () => run("presence", async () => { setPresence(await checkIn(inst.site)); }, "Could not check in");
  const clockOut = () => run("presence", async () => { setPresence(await checkOut(inst.site)); toast.success("Checked out"); }, "Could not check out");

  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{inst.device_code}</Text>
              <Text style={styles.sub}>{inst.device_name}</Text>
            </View>
            {inst.completed_at ? <Pill label="Handed over" fg="#047857" bg={colors.successSoft} /> : <Pill label={`${inst.progress}%`} fg={colors.primary} bg={colors.primarySoft} />}
          </View>
          <Card style={{ marginTop: spacing.md, gap: 0 }}>
            <Row label="Site" value={inst.site_name + (inst.position_label ? ` · ${inst.position_label}` : "")} />
            <Row label="Client" value={inst.client_names?.join(", ") || "—"} />
            <Row label="Installer" value={inst.installed_by_name || "Not assigned"} />
            <Row label="Due" value={inst.due_date || "—"} />
          </Card>

          <PresenceCard presence={presence} site={inst.site} siteName={inst.site_name} mine={mine} busy={busy === "presence"} onCheckIn={clockIn} onCheckOut={clockOut} />
          <ScanSheet open={scan} expect={inst.device_code} onScan={verify} onClose={() => setScan(false)} />

          {/* 1 Check in */}
          <Section title="The job, step by step">
            <FlowStep n={1} title="Check in at the site" state={here || inst.completed_at ? "done" : "now"} />

            {/* 2 Scan the asset */}
            <FlowStep n={2} title="Scan the asset's label" state={verified || inst.completed_at ? "done" : stage === 2 ? "now" : "later"}>
              {stage === 2 && mine && here ? (
                <>
                  <Text style={styles.hint}>Point the camera at the QR label on {inst.device_code}. The steps open once it matches.</Text>
                  <Button title="Scan asset QR" icon="qr-code-outline" loading={busy === "verify"} onPress={() => setScan(true)} />
                </>
              ) : null}
              {verified ? <Text style={styles.hint}>{inst.device_code} confirmed on site.</Text> : null}
            </FlowStep>

            {/* 3 Steps */}
            <FlowStep n={3} title="Installation steps" state={allDone ? "done" : stage === 3 ? "now" : "later"}>
              {workSteps.map((s, idx) => {
                const tone = STEP_TONE[s.status] ?? STEP_TONE.not_started;
                return (
                  <View key={s.id} style={styles.step}>
                    <View style={styles.stepTop}>
                      {/* Numbered by position, as the desktop numbers them. */}
                      <Text style={styles.stepName}>{idx + 1}. {s.custom_label || s.step_type_display}</Text>
                      <Pill label={busy === s.id ? "…" : s.status_display} fg={tone.fg} bg={tone.bg} />
                    </View>
                    {canAct ? (
                      <View style={styles.stepBtns}>
                        {s.status === "not_started" && <Button title="Start" small icon="play" onPress={() => setStep(s, "in_progress")} />}
                        {s.status === "in_progress" && <Button title="Complete" small variant="success" icon="checkmark" onPress={() => setStep(s, "completed")} />}
                        {s.status === "in_progress" && <Button title="Hold" small variant="secondary" icon="pause" onPress={() => setStep(s, "on_hold")} />}
                        {s.status === "on_hold" && <Button title="Resume" small icon="play" onPress={() => setStep(s, "in_progress")} />}
                        {s.status === "not_started" && <Button title="Skip" small variant="ghost" onPress={() => setStep(s, "skipped")} />}
                        {s.status === "not_started" && <Pressable onPress={() => removeStep(s)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.textLight} /></Pressable>}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {canAct && !allDone ? <Button title="Add a step" small variant="secondary" icon="add" onPress={() => setStepForm({ type: "other", label: "" })} /> : null}
              {!canAct && mine && !here && !inst.completed_at ? <Note tone="warn">Check in at {inst.site_name} to work the steps.</Note> : null}
              {!canAct && mine && here && !verified && !inst.completed_at ? <Note tone="warn">Scan the label on {inst.device_code} to open the steps.</Note> : null}
            </FlowStep>

            {/* 4 Mark active */}
            <FlowStep n={4} title="Mark the asset active" state={isLive ? "done" : stage === 4 ? "now" : "later"}>
              {stage === 4 && canAct ? (
                <>
                  <Text style={styles.hint}>Take a photo of the asset running. That photo is the record that it is live.</Text>
                  <Button title="Photo and mark active" icon="camera" loading={busy === "activate"} onPress={activate} />
                </>
              ) : null}
            </FlowStep>

            {/* 5 Handover */}
            <FlowStep n={5} title="Upload the signed handover" state={inst.handover ? "done" : stage === 5 ? "now" : "later"}>
              {inst.handover ? (
                <View style={{ gap: 2 }}>
                  <Text style={styles.hint}>Accepted by {inst.handover.accepted_by_name} on {inst.handover.handover_date}</Text>
                  {inst.handover.acceptance_notes ? <Text style={styles.hint}>{inst.handover.acceptance_notes}</Text> : null}
                </View>
              ) : stage === 5 && canAct ? (
                <>
                  <Text style={styles.hint}>Have the client sign the handover sheet, then photograph or pick the signed copy.</Text>
                  <Button title="Record handover" icon="document-text-outline" onPress={() => setHandoverForm({ name: "", notes: "", doc: null, docName: "" })} />
                </>
              ) : null}
            </FlowStep>

            {/* 6 Check out */}
            <FlowStep n={6} title="Check out" state={stage === 6 && !here ? "done" : stage === 6 ? "now" : "later"}>
              {stage === 6 && here ? <Button title="Check out of the site" icon="log-out-outline" variant="secondary" loading={busy === "presence"} onPress={clockOut} /> : null}
            </FlowStep>
          </Section>

          {/* Photos */}
          <Section
            title="Photos"
            hint="Before you start and after you finish."
            action={canAct ? (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Button title="Before" small variant="secondary" icon="camera-outline" loading={busy === "pre_install"} onPress={() => addPhoto("pre_install")} />
                <Button title="After" small variant="secondary" icon="camera-outline" loading={busy === "post_install"} onPress={() => addPhoto("post_install")} />
              </View>
            ) : undefined}
          >
            {inst.photos.length === 0 ? <Text style={styles.muted}>No photos yet.</Text> : (
              <View style={styles.photoGrid}>
                {inst.photos.map((p) => (
                  <View key={p.id}>
                    <Image source={{ uri: mediaUrl(p.image) }} style={styles.photo} />
                    <Text style={styles.photoTag}>{p.photo_type.replace("_install", "").replace("_", " ")}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>
        </ScrollView>

        {/* Add step */}
        <Modal visible={!!stepForm} transparent animationType="slide" onRequestClose={() => setStepForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add a step</Text>
              <View style={styles.typeWrap}>
                {STEP_TYPES.map(([v, l]) => (
                  <Pressable key={v} onPress={() => setStepForm((f) => f && { ...f, type: v })} style={[styles.typeChip, stepForm?.type === v && styles.typeChipOn]}>
                    <Text style={[styles.typeText, stepForm?.type === v && { color: "#fff" }]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder={stepForm?.type === "other" ? "Name the step *" : "Label (optional)"}
                placeholderTextColor={colors.textLight}
                value={stepForm?.label ?? ""}
                onChangeText={(t) => setStepForm((f) => f && { ...f, label: t })}
              />
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setStepForm(null)} />
                <Button title="Add step" small onPress={addStep} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Handover */}
        <Modal visible={!!handoverForm} transparent animationType="slide" onRequestClose={() => setHandoverForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Record the handover</Text>
              <Text style={styles.hint}>The client's signature is the handover: the record cannot be made without the signed sheet.</Text>
              <TextInput style={styles.input} placeholder="Accepted by (client's name) *" placeholderTextColor={colors.textLight} value={handoverForm?.name ?? ""} onChangeText={(t) => setHandoverForm((f) => f && { ...f, name: t })} />
              <TextInput style={[styles.input, { height: 76, textAlignVertical: "top" }]} multiline placeholder="Notes" placeholderTextColor={colors.textLight} value={handoverForm?.notes ?? ""} onChangeText={(t) => setHandoverForm((f) => f && { ...f, notes: t })} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Photograph signed sheet" small variant="secondary" icon="camera-outline" style={{ flex: 1 }} onPress={async () => { const a = await takePhoto(); if (a) setHandoverForm((f) => f && { ...f, doc: asUpload(a, "handover.jpg"), docName: "photo taken" }); }} />
                <Button title="Pick a file" small variant="secondary" icon="folder-open-outline" style={{ flex: 1 }} onPress={async () => { const a = await pickFromLibrary(); if (a) setHandoverForm((f) => f && { ...f, doc: asUpload(a, "handover.jpg"), docName: a.fileName ?? "file chosen" }); }} />
              </View>
              {handoverForm?.docName ? <Text style={[styles.hint, { color: "#047857" }]}>Attached: {handoverForm.docName}</Text> : null}
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setHandoverForm(null)} />
                <Button title="Record handover" small onPress={submitHandover} />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Wash>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  code: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  muted: { fontSize: font.sm, color: colors.textMuted, padding: spacing.sm },
  hint: { fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },
  step: { gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stepTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stepName: { flex: 1, fontSize: font.sm, fontWeight: "700", color: colors.text },
  stepBtns: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.border },
  photoTag: { fontSize: font.xs, color: colors.textMuted, textAlign: "center", marginTop: 2, textTransform: "capitalize" },
  modalWrap: { flex: 1, backgroundColor: "rgba(22,49,68,0.55)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  typeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.secondary },
  typeChipOn: { backgroundColor: colors.primary },
  typeText: { fontSize: font.xs, fontWeight: "700", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text, backgroundColor: colors.bg, fontFamily: "Urbanist_500Medium" },
});
