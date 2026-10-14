import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlowStep, Note, PresenceCard, Section, Wash } from "@/components/field";
import { ScanSheet } from "@/components/scan-sheet";
import { Text } from "@/components/text";
import { Button, Card, Pill, Row } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Presence, checkIn, checkOut, getPresence, onSite } from "@/lib/attendance";
import { mediaUrl } from "@/lib/format";
import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";
import { asUpload, takePhoto } from "@/lib/photos";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

/**
 * A maintenance job on the phone, start to finish: check in, Before photo,
 * start, parts if needed, the work, After photo, hand it in for review,
 * check out. Unused parts go back to the store from the same screen.
 */
interface Schedule {
  id: string; title: string; description?: string; maintenance_type: "preventive" | "corrective"; status: string; status_display: string;
  priority: string; device: string | null; device_code: string | null; device_name: string | null;
  site: string | null; site_name: string | null; assigned_to: string | null; assigned_to_name: string | null;
  current_technician_name?: string | null;
  ticket: string | null; ticket_number: string | null; ticket_description?: string | null; next_due?: string | null;
}
interface VisitPhoto { id: string; kind: string; image: string; caption: string }
interface Visit {
  id: string; sequence: number; status: string; status_display: string; assigned_to: string | null; due_date: string | null;
  started_at: string | null; completed_at: string | null; remarks: string; resolved: boolean | null;
  asset_verified_at: string | null;
  review_decision: string | null; review_note: string | null; visit_photos: VisitPhoto[]; has_before_photo: boolean; has_after_photo: boolean;
}
interface Part {
  id: string; what: string; unit: string; item: string | null; unit_type: string | null; quantity_requested: number; quantity_approved: number | null;
  status: string; status_display: string; issue_status: string | null; quantity_issued: number | null; issued_serials: string[];
  quantity_used: number | null; quantity_returned: number | null; visit: string | null; decision_note?: string;
}
interface StockPick { id: string; name: string; code: string; unit?: string; unique: boolean }

const PART_TONE: Record<string, { fg: string; bg: string }> = {
  requested: { fg: "#b45309", bg: colors.warningSoft }, approved: { fg: "#1e40af", bg: colors.infoSoft },
  rejected: { fg: "#991b1b", bg: colors.dangerSoft }, cancelled: { fg: colors.textMuted, bg: colors.secondary },
};

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<Schedule | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [scan, setScan] = useState(false);
  const [partForm, setPartForm] = useState<{ q: string; results: StockPick[]; pick: StockPick | null; qty: string; reason: string } | null>(null);
  const [finish, setFinish] = useState<{ resolved: boolean | null; used: Record<string, string>; back: Record<string, string[]> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, v, p, pr] = await Promise.allSettled([
        api.get(`/maintenance/schedules/${id}/`),
        api.get("/maintenance/visits/", { params: { schedule: id, ordering: "sequence", page_size: 50 } }),
        api.get("/maintenance/part-requests/", { params: { schedule: id, page_size: 100 } }),
        getPresence(),
      ]);
      if (s.status === "fulfilled") { setJob(s.value.data); setNotes((n) => n || s.value.data.description || ""); }
      if (v.status === "fulfilled") setVisits(v.value.data.results ?? v.value.data);
      if (p.status === "fulfilled") setParts(p.value.data.results ?? p.value.data);
      if (pr.status === "fulfilled") setPresence(pr.value);
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
    try { await fn(); await load(); } catch (err) { fail(err, fallback); } finally { setBusy(null); }
  }

  if (loading || !job) {
    return <Wash><SafeAreaView style={{ flex: 1 }}><Text style={styles.muted}>{loading ? "Loading…" : "Job not found."}</Text></SafeAreaView></Wash>;
  }

  const current = [...visits].reverse().find((v) => v.status !== "completed" && v.status !== "skipped") ?? null;
  const past = visits.filter((v) => v !== current);
  const mine = !!me && (me.id === (current?.assigned_to ?? job.assigned_to));
  const here = onSite(presence, job.site);
  const closed = ["completed", "cancelled"].includes(job.status) || !current;
  // The phone has read the label on the asset this job is for. A job with
  // no asset has nothing to scan.
  const verified = !job.device || !!current?.asset_verified_at;
  const canAct = mine && here && verified && !closed && !!current;
  const awaiting = current?.status === "awaiting_review";
  const started = current?.status === "in_progress";
  const before = !!current?.has_before_photo;
  const after = !!current?.has_after_photo;
  const stage = !here && !closed ? 1 : !verified ? 2 : !before ? 3 : !started && !awaiting ? 4 : !after && !awaiting ? 5 : !awaiting ? 6 : here ? 7 : 8;
  const myParts = parts.filter((p) => !current || !p.visit || p.visit === current.id);
  const issued = myParts.filter((p) => p.quantity_issued && p.quantity_issued > 0 && p.quantity_used == null);

  // -- actions
  const clockIn = () => run("presence", async () => { if (!job.site) throw new Error("no site"); setPresence(await checkIn(job.site)); }, "This job has no site to check in at");
  const clockOut = () => run("presence", async () => { setPresence(await checkOut(job.site)); toast.success("Checked out"); }, "Could not check out");
  const photo = (kind: "before" | "after") => run(kind, async () => {
    if (!current) return;
    const a = await takePhoto();
    if (!a) return;
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("image", asUpload(a, `${kind}.jpg`));
    try {
      if (await requestForegroundLocationPermission()) {
        const l = await getCurrentLocation();
        fd.append("latitude", l.latitude.toFixed(7)); fd.append("longitude", l.longitude.toFixed(7));
      }
    } catch { /* no fix, no matter */ }
    await api.post(`/maintenance/visits/${current.id}/photos/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  }, "Photo upload failed");
  const verify = (code: string) => {
    setScan(false);
    run("verify", async () => {
      if (!current) return;
      await api.post(`/maintenance/visits/${current.id}/verify-asset/`, { code });
      toast.success(`${job.device_code} confirmed`);
    }, "That label is not this job's asset");
  };
  const start = () => run("start", async () => {
    if (!current) return;
    let where: Record<string, string> = {};
    try {
      if (await requestForegroundLocationPermission()) {
        const l = await getCurrentLocation();
        where = { latitude: l.latitude.toFixed(7), longitude: l.longitude.toFixed(7) };
      }
    } catch { /* ignore */ }
    await api.post(`/maintenance/visits/${current.id}/start/`, where);
    toast.success("Work started");
  }, "Could not start");
  const saveNotes = () => run("notes", async () => { if (current) await api.patch(`/maintenance/visits/${current.id}/`, { notes }); toast.success("Notes saved"); }, "Could not save notes");
  const searchStock = async (q: string) => {
    setPartForm((f) => f && { ...f, q });
    if (q.trim().length < 2) return;
    const [items, products] = await Promise.allSettled([
      api.get("/inventory/items/", { params: { search: q, page_size: 8 } }),
      api.get("/inventory/products/", { params: { search: q, page_size: 8 } }),
    ]);
    const list: StockPick[] = [];
    if (items.status === "fulfilled") for (const i of items.value.data.results ?? items.value.data) list.push({ id: i.id, name: i.name, code: i.sku ?? i.code ?? "", unit: i.unit, unique: false });
    if (products.status === "fulfilled") for (const p of products.value.data.results ?? products.value.data) list.push({ id: p.id, name: p.name, code: p.type_code ?? "", unit: p.unit, unique: true });
    setPartForm((f) => f && f.q === q ? { ...f, results: list } : f);
  };
  const requestPart = () => {
    if (!partForm?.pick) { toast.error("Pick a component"); return; }
    const qty = Number(partForm.qty);
    if (!qty || qty < 1) { toast.error("How many?"); return; }
    const f = partForm;
    setPartForm(null);
    run("part", async () => {
      await api.post("/maintenance/part-requests/", {
        schedule: job.id, visit: current?.id ?? null, quantity_requested: qty, reason: f.reason.trim(),
        ...(f.pick!.unique ? { unit_type: f.pick!.id } : { item: f.pick!.id }),
      });
      toast.success("Part requested — your supervisor will decide");
    }, "Could not raise the request");
  };
  const complete = () => {
    if (!finish || !current) return;
    if (job.maintenance_type === "corrective" && finish.resolved === null) { toast.error("Is the fault fixed?"); return; }
    if (finish.resolved === false && !notes.trim()) { toast.error("Say what is still wrong in the notes"); return; }
    for (const p of issued) {
      const u = Number(finish.used[p.id] ?? "");
      if (Number.isNaN(u) || finish.used[p.id] === undefined || finish.used[p.id] === "") { toast.error(`How many of ${p.what} were used?`); return; }
      if (u > (p.quantity_issued ?? 0)) { toast.error(`${p.what}: only ${p.quantity_issued} were issued`); return; }
    }
    const f = finish;
    setFinish(null);
    run("complete", async () => {
      const body: Record<string, unknown> = { remarks: notes.trim() };
      if (job.maintenance_type === "corrective") body.resolved = f.resolved;
      if (issued.length) body.parts_settlement = issued.map((p) => ({ part_request: p.id, used: Number(f.used[p.id]), serials: p.unit_type ? f.back[p.id] ?? [] : [] }));
      const { data } = await api.post(`/maintenance/visits/${current.id}/complete/`, body);
      toast.success(data.return_grn ? `Sent for review · return ${data.return_grn}` : "Sent for review");
    }, "Could not complete the visit");
  };

  const tone = (s: string) => PART_TONE[s] ?? { fg: colors.textMuted, bg: colors.secondary };

  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{job.ticket_number ?? job.device_code ?? "Round"}</Text>
              <Text style={styles.title}>{job.title}</Text>
            </View>
            <Pill label={current ? current.status_display : job.status_display} fg={started ? "#b45309" : awaiting ? "#6d28d9" : colors.textMuted} bg={started ? colors.warningSoft : awaiting ? colors.violetSoft : colors.secondary} />
          </View>
          <Card style={{ marginTop: spacing.md }}>
            <Row label="Kind" value={job.maintenance_type === "corrective" ? "Fault (corrective)" : "Round (preventive)"} />
            <Row label="Asset" value={job.device_code ? `${job.device_code} · ${job.device_name ?? ""}` : "—"} />
            <Row label="Site" value={job.site_name ?? "—"} />
            <Row label="Technician" value={job.current_technician_name ?? job.assigned_to_name ?? "Not assigned"} />
            {current ? <Row label="Visit" value={`#${current.sequence}${current.due_date ? ` · due ${current.due_date}` : ""}`} /> : null}
            {job.ticket_description ? <Text style={[styles.hint, { marginTop: 8 }]}>{job.ticket_description}</Text> : null}
          </Card>
          {job.ticket ? <Pressable onPress={() => router.push(`/ticket/${job.ticket}`)} style={styles.linkRow}><Ionicons name="reader-outline" size={15} color={colors.primary} /><Text style={styles.link}>Open ticket {job.ticket_number}</Text></Pressable> : null}

          <PresenceCard presence={presence} site={job.site} siteName={job.site_name ?? "the site"} mine={mine} busy={busy === "presence"} onCheckIn={clockIn} onCheckOut={clockOut} />
          <ScanSheet open={scan} expect={job.device_code ?? ""} onScan={verify} onClose={() => setScan(false)} />

          {closed ? <Note>This job is {job.status_display.toLowerCase()}.</Note> : null}
          {current?.review_decision === "unresolved" && current.review_note ? <Note tone="bad">Sent back: {current.review_note}</Note> : null}

          <Section title="The visit, step by step">
            <FlowStep n={1} title="Check in at the site" state={here || closed ? "done" : "now"} />
            <FlowStep n={2} title="Scan the asset's label" state={verified || closed ? "done" : stage === 2 ? "now" : "later"}>
              {stage === 2 && mine && here && current ? (
                <>
                  <Text style={styles.hint}>Point the camera at the QR label on {job.device_code}. Your buttons open once it matches.</Text>
                  <Button title="Scan asset QR" icon="qr-code-outline" loading={busy === "verify"} onPress={() => setScan(true)} />
                </>
              ) : null}
              {verified && current?.asset_verified_at && job.device ? <Text style={styles.hint}>{job.device_code} confirmed on site.</Text> : null}
            </FlowStep>
            <FlowStep n={3} title="Before photo" state={before ? "done" : stage === 3 ? "now" : "later"}>
              {stage === 3 && canAct ? <Button title="Take the Before photo" icon="camera" loading={busy === "before"} onPress={() => photo("before")} /> : null}
            </FlowStep>
            <FlowStep n={4} title="Start work" state={started || awaiting ? "done" : stage === 4 ? "now" : "later"}>
              {stage === 4 && canAct ? <Button title="Start work" icon="play" loading={busy === "start"} onPress={start} /> : null}
              {stage === 4 && canAct && myParts.some((p) => p.status === "approved" && !p.quantity_issued) ? <Note tone="warn">A requested part is not in your hands yet; the store issues it first.</Note> : null}
            </FlowStep>
            <FlowStep n={5} title="Work and notes" state={after || awaiting ? "done" : stage === 5 ? "now" : "later"}>
              {(started || awaiting) ? (
                <>
                  <TextInput style={[styles.input, { height: 84, textAlignVertical: "top" }]} multiline editable={canAct && started} placeholder="What was found, what was done" placeholderTextColor={colors.textLight} value={notes} onChangeText={setNotes} />
                  {canAct && started ? <Button title="Save notes" small variant="secondary" loading={busy === "notes"} onPress={saveNotes} /> : null}
                  {canAct && started ? <Button title="Take the After photo" icon="camera" loading={busy === "after"} onPress={() => photo("after")} /> : null}
                </>
              ) : null}
            </FlowStep>
            <FlowStep n={6} title="Send for review" state={awaiting || closed ? "done" : stage === 6 ? "now" : "later"}>
              {stage === 6 && canAct ? <Button title="End work and send for review" icon="paper-plane-outline" variant="success" onPress={() => setFinish({ resolved: null, used: {}, back: {} })} /> : null}
              {awaiting ? <Text style={styles.hint}>With your supervisor for review.</Text> : null}
            </FlowStep>
            <FlowStep n={7} title="Check out" state={stage === 8 ? "done" : stage === 7 ? "now" : "later"}>
              {stage === 7 && here ? <Button title="Check out of the site" icon="log-out-outline" variant="secondary" loading={busy === "presence"} onPress={clockOut} /> : null}
            </FlowStep>
          </Section>

          {/* Parts */}
          <Section
            title="Parts"
            hint="You ask, your supervisor approves, the store issues. Leftovers go back when you finish."
            action={canAct && !awaiting ? <Button title="Request" small icon="add" onPress={() => setPartForm({ q: "", results: [], pick: null, qty: "1", reason: "" })} /> : undefined}
          >
            {myParts.length === 0 ? <Text style={styles.muted}>No parts asked for.</Text> : myParts.map((p) => (
              <View key={p.id} style={styles.part}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.partName}>{p.what}</Text>
                  <Text style={styles.hint}>
                    {p.quantity_requested} {p.unit} requested
                    {p.quantity_issued ? ` · ${p.quantity_issued} issued` : p.status === "approved" ? " · approved, with the store" : ""}
                    {p.quantity_used != null ? ` · ${p.quantity_used} used, ${p.quantity_returned ?? 0} returned` : ""}
                    {p.decision_note ? ` · ${p.decision_note}` : ""}
                  </Text>
                </View>
                <Pill label={p.status_display} fg={tone(p.status).fg} bg={tone(p.status).bg} />
              </View>
            ))}
          </Section>

          {/* Photos */}
          <Section title="Photos">
            {!current || current.visit_photos.length === 0 ? <Text style={styles.muted}>No photos on this visit.</Text> : (
              <View style={styles.photoGrid}>
                {current.visit_photos.map((p) => (
                  <View key={p.id}>
                    <Image source={{ uri: mediaUrl(p.image) }} style={styles.photo} />
                    <Text style={styles.photoTag}>{p.kind}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {past.length ? (
            <Section title="Earlier visits">
              {past.map((v) => (
                <View key={v.id} style={styles.part}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partName}>Visit #{v.sequence}{v.completed_at ? ` · ${v.completed_at.slice(0, 10)}` : ""}</Text>
                    {v.remarks ? <Text style={styles.hint}>{v.remarks}</Text> : null}
                  </View>
                  <Pill label={v.status_display} fg={colors.textMuted} bg={colors.secondary} />
                </View>
              ))}
            </Section>
          ) : null}
        </ScrollView>

        {/* Request a part */}
        <Modal visible={!!partForm} transparent animationType="slide" onRequestClose={() => setPartForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Request a part</Text>
              <TextInput style={styles.input} placeholder="Search stock by name or code" placeholderTextColor={colors.textLight} value={partForm?.q ?? ""} onChangeText={searchStock} autoFocus />
              {partForm?.pick ? (
                <View style={styles.pickRow}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={styles.partName}>{partForm.pick.name} {partForm.pick.code ? `· ${partForm.pick.code}` : ""}</Text></View>
              ) : (
                <View style={{ maxHeight: 180 }}>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {(partForm?.results ?? []).map((r) => (
                      <Pressable key={r.id} onPress={() => setPartForm((f) => f && { ...f, pick: r })} style={styles.result}>
                        <Text style={styles.partName}>{r.name}</Text>
                        <Text style={styles.hint}>{r.code}{r.unit ? ` · ${r.unit}` : ""} · {r.unique ? "unique item" : "stock item"}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput style={[styles.input, { width: 90 }]} keyboardType="number-pad" placeholder="Qty" placeholderTextColor={colors.textLight} value={partForm?.qty ?? ""} onChangeText={(t) => setPartForm((f) => f && { ...f, qty: t })} />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Why it is needed" placeholderTextColor={colors.textLight} value={partForm?.reason ?? ""} onChangeText={(t) => setPartForm((f) => f && { ...f, reason: t })} />
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setPartForm(null)} />
                <Button title="Raise request" small onPress={requestPart} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Finish */}
        <Modal visible={!!finish} transparent animationType="slide" onRequestClose={() => setFinish(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>End work</Text>
              {job.maintenance_type === "corrective" ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Fault fixed" small style={{ flex: 1 }} variant={finish?.resolved === true ? "success" : "secondary"} icon="checkmark" onPress={() => setFinish((f) => f && { ...f, resolved: true })} />
                  <Button title="Still faulty" small style={{ flex: 1 }} variant={finish?.resolved === false ? "danger" : "secondary"} icon="close" onPress={() => setFinish((f) => f && { ...f, resolved: false })} />
                </View>
              ) : null}
              {issued.length ? (
                <View style={{ gap: 8 }}>
                  <Text style={styles.hint}>How many of each issued part were used? The rest goes back to the store for inspection.</Text>
                  {issued.map((p) => (
                    <View key={p.id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.partName, { flex: 1 }]}>{p.what} · {p.quantity_issued} issued</Text>
                        <TextInput style={[styles.input, { width: 80 }]} keyboardType="number-pad" placeholder="used" placeholderTextColor={colors.textLight} value={finish?.used[p.id] ?? ""} onChangeText={(t) => setFinish((f) => f && { ...f, used: { ...f.used, [p.id]: t } })} />
                      </View>
                      {p.unit_type && p.issued_serials?.length ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          {p.issued_serials.map((sn) => {
                            const on = (finish?.back[p.id] ?? []).includes(sn);
                            return (
                              <Pressable key={sn} onPress={() => setFinish((f) => f && { ...f, back: { ...f.back, [p.id]: on ? (f.back[p.id] ?? []).filter((x) => x !== sn) : [...(f.back[p.id] ?? []), sn] } })} style={[styles.serial, on && styles.serialOn]}>
                                <Text style={[styles.hint, on && { color: "#fff" }]}>{on ? "↩ " : ""}{sn}</Text>
                              </Pressable>
                            );
                          })}
                          <Text style={styles.hint}>tap the serials going back</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.hint}>Your notes go in as the remarks. The After photo is already on the visit.</Text>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setFinish(null)} />
                <Button title="Send for review" small variant="success" onPress={complete} />
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
  code: { fontSize: font.xs, fontWeight: "700", color: colors.primary },
  title: { fontSize: font.h2, fontWeight: "800", color: colors.text },
  muted: { fontSize: font.sm, color: colors.textMuted, padding: spacing.sm },
  hint: { fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  link: { fontSize: font.sm, fontWeight: "700", color: colors.primary },
  part: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  partName: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photo: { width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.border },
  photoTag: { fontSize: font.xs, color: colors.textMuted, textAlign: "center", marginTop: 2, textTransform: "capitalize" },
  modalWrap: { flex: 1, backgroundColor: "rgba(22,49,68,0.55)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text, backgroundColor: colors.bg, fontFamily: "Urbanist_500Medium" },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  result: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  serial: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.secondary },
  serialOn: { backgroundColor: colors.primary },
});
