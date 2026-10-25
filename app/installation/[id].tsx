import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlowStep, Note, PresenceCard, Section, Wash } from "@/components/field";
import { OutboxBanner } from "@/components/outbox-banner";
import { ScanSheet } from "@/components/scan-sheet";
import { Text } from "@/components/text";
import { Button, Card, FieldLabel, Pill, Row, Select } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Presence, checkIn, checkOut, getPresence, onSite } from "@/lib/attendance";
import { mediaUrl } from "@/lib/format";
import { Op, QUEUED_NOTE, cached, isNetworkError, pendingFor, submit } from "@/lib/offline";
import { asFile, asUpload, pickFromLibrary, takePhoto } from "@/lib/photos";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

/**
 * One asset going into one site, worked end to end from the phone: check in,
 * define and work the steps, mark it live with a photo, upload the signed
 * handover, check out. Every button is the assigned installer's, and only
 * while they are clocked in at this site.
 */
interface Check { id: string; text: string; done: boolean; done_by_name?: string | null }
interface Evidence { id: string; image: string }
interface Step {
  id: string; step_type: string; step_type_display: string; custom_label: string | null;
  step_number: number; status: string; status_display: string;
  started_at: string | null; completed_at: string | null;
  /** Ticked while the step is under way; all of it, before it completes. */
  checks?: Check[];
  /** Photos of the finished work - at least one, before it completes. */
  evidence?: Evidence[];
}
interface Photo { id: string; photo_type: string; image: string; caption: string }
/** A delay or hold flagged on the job, as the web lists it under its step. */
interface Delay {
  id: string; step: string | null; cause: string; cause_display: string; description: string;
  reported_by_name?: string | null; created_at: string; resolved_at: string | null;
}
interface Handover { id: string; handover_date: string; accepted_by_name: string; acceptance_notes: string; client_name: string; signed_document?: string | null }
interface Installation {
  id: string; device: string; device_code: string; device_name: string; device_status?: string;
  site: string; site_name: string; position_label: string; progress: number;
  due_date: string | null; completed_at: string | null; installed_by: string | null; installed_by_name?: string | null;
  client_names?: string[]; handover: Handover | null; steps: Step[]; photos: Photo[];
  helpers?: string[]; helper_names?: string[];
  asset_verified_at: string | null; delays?: Delay[];
}

/** The web's "Caused by" list. */
const DELAY_CAUSES = [
  { id: "client", label: "Client" }, { id: "internal", label: "Internal" },
  { id: "vendor", label: "Vendor" }, { id: "other", label: "Other" },
];

const STEP_TYPES = [
  ["survey", "Survey"], ["wiring", "Wiring"], ["structure", "Metal Structure"], ["programming", "Programming"],
  ["testing", "Testing & Commissioning"], ["other", "Other"],
] as const;
const STEP_TONE: Record<string, { fg: string; bg: string }> = {
  not_started: { fg: colors.textMuted, bg: colors.secondary },
  in_progress: { fg: "#b45309", bg: colors.warningSoft },
  on_hold: { fg: "#6d28d9", bg: colors.violetSoft },
  completed: { fg: "#047857", bg: colors.successSoft },
  skipped: { fg: colors.textLight, bg: colors.secondary },
};

/** What this phone did on the installation without signal, shown as done. */
function overlay(inst: Installation, waiting: Op[]): Installation {
  const out: Installation = {
    ...inst, photos: [...inst.photos],
    steps: inst.steps.map((x) => ({ ...x, checks: (x.checks ?? []).map((c) => ({ ...c })), evidence: [...(x.evidence ?? [])] })),
  };
  for (const op of waiting) {
    const file = (field: string) => op.form?.files.find((f) => f.field === field)?.uri ?? "";
    if (op.kind === "verify") out.asset_verified_at = op.at;
    else if (op.kind === "step") {
      const st = out.steps.find((x) => x.id === op.meta?.step);
      if (!st) continue;
      st.status = String(op.meta?.status);
      st.status_display = String(op.meta?.status_display ?? st.status);
      if (st.status === "in_progress" && !st.started_at) st.started_at = op.at;
      if (st.status === "completed") st.completed_at = op.at;
    } else if (op.kind === "check") {
      const c = out.steps.find((x) => x.id === op.meta?.step)?.checks?.find((x) => x.id === op.meta?.check);
      if (c) c.done = !!op.meta?.done;
    } else if (op.kind === "evidence") {
      out.steps.find((x) => x.id === op.meta?.step)?.evidence?.push({ id: op.id, image: file("image") });
    } else if (op.kind === "activate") {
      out.device_status = "active";
      out.photos.push({ id: op.id, photo_type: "post_install", image: file("photos"), caption: "" });
    } else if (op.kind === "handover") {
      out.handover = {
        id: op.id, handover_date: op.at.slice(0, 10), accepted_by_name: String(op.meta?.accepted_by_name ?? ""),
        acceptance_notes: String(op.meta?.acceptance_notes ?? ""), client_name: "",
      };
    }
  }
  return out;
}

const STATUS_WORDS: Record<string, string> = {
  not_started: "Not Started", in_progress: "In Progress", on_hold: "On Hold", completed: "Completed", skipped: "Skipped",
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
  const [stale, setStale] = useState(false);
  const [stepForm, setStepForm] = useState<{ type: string; label: string } | null>(null);
  // The item being typed onto a step's checklist.
  const [checkDraft, setCheckDraft] = useState<{ step: string; text: string } | null>(null);
  // The web's Flag Delay form; Hold uses it too and then puts the step on hold.
  const [delayFor, setDelayFor] = useState<{ step: Step; label: string; hold: boolean; cause: string; note: string } | null>(null);
  const [handoverForm, setHandoverForm] = useState<{ name: string; notes: string; doc: ReturnType<typeof asUpload> | null; docName: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, p] = await Promise.allSettled([
        cached(`inst-${id}`, async () => (await api.get(`/sites/installations/${id}/`)).data as Installation),
        getPresence(),
      ]);
      if (i.status === "fulfilled") {
        setInst(overlay(i.value.data, await pendingFor(`inst:${id}`)));
        setStale(!i.value.fresh);
      }
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
    if (isNetworkError(err)) { toast.error("No signal. This one needs a connection - try again when you have one."); return; }
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
  // A helper: on the job to check in and out; the installer works the steps.
  const helping = !!me && !mine && (inst.helpers ?? []).includes(me.id);
  const here = onSite(presence, inst.site);
  // The phone has read the label on this asset: the checklist is being
  // worked on the right one.
  const verified = !!inst.asset_verified_at;
  // Finished: every step done, or handed over to the client (a job whose
  // steps were all skipped was never stamped complete before the handover).
  const finished = !!inst.completed_at || !!inst.handover;
  const canAct = mine && here && verified && !finished;
  const workSteps = inst.steps.filter((s) => s.step_type !== "handover");
  const allDone = workSteps.length > 0 && workSteps.every((s) => s.status === "completed" || s.status === "skipped");
  const active = inst.device_status === "active" || inst.photos.some((p) => p.photo_type === "post_install") && allDone && !!inst.handover;
  const isLive = inst.device_status ? inst.device_status === "active" || inst.device_status === "client_property" : active;
  const stage: 1 | 2 | 3 | 4 | 5 | 6 = !here && !finished ? 1 : !verified && !finished ? 2 : !allDone ? 3 : !isLive ? 4 : !inst.handover ? 5 : 6;

  // -- the actions
  const said = (queued: boolean, done: string) => toast.success(queued ? `${done}. ${QUEUED_NOTE}` : done);
  const setStep = (s: Step, status: string) => run(s.id, async () => {
    const r = await submit({
      kind: "step", scope: `inst:${id}`, label: `${s.custom_label || s.step_type_display}: ${STATUS_WORDS[status] ?? status}`,
      method: "patch", url: `/sites/installation-steps/${s.id}/`, json: { status },
      meta: { step: s.id, status, status_display: STATUS_WORDS[status] ?? status },
    });
    if (r.queued) toast.success(QUEUED_NOTE);
  }, "Failed to update step");
  // A tick and a photo of the work are kept on the phone without signal, like a step.
  const tick = (s: Step, c: Check) => run(s.id, async () => {
    await submit({
      kind: "check", scope: `inst:${id}`, label: `${s.custom_label || s.step_type_display}: ${c.done ? "untick" : "tick"} ${c.text}`,
      method: "patch", url: `/sites/installation-steps/${s.id}/checks/${c.id}/`, json: { done: !c.done },
      meta: { step: s.id, check: c.id, done: !c.done },
    });
  }, "Could not tick the item");
  const addCheck = () => {
    if (!checkDraft?.text.trim()) return;
    const d = checkDraft;
    setCheckDraft(null);
    run(d.step, async () => { await api.post(`/sites/installation-steps/${d.step}/checks/`, { text: d.text.trim() }); }, "Could not add the item");
  };
  const evidence = (s: Step) => run(s.id, async () => {
    const a = await takePhoto();
    if (!a) return;
    const r = await submit({
      kind: "evidence", scope: `inst:${id}`, label: `${s.custom_label || s.step_type_display}: evidence photo`,
      method: "post", url: "/sites/installation-photos/",
      form: { fields: { installation: inst.id, step: s.id, photo_type: "evidence" }, files: [asFile(a, "image", "evidence.jpg")] },
      meta: { step: s.id },
    });
    said(r.queued, "Evidence photo added");
  }, "Could not upload the photo");
  const submitDelay = () => {
    if (!delayFor) return;
    const f = delayFor;
    setDelayFor(null);
    run(f.step.id, async () => {
      const r = await submit({
        kind: "delay", scope: `inst:${id}`, label: `${f.hold ? "Hold" : "Flag Delay"}: ${f.label}`,
        method: "post", url: "/sites/installation-delays/",
        json: { installation: inst.id, step: f.step.id, cause: f.cause, description: f.note.trim() },
      });
      let queued = r.queued;
      if (f.hold) {
        const h = await submit({
          kind: "step", scope: `inst:${id}`, label: `${f.label}: On Hold`,
          method: "patch", url: `/sites/installation-steps/${f.step.id}/`, json: { status: "on_hold" },
          meta: { step: f.step.id, status: "on_hold", status_display: STATUS_WORDS.on_hold },
        });
        queued = queued || h.queued;
      }
      said(queued, f.hold ? "Step put on hold" : "Delay logged");
    }, "Failed to log delay");
  };
  const removeStep = (s: Step) => Alert.alert("Remove this step from the checklist?", s.custom_label || s.step_type_display, [
    { text: "Keep", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => run(s.id, async () => { await api.delete(`/sites/installation-steps/${s.id}/`); }, "Could not remove the step") },
  ]);
  const addStep = () => {
    if (!stepForm) return;
    const body = { installation: inst.id, step_type: stepForm.type, custom_label: stepForm.type === "other" ? stepForm.label.trim() : stepForm.label.trim() || null, step_number: workSteps.length + 1 };
    if (stepForm.type === "other" && !body.custom_label) { toast.error("Name the step"); return; }
    setStepForm(null);
    run("add", async () => { await api.post("/sites/installation-steps/", body); toast.success("Step added"); }, "Could not add the step");
  };
  const verify = (code: string) => {
    setScan(false);
    run("verify", async () => {
      const r = await submit({
        kind: "verify", scope: `inst:${id}`, label: `Scan ${inst.device_code}`,
        method: "post", url: `/sites/installations/${inst.id}/verify-asset/`, json: { code },
      }, {
        whenQueued: () => (code.trim().toUpperCase() === inst.device_code.toUpperCase()
          ? null : `That label reads ${code.trim()}, not ${inst.device_code}`),
      });
      said(r.queued, `${inst.device_code} confirmed`);
    }, "That label is not this installation's asset");
  };
  const activate = () => run("activate", async () => {
    const a = await takePhoto();
    if (!a) return;
    const r = await submit({
      kind: "activate", scope: `inst:${id}`, label: "Mark Active",
      method: "post", url: `/sites/installations/${inst.id}/activate/`,
      form: { fields: {}, files: [asFile(a, "photos", "live.jpg")] },
    });
    said(r.queued, "Asset marked Active — the photo is on the asset too");
  }, "Failed to activate the asset");
  const submitHandover = () => {
    if (!handoverForm) return;
    if (!handoverForm.name.trim()) { toast.error("Who accepted the handover?"); return; }
    if (!handoverForm.doc) { toast.error("Attach the signed handover document"); return; }
    const f = handoverForm;
    setHandoverForm(null);
    run("handover", async () => {
      const r = await submit({
        kind: "handover", scope: `inst:${id}`, label: "Record Handover",
        method: "post", url: `/sites/installations/${inst.id}/handover/`,
        form: {
          fields: { accepted_by_name: f.name.trim(), ...(f.notes.trim() ? { acceptance_notes: f.notes.trim() } : {}) },
          files: [{ ...(f.doc as unknown as { uri: string; name: string; type: string }), field: "signed_document" }],
        },
        meta: { accepted_by_name: f.name.trim(), acceptance_notes: f.notes.trim() },
      });
      said(r.queued, "Handover recorded");
    }, "Failed to record handover");
  };
  const clockIn = () => run("presence", async () => {
    const p = await checkIn(inst.site, "", inst.site_name);
    setPresence(p);
    said(!!p.queued, "Checked in");
  }, "Could not check in");
  const clockOut = () => run("presence", async () => {
    const p = await checkOut(inst.site);
    setPresence(p);
    said(!!p.queued, "Checked out");
  }, "Could not check out");

  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <OutboxBanner scope={`inst:${id}`} />
          {stale ? (
            <Note tone="warn">No signal. This is the installation as it was last loaded; what you do now is saved on this phone and uploads with its time when there is signal.</Note>
          ) : null}
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{inst.device_code}</Text>
              <Text style={styles.sub}>{inst.device_name}</Text>
            </View>
            {finished ? <Pill label="Completed" fg="#047857" bg={colors.successSoft} /> : <Pill label={`${inst.progress}%`} fg={colors.primary} bg={colors.primarySoft} />}
          </View>
          <Card style={{ marginTop: spacing.md, gap: 0 }}>
            <Row label="Site" value={inst.site_name + (inst.position_label ? ` · ${inst.position_label}` : "")} />
            <Row label="Client" value={inst.client_names?.join(", ") || "—"} />
            <Row label="Installer" value={inst.installed_by_name || "Not assigned"} />
            {(inst.helper_names ?? []).length ? <Row label="Helpers" value={inst.helper_names!.join(", ")} /> : null}
            <Row label="Due Date" value={inst.due_date || "—"} />
          </Card>

          {/* A finished job asks nobody to check in; whoever is still on site can check out. */}
          {!finished || here ? (
            <PresenceCard presence={presence} site={inst.site} siteName={inst.site_name} mine={mine || helping} busy={busy === "presence"} onCheckIn={clockIn} onCheckOut={clockOut} />
          ) : null}
          <ScanSheet open={scan} expect={inst.device_code} onScan={verify} onClose={() => setScan(false)} />

          {/* 1 Check in */}
          {helping ? (
            <Note>You are helping {inst.installed_by_name || "the installer"} on this installation. Check in when you reach {inst.site_name} and check out when you leave; {inst.installed_by_name || "the installer"} records the steps.</Note>
          ) : (<>
          <Section title="The job, step by step">
            <FlowStep n={1} title="Check in at the site" state={here || finished ? "done" : "now"} />

            {/* 2 Scan the asset */}
            <FlowStep n={2} title="Scan the asset's label" state={verified || finished ? "done" : stage === 2 ? "now" : "later"}>
              {stage === 2 && mine && here ? (
                <>
                  <Text style={styles.hint}>Point the camera at the QR label on {inst.device_code}. The steps open once it matches.</Text>
                  <Button title="Scan asset QR" icon="qr-code-outline" loading={busy === "verify"} onPress={() => setScan(true)} />
                </>
              ) : null}
              {verified ? <Text style={styles.hint}>{inst.device_code} confirmed on site.</Text> : null}
            </FlowStep>

            {/* 3 Steps */}
            <FlowStep n={3} title="Installation Steps" state={allDone ? "done" : stage === 3 ? "now" : "later"}>
              {workSteps.map((s, idx) => {
                const tone = STEP_TONE[s.status] ?? STEP_TONE.not_started;
                return (
                  <View key={s.id} style={styles.step}>
                    <View style={styles.stepTop}>
                      {/* Numbered by position, as the desktop numbers them. */}
                      <Text style={styles.stepName}>{idx + 1}. {s.custom_label || s.step_type_display}</Text>
                      <Pill label={busy === s.id ? "…" : s.status_display} fg={tone.fg} bg={tone.bg} />
                    </View>
                    {(inst.delays ?? []).filter((d) => d.step === s.id).map((d) => (
                      <View key={d.id} style={styles.delay}>
                        <Text style={styles.delayHead}>
                          {s.status === "on_hold" && !d.resolved_at ? "On hold" : "Delay"} — caused by {d.cause_display}
                        </Text>
                        {d.description ? <Text style={styles.hint}>{d.description}</Text> : null}
                        <Text style={styles.delayMeta}>
                          {d.reported_by_name ? `By ${d.reported_by_name} · ` : ""}{d.created_at.slice(0, 10)}{d.resolved_at ? ` · resolved ${d.resolved_at.slice(0, 10)}` : ""}
                        </Text>
                      </View>
                    ))}
                    {(s.checks ?? []).length > 0 || (canAct && s.status !== "completed") ? (
                      <View style={{ gap: 4 }}>
                        <Text style={styles.label}>Checklist{(s.checks ?? []).length ? ` · ${(s.checks ?? []).filter((c) => c.done).length}/${(s.checks ?? []).length}` : ""}</Text>
                        {(s.checks ?? []).map((c) => (
                          <Pressable key={c.id} disabled={!canAct || s.status !== "in_progress"} onPress={() => tick(s, c)} style={styles.check} hitSlop={4}>
                            <Ionicons name={c.done ? "checkbox" : "square-outline"} size={20} color={c.done ? colors.success : canAct && s.status === "in_progress" ? colors.primary : colors.textLight} />
                            <Text style={[styles.checkText, c.done && styles.checkDone]}>{c.text}</Text>
                          </Pressable>
                        ))}
                        {canAct && s.status !== "completed" ? (
                          checkDraft?.step === s.id ? (
                            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                              <TextInput style={[styles.input, { flex: 1, paddingVertical: 6 }]} autoFocus placeholder="What has to be checked" placeholderTextColor={colors.textLight}
                                value={checkDraft.text} onChangeText={(t) => setCheckDraft({ step: s.id, text: t })} onSubmitEditing={addCheck} />
                              <Button title="Add" small onPress={addCheck} />
                            </View>
                          ) : (
                            <Pressable onPress={() => setCheckDraft({ step: s.id, text: "" })} hitSlop={6}><Text style={styles.link}>+ Add a check</Text></Pressable>
                          )
                        ) : null}
                      </View>
                    ) : null}
                    {(s.evidence ?? []).length > 0 || (canAct && s.status === "in_progress") ? (
                      <View style={{ gap: 4 }}>
                        <Text style={styles.label}>Evidence</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          {(s.evidence ?? []).map((p) => <Image key={p.id} source={{ uri: p.image.startsWith("file:") ? p.image : mediaUrl(p.image) }} style={styles.evidence} />)}
                          {canAct && s.status === "in_progress" ? (
                            <Pressable onPress={() => evidence(s)} style={styles.evidenceAdd}>
                              <Ionicons name="camera-outline" size={20} color={colors.primary} />
                              <Text style={styles.evidenceAddText}>Add</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    {canAct ? (() => {
                      // The step before is done before this one starts; this one is done with
                      // its checklist ticked and a photo of the work.
                      const ready = workSteps.slice(0, idx).every((p) => p.status === "completed" || p.status === "skipped");
                      const openChecks = (s.checks ?? []).filter((c) => !c.done).length;
                      const noPhoto = (s.evidence ?? []).length === 0;
                      return (
                      <View style={{ gap: 6 }}>
                      {s.status === "in_progress" && (openChecks > 0 || noPhoto) ? (
                        <Text style={styles.hint}>
                          To complete: {[openChecks > 0 ? `tick ${openChecks} more on the checklist` : "", noPhoto ? "add a photo of the work" : ""].filter(Boolean).join(" and ")}.
                        </Text>
                      ) : null}
                      <View style={styles.stepBtns}>
                        {s.status !== "in_progress" && s.status !== "completed" && (ready
                          ? <Button title="Start" small icon="play" onPress={() => setStep(s, "in_progress")} />
                          : <Text style={styles.hint}>Starts after step {idx}</Text>)}
                        {s.status !== "completed" && <Button title="Complete" small variant="success" icon="checkmark" disabled={s.status !== "in_progress" || openChecks > 0 || noPhoto} onPress={() => setStep(s, "completed")} />}
                        {s.status !== "on_hold" && s.status !== "completed" && (
                          <Button title="Hold" small variant="secondary" icon="pause"
                            onPress={() => setDelayFor({ step: s, label: `${idx + 1}. ${s.custom_label || s.step_type_display}`, hold: true, cause: "client", note: "" })} />
                        )}
                        {s.status !== "not_started" && <Button title="Reset" small variant="ghost" icon="refresh" onPress={() => setStep(s, "not_started")} />}
                        <Button title="Flag Delay" small variant="ghost" icon="warning-outline"
                          onPress={() => setDelayFor({ step: s, label: `${idx + 1}. ${s.custom_label || s.step_type_display}`, hold: false, cause: "client", note: "" })} />
                        {s.status === "not_started" && <Pressable onPress={() => removeStep(s)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.textLight} /></Pressable>}
                      </View>
                      </View>
                      );
                    })() : null}
                  </View>
                );
              })}
              {canAct && !allDone ? <Button title="Add Step" small variant="secondary" icon="add" onPress={() => setStepForm({ type: "other", label: "" })} /> : null}
              {!canAct && mine && !here && !finished ? <Note tone="warn">Check in at {inst.site_name} to work the steps.</Note> : null}
              {!canAct && mine && here && !verified && !finished ? <Note tone="warn">Scan the label on {inst.device_code} to open the steps.</Note> : null}
            </FlowStep>

            {/* 4 Mark active */}
            <FlowStep n={4} title="Active" state={isLive ? "done" : stage === 4 ? "now" : "later"}>
              {stage === 4 && canAct ? (
                <>
                  <Text style={styles.hint}>Mark the asset live, with a photo of it running.</Text>
                  <Button title="Mark Active" icon="camera" loading={busy === "activate"} onPress={activate} />
                </>
              ) : null}
            </FlowStep>

            {/* 5 Handover */}
            <FlowStep n={5} title="Handover" state={inst.handover ? "done" : stage === 5 ? "now" : "later"}>
              {inst.handover ? (
                <View style={{ gap: 2 }}>
                  <Text style={styles.hint}>Accepted by {inst.handover.accepted_by_name} on {inst.handover.handover_date}</Text>
                  {inst.handover.acceptance_notes ? <Text style={styles.hint}>{inst.handover.acceptance_notes}</Text> : null}
                </View>
              ) : stage === 5 && canAct ? (
                <>
                  <Text style={styles.hint}>Upload the signed handover document.</Text>
                  <Button title="Record Handover" icon="document-text-outline" onPress={() => setHandoverForm({ name: "", notes: "", doc: null, docName: "" })} />
                </>
              ) : null}
            </FlowStep>

            {/* 6 Check out */}
            <FlowStep n={6} title="Check out" state={stage === 6 && !here ? "done" : stage === 6 ? "now" : "later"}>
              {stage === 6 && here ? <Button title="Check out of the site" icon="log-out-outline" variant="secondary" loading={busy === "presence"} onPress={clockOut} /> : null}
            </FlowStep>
          </Section>

          {/* The photos this job already holds - the asset running, the
              signed sheet. Nothing to take here: the installer photographs
              the asset when marking it active, and the sheet at handover. */}
          {inst.photos.length > 0 ? (
          <Section title="Installation Photos">
              <View style={styles.photoGrid}>
                {inst.photos.map((p) => (
                  <View key={p.id}>
                    <Image source={{ uri: mediaUrl(p.image) }} style={styles.photo} />
                    <Text style={styles.photoTag}>{p.photo_type.replace("_install", "").replace("_", " ")}</Text>
                  </View>
                ))}
              </View>
          </Section>
          ) : null}
          </>)}
        </ScrollView>

        {/* Add step */}
        <Modal visible={!!stepForm} transparent animationType="slide" onRequestClose={() => setStepForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Step</Text>
              <View style={styles.typeWrap}>
                {STEP_TYPES.map(([v, l]) => (
                  <Pressable key={v} onPress={() => setStepForm((f) => f && { ...f, type: v })} style={[styles.typeChip, stepForm?.type === v && styles.typeChipOn]}>
                    <Text style={[styles.typeText, stepForm?.type === v && { color: "#fff" }]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder={stepForm?.type === "other" ? "Name it *" : "Name it (optional)"}
                placeholderTextColor={colors.textLight}
                value={stepForm?.label ?? ""}
                onChangeText={(t) => setStepForm((f) => f && { ...f, label: t })}
              />
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setStepForm(null)} />
                <Button title="Add Step" small onPress={addStep} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Flag Delay / Hold: the web's form */}
        <Modal visible={!!delayFor} transparent animationType="slide" onRequestClose={() => setDelayFor(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Flag Delay — {delayFor?.label}</Text>
              {delayFor?.hold ? <Text style={styles.hint}>The step goes on hold until it is started again.</Text> : null}
              <View>
                <FieldLabel>Caused by</FieldLabel>
                <Select value={delayFor?.cause ?? "client"} options={DELAY_CAUSES}
                  onChange={(c) => setDelayFor((f) => f && { ...f, cause: c })} />
              </View>
              <View>
                <FieldLabel>Details</FieldLabel>
                <TextInput style={[styles.input, { height: 76, textAlignVertical: "top" }]} multiline
                  placeholder="e.g. Client did not grant site access" placeholderTextColor={colors.textLight}
                  value={delayFor?.note ?? ""} onChangeText={(t) => setDelayFor((f) => f && { ...f, note: t })} />
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setDelayFor(null)} />
                <Button title="Log Delay" small variant="danger" onPress={submitDelay} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Handover */}
        <Modal visible={!!handoverForm} transparent animationType="slide" onRequestClose={() => setHandoverForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Record Handover</Text>
              <Text style={styles.hint}>The client's signature is the handover: the record cannot be made without the signed sheet.</Text>
              <TextInput style={styles.input} placeholder="Accepted By (client-side name) *" placeholderTextColor={colors.textLight} value={handoverForm?.name ?? ""} onChangeText={(t) => setHandoverForm((f) => f && { ...f, name: t })} />
              <TextInput style={[styles.input, { height: 76, textAlignVertical: "top" }]} multiline placeholder="Acceptance Notes" placeholderTextColor={colors.textLight} value={handoverForm?.notes ?? ""} onChangeText={(t) => setHandoverForm((f) => f && { ...f, notes: t })} />
              <Text style={styles.hint}>Signed handover document *</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button title="Photograph signed sheet" small variant="secondary" icon="camera-outline" style={{ flex: 1 }} onPress={async () => { const a = await takePhoto(); if (a) setHandoverForm((f) => f && { ...f, doc: asUpload(a, "handover.jpg"), docName: "photo taken" }); }} />
                <Button title="Pick a file" small variant="secondary" icon="folder-open-outline" style={{ flex: 1 }} onPress={async () => { const a = await pickFromLibrary(); if (a) setHandoverForm((f) => f && { ...f, doc: asUpload(a, "handover.jpg"), docName: a.fileName ?? "file chosen" }); }} />
              </View>
              {handoverForm?.docName ? <Text style={[styles.hint, { color: "#047857" }]}>Attached: {handoverForm.docName}</Text> : null}
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setHandoverForm(null)} />
                <Button title="Record Handover" small onPress={submitHandover} />
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
  delay: { gap: 2, padding: 8, borderRadius: radius.sm, backgroundColor: colors.dangerSoft },
  delayHead: { fontSize: font.xs, fontWeight: "700", color: colors.danger },
  delayMeta: { fontSize: font.xs, color: colors.textMuted },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.border },
  photoTag: { fontSize: font.xs, color: colors.textMuted, textAlign: "center", marginTop: 2, textTransform: "capitalize" },
  label: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 },
  checkText: { flex: 1, fontSize: font.sm, color: colors.text, lineHeight: 20 },
  checkDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  link: { fontSize: font.sm, fontWeight: "700", color: colors.primary },
  evidence: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.border },
  evidenceAdd: { width: 56, height: 56, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 2 },
  evidenceAddText: { fontSize: 10, fontWeight: "700", color: colors.primary },
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
