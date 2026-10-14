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
import * as SecureStore from "@/lib/secure-store";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

/**
 * A maintenance job on the phone, start to finish: the components it needs
 * (asked for, approved, issued - before setting off), check in, scan the
 * asset, Before photo, start, the work, After photo, hand it in for review,
 * check out, and back at the store say what was used: the rest goes to
 * receiving.
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
  return_reference?: string | null;
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
  const [finish, setFinish] = useState<{ resolved: boolean | null } | null>(null);
  const [giveBack, setGiveBack] = useState<{ used: Record<string, string>; back: Record<string, string[]> } | null>(null);
  // "No components needed" for this visit. The server has nothing to keep it
  // on - nothing asked for is what it records - so the phone remembers it.
  const [noneNeeded, setNoneNeeded] = useState(false);
  const openVisitId = [...visits].reverse().find((v) => v.status !== "completed" && v.status !== "skipped")?.id ?? null;
  useEffect(() => {
    if (!openVisitId) return;
    SecureStore.getItem(`parts-none-${openVisitId}`).then((v) => setNoneNeeded(v === "1")).catch(() => {});
  }, [openVisitId]);

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
  const myParts = parts.filter((p) => !current || !p.visit || p.visit === current.id);
  // Issued and not yet accounted for: what goes back once the work is done.
  const issued = myParts.filter((p) => p.quantity_issued && p.quantity_issued > 0 && p.quantity_used == null);
  const liveParts = myParts.filter((p) => p.status !== "cancelled");
  // Asked for and not in hand yet: not approved, or approved and not issued.
  const waitingParts = liveParts.filter((p) => p.status === "requested" || (p.status === "approved" && !(p.quantity_issued && p.quantity_issued > 0)));
  const hadIssued = myParts.some((p) => (p.quantity_issued ?? 0) > 0);
  // Step 1 is answered when nothing more is coming: none needed, or every
  // line approved and issued (or turned down). A visit already under way
  // is not held back by a question asked after it started.
  const componentsDone = closed || started || awaiting || ((liveParts.length > 0 || noneNeeded) && waitingParts.length === 0);
  const stage = closed ? 0
    : awaiting ? (here ? 8 : issued.length ? 9 : 10)
    : !componentsDone ? 1
    : !here ? 2
    : !verified ? 3
    : !before ? 4
    : !started ? 5
    : !after ? 6
    : 7;

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
  const tone = (s: string) => PART_TONE[s] ?? { fg: colors.textMuted, bg: colors.secondary };
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
    const f = finish;
    setFinish(null);
    run("complete", async () => {
      const body: Record<string, unknown> = { remarks: notes.trim() };
      if (job.maintenance_type === "corrective") body.resolved = f.resolved;
      await api.post(`/maintenance/visits/${current.id}/complete/`, body);
      toast.success(issued.length ? "Sent for review · return the unused components after you check out" : "Sent for review");
    }, "Could not complete the visit");
  };
  // Back from site: how much of each issued component was used. The rest
  // goes to the store's receiving under its own reference.
  const returnParts = () => {
    if (!giveBack || !current) return;
    for (const p of issued) {
      const raw = giveBack.used[p.id];
      const u = Number(raw ?? "");
      if (raw === undefined || raw === "" || Number.isNaN(u)) { toast.error(`How many of ${p.what} did you use?`); return; }
      if (u < 0 || u > (p.quantity_issued ?? 0)) { toast.error(`${p.what}: ${p.quantity_issued} were issued`); return; }
      const back = (p.quantity_issued ?? 0) - u;
      if (p.unit_type && back > 0 && (giveBack.back[p.id] ?? []).length !== back) { toast.error(`${p.what}: tap the ${back} serial number${back > 1 ? "s" : ""} going back`); return; }
    }
    const g = giveBack;
    setGiveBack(null);
    run("return", async () => {
      const { data } = await api.post(`/maintenance/visits/${current.id}/return-parts/`, {
        parts_settlement: issued.map((p) => ({ part_request: p.id, used: Number(g.used[p.id]), serials: p.unit_type ? g.back[p.id] ?? [] : [] })),
      });
      toast.success(data.return_grn ? `Going back to the store · ${data.return_grn}` : "Recorded: everything was used");
    }, "Could not record the return");
  };
  const sayNone = (none: boolean) => {
    if (!current) return;
    setNoneNeeded(none);
    const key = `parts-none-${current.id}`;
    (none ? SecureStore.setItem(key, "1") : SecureStore.deleteItem(key)).catch(() => {});
  };
  const withdraw = (p: Part) => run(p.id, async () => {
    await api.delete(`/maintenance/part-requests/${p.id}/`);
    toast.success("Request withdrawn");
  }, "Could not withdraw the request");
  const openPartForm = () => setPartForm({ q: "", results: [], pick: null, qty: "1", reason: "" });
  const lineState = (p: Part) => (
    p.status === "requested" ? "Waiting for approval"
      : p.status === "rejected" ? `Not approved${p.decision_note ? ` · ${p.decision_note}` : ""}`
        : p.status === "cancelled" ? "Withdrawn"
          : p.quantity_used != null ? `${p.quantity_used} used · ${p.quantity_returned ?? 0} back to the store${p.return_reference ? ` (${p.return_reference})` : ""}`
            : (p.quantity_issued ?? 0) > 0 ? `${p.quantity_issued} ${p.unit} issued · in your hands`
              : "Approved · the store is to issue it"
  );
  const lineTone = (p: Part) => (
    p.status === "requested" ? tone("requested")
      : p.status === "rejected" || p.status === "cancelled" ? tone(p.status)
        : (p.quantity_issued ?? 0) > 0 ? { fg: "#047857", bg: colors.successSoft }
          : tone("approved")
  );
  const lineLabel = (p: Part) => (
    p.status === "requested" ? "Asked" : p.status === "rejected" ? "Rejected" : p.status === "cancelled" ? "Withdrawn"
      : p.quantity_used != null ? "Settled" : (p.quantity_issued ?? 0) > 0 ? "Issued" : "Approved"
  );


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

          <PresenceCard
            presence={presence} site={job.site} siteName={job.site_name ?? "the site"} mine={mine} busy={busy === "presence"}
            onCheckIn={clockIn} onCheckOut={clockOut}
            lockedReason={!componentsDone && !here ? "Sort out the components for this job first (step 1) - check-in opens once they are in your hands." : undefined}
          />
          <ScanSheet open={scan} expect={job.device_code ?? ""} onScan={verify} onClose={() => setScan(false)} />

          {closed ? <Note>This job is {job.status_display.toLowerCase()}.</Note> : null}
          {current?.review_decision === "unresolved" && current.review_note ? <Note tone="bad">Sent back: {current.review_note}</Note> : null}

          <Section title="The visit, step by step">
            <FlowStep n={1} title="Components for this job" state={componentsDone ? "done" : "now"}>
              {liveParts.map((p) => (
                <View key={p.id} style={styles.part}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partName}>{p.what} · {p.quantity_approved ?? p.quantity_requested} {p.unit}</Text>
                    <Text style={styles.hint}>{lineState(p)}</Text>
                  </View>
                  {mine && p.status === "requested" && !closed ? (
                    <Pressable onPress={() => withdraw(p)} hitSlop={8}><Text style={styles.withdraw}>Withdraw</Text></Pressable>
                  ) : (
                    <Pill label={lineLabel(p)} fg={lineTone(p).fg} bg={lineTone(p).bg} />
                  )}
                </View>
              ))}
              {mine && !closed && !awaiting && current ? (
                liveParts.length === 0 && !noneNeeded && !started ? (
                  <>
                    <Text style={styles.hint}>Do you need any components for this job? Ask before you set off: your supervisor approves, the store issues, and check-in opens once they are in your hands.</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button title="Yes, request" small icon="add" style={{ flex: 1 }} onPress={openPartForm} />
                      <Button title="None needed" small variant="secondary" style={{ flex: 1 }} onPress={() => sayNone(true)} />
                    </View>
                  </>
                ) : liveParts.length === 0 && noneNeeded ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.hint, { flex: 1 }]}>No components needed.</Text>
                    {!started ? <Button title="I need some" small variant="ghost" onPress={() => { sayNone(false); openPartForm(); }} /> : null}
                  </View>
                ) : (
                  <Button title="Request another" small variant="secondary" icon="add" onPress={openPartForm} />
                )
              ) : null}
              {waitingParts.length > 0 && !started && !awaiting && !closed ? (
                <Note tone="warn">Waiting on {waitingParts.length === 1 ? "this request" : `${waitingParts.length} requests`}. Pull down to refresh; you are notified when it is approved and when the store issues it.</Note>
              ) : null}
            </FlowStep>
            <FlowStep n={2} title="Check in at the site" state={here || awaiting || closed ? "done" : stage === 2 ? "now" : "later"}>
              {stage === 1 && mine ? <Text style={styles.hint}>Opens once the components are sorted.</Text> : null}
            </FlowStep>
            <FlowStep n={3} title="Scan the asset's label" state={verified || closed ? "done" : stage === 3 ? "now" : "later"}>
              {stage === 3 && mine && here && current ? (
                <>
                  <Text style={styles.hint}>Point the camera at the QR label on {job.device_code}. Your buttons open once it matches.</Text>
                  <Button title="Scan asset QR" icon="qr-code-outline" loading={busy === "verify"} onPress={() => setScan(true)} />
                </>
              ) : null}
              {verified && current?.asset_verified_at && job.device ? <Text style={styles.hint}>{job.device_code} confirmed on site.</Text> : null}
            </FlowStep>
            <FlowStep n={4} title="Before photo" state={before ? "done" : stage === 4 ? "now" : "later"}>
              {stage === 4 && canAct ? <Button title="Take the Before photo" icon="camera" loading={busy === "before"} onPress={() => photo("before")} /> : null}
            </FlowStep>
            <FlowStep n={5} title="Start work" state={started || awaiting ? "done" : stage === 5 ? "now" : "later"}>
              {stage === 5 && canAct ? <Button title="Start work" icon="play" loading={busy === "start"} onPress={start} /> : null}
            </FlowStep>
            <FlowStep n={6} title="Work and notes" state={after || awaiting ? "done" : stage === 6 ? "now" : "later"}>
              {(started || awaiting) ? (
                <>
                  <TextInput style={[styles.input, { height: 84, textAlignVertical: "top" }]} multiline editable={canAct && started} placeholder="What was found, what was done" placeholderTextColor={colors.textLight} value={notes} onChangeText={setNotes} />
                  {canAct && started ? <Button title="Save notes" small variant="secondary" loading={busy === "notes"} onPress={saveNotes} /> : null}
                  {canAct && started ? <Button title="Take the After photo" icon="camera" loading={busy === "after"} onPress={() => photo("after")} /> : null}
                </>
              ) : null}
            </FlowStep>
            <FlowStep n={7} title="Send for review" state={awaiting || closed ? "done" : stage === 7 ? "now" : "later"}>
              {stage === 7 && canAct ? <Button title="End work and send for review" icon="paper-plane-outline" variant="success" onPress={() => setFinish({ resolved: null })} /> : null}
              {awaiting ? <Text style={styles.hint}>With your supervisor for review.</Text> : null}
            </FlowStep>
            <FlowStep n={8} title="Check out" state={stage > 8 || (closed && !here) ? "done" : stage === 8 ? "now" : "later"}>
              {stage === 8 && here ? <Button title="Check out of the site" icon="log-out-outline" variant="secondary" loading={busy === "presence"} onPress={clockOut} /> : null}
            </FlowStep>
            {hadIssued ? (
              <FlowStep n={9} title="Return unused components" state={issued.length === 0 ? "done" : stage === 9 ? "now" : "later"}>
                {issued.length > 0 && mine && current && (started || awaiting) ? (
                  <>
                    <Text style={styles.hint}>
                      {stage === 9
                        ? "Back at the store: say how much of each issued component you used. The rest goes to the store's receiving."
                        : "After you check out, say what you used; the rest goes back to the store."}
                    </Text>
                    {stage === 9 ? <Button title="Return unused components" icon="return-down-back-outline" loading={busy === "return"} onPress={() => setGiveBack({ used: {}, back: {} })} /> : null}
                  </>
                ) : null}
                {issued.length === 0 ? <Text style={styles.hint}>Accounted for: see the lines in step 1.</Text> : null}
              </FlowStep>
            ) : null}
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
              <Text style={styles.hint}>Your notes go in as the remarks. The After photo is already on the visit.{issued.length ? " You return the unused components after you check out." : ""}</Text>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setFinish(null)} />
                <Button title="Send for review" small variant="success" onPress={complete} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Return unused components */}
        <Modal visible={!!giveBack} transparent animationType="slide" onRequestClose={() => setGiveBack(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Return unused components</Text>
              <Text style={styles.hint}>How many of each did you use on this job? Whatever is left goes to the store's receiving, to be checked in.</Text>
              {issued.map((p) => {
                const used = Number(giveBack?.used[p.id] ?? "");
                const back = giveBack?.used[p.id] !== undefined && giveBack?.used[p.id] !== "" && !Number.isNaN(used) ? Math.max(0, (p.quantity_issued ?? 0) - used) : null;
                return (
                  <View key={p.id} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.partName}>{p.what}</Text>
                        <Text style={styles.hint}>{p.quantity_issued} {p.unit} issued{back !== null ? ` · ${back} going back` : ""}</Text>
                      </View>
                      <TextInput style={[styles.input, { width: 86 }]} keyboardType="number-pad" placeholder="used" placeholderTextColor={colors.textLight} value={giveBack?.used[p.id] ?? ""} onChangeText={(t) => setGiveBack((g) => g && { ...g, used: { ...g.used, [p.id]: t } })} />
                    </View>
                    {p.unit_type && p.issued_serials?.length && back ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {p.issued_serials.map((sn) => {
                          const on = (giveBack?.back[p.id] ?? []).includes(sn);
                          return (
                            <Pressable key={sn} onPress={() => setGiveBack((g) => g && { ...g, back: { ...g.back, [p.id]: on ? (g.back[p.id] ?? []).filter((x) => x !== sn) : [...(g.back[p.id] ?? []), sn] } })} style={[styles.serial, on && styles.serialOn]}>
                              <Text style={[styles.hint, on && { color: "#fff" }]}>{on ? "↩ " : ""}{sn}</Text>
                            </Pressable>
                          );
                        })}
                        <Text style={styles.hint}>tap the serials going back</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setGiveBack(null)} />
                <Button title="Return to the store" small onPress={returnParts} />
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
  withdraw: { fontSize: font.sm, fontWeight: "700", color: colors.danger },
});
