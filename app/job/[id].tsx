import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlowStep, Note, PresenceCard, Section, Wash } from "@/components/field";
import { ScanSheet } from "@/components/scan-sheet";
import { Text } from "@/components/text";
import { Button, Card, FieldLabel, Pill, Row, Select } from "@/components/ui";
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
  return_reference?: string | null; issue_number?: string | null;
}
/** A component the store keeps, listed the way the web's picker lists it. */
interface StockOption { id: string; kind: "item" | "product"; name: string; unit: string; label: string }

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
  // The web's "Components for this visit" form: Kind, Component, Quantity.
  const [partForm, setPartForm] = useState<{ kind: "generic" | "unique"; pick: string; qty: string } | null>(null);
  const [stock, setStock] = useState<StockOption[] | null>(null);
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
  const awaitingApproval = waitingParts.filter((p) => p.status === "requested").length;
  const waitingNote = [
    awaitingApproval ? `${awaitingApproval} awaiting approval` : "",
    waitingParts.length - awaitingApproval ? `${waitingParts.length - awaitingApproval} awaiting issue` : "",
  ].filter(Boolean).join(" · ");
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
    toast.success(kind === "before" ? "Before photo added" : "After photo added");
  }, "Could not upload that photo");
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
  }, "Could not start this visit");
  const saveNotes = () => run("notes", async () => { if (current) await api.patch(`/maintenance/visits/${current.id}/`, { notes }); toast.success("Saved"); }, "Could not save the work done");
  // The same list the web offers, loaded once: counted stock and
  // individually tracked units, each with what is on the shelf.
  const loadStock = async () => {
    const [items, products] = await Promise.allSettled([
      api.get("/inventory/items/", { params: { page_size: 500 } }),
      api.get("/inventory/products/", { params: { page_size: 500 } }),
    ]);
    const opts: StockOption[] = [];
    if (items.status === "fulfilled") for (const it of items.value.data.results ?? items.value.data) {
      const name = it.material_name ?? it.sku;
      opts.push({ id: it.id, kind: "item", name, unit: it.unit || "piece", label: `${name} · ${it.quantity} ${it.unit || "piece"} in stock` });
    }
    if (products.status === "fulfilled") for (const p of products.value.data.results ?? products.value.data) {
      const name = [p.name, p.model_name].filter(Boolean).join(" ");
      opts.push({ id: p.id, kind: "product", name, unit: p.unit || "piece", label: `${name} · ${p.in_stock_count} ${p.unit || "piece"} in stock` });
    }
    setStock(opts);
  };
  const requestPart = () => {
    const opt = stock?.find((o) => o.id === partForm?.pick);
    if (!partForm || !opt) { toast.error("Pick the component you need"); return; }
    const qty = Math.max(1, Number(partForm.qty) || 1);
    setPartForm(null);
    run("part", async () => {
      await api.post("/maintenance/part-requests/", {
        schedule: job.id, quantity_requested: qty, name: opt.name,
        ...(opt.kind === "item" ? { item: opt.id } : { unit_type: opt.id }),
      });
      toast.success("Request raised — a supervisor decides next");
    }, "Could not raise that request");
  };
  const complete = () => {
    if (!finish || !current) return;
    if (job.maintenance_type === "corrective" && finish.resolved === null) { toast.error("Is the fault fixed?"); return; }
    if (finish.resolved === false && !notes.trim()) { toast.error("Say why it could not be fixed, under Work done"); return; }
    const f = finish;
    setFinish(null);
    run("complete", async () => {
      const body: Record<string, unknown> = { remarks: notes.trim() };
      if (job.maintenance_type === "corrective") body.resolved = f.resolved;
      await api.post(`/maintenance/visits/${current.id}/complete/`, body);
      toast.success(issued.length ? "Sent for review · return unused components after check-out" : "Sent for review");
    }, "Could not complete this visit");
  };
  // Back from site: what was used, the web's way. A stock line says how
  // many (all of it unless told otherwise); a unique line names the serials
  // going back. The rest goes to the store's receiving.
  const usedOn = (p: Part) => (p.unit_type
    ? (p.quantity_issued ?? 0) - (giveBack?.back[p.id]?.length ?? 0)
    : giveBack?.used[p.id] !== undefined && giveBack.used[p.id] !== "" ? Number(giveBack.used[p.id]) : p.quantity_issued ?? 0);
  const returnParts = () => {
    if (!giveBack || !current) return;
    for (const p of issued) {
      const u = usedOn(p);
      if (Number.isNaN(u) || u < 0 || u > (p.quantity_issued ?? 0)) { toast.error(`${p.what}: used is 0 to ${p.quantity_issued}`); return; }
    }
    const rows = issued.map((p) => ({ part_request: p.id, used: usedOn(p), serials: p.unit_type ? giveBack.back[p.id] ?? [] : [] }));
    setGiveBack(null);
    run("return", async () => {
      const { data } = await api.post(`/maintenance/visits/${current.id}/return-parts/`, { parts_settlement: rows });
      toast.success(data.return_grn ? `Going back to the store · ${data.return_grn}` : "Nothing going back");
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
    toast.success("Withdrawn");
  }, "Could not withdraw that line");
  const openPartForm = () => {
    setPartForm({ kind: "generic", pick: "", qty: "1" });
    if (!stock) loadStock();
  };
  // The web table's Store column, in its words.
  const storeLine = (p: Part) => (p.issue_number
    ? `${p.issue_number} · ${p.quantity_issued ? `${p.quantity_issued} ${p.unit} issued` : "awaiting issue"}`
    : null);
  const lineTone = (p: Part) => (p.status === "approved" && (p.quantity_issued ?? 0) > 0
    ? { fg: "#047857", bg: colors.successSoft }
    : tone(p.status));


  return (
    <Wash>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.code}>{job.ticket_number ?? job.device_code ?? "Preventive"}</Text>
              <Text style={styles.title}>{job.title}</Text>
            </View>
            <Pill label={current ? current.status_display : job.status_display} fg={started ? "#b45309" : awaiting ? "#6d28d9" : colors.textMuted} bg={started ? colors.warningSoft : awaiting ? colors.violetSoft : colors.secondary} />
          </View>
          <Card style={{ marginTop: spacing.md }}>
            <Row label="Type" value={job.maintenance_type === "corrective" ? "Corrective" : "Preventive"} />
            <Row label="Asset" value={job.device_code ? `${job.device_code} · ${job.device_name ?? ""}` : "—"} />
            <Row label="Site" value={job.site_name ?? "—"} />
            <Row label="Technician" value={job.current_technician_name ?? job.assigned_to_name ?? "Not assigned"} />
            {current ? <Row label="Visit" value={`#${current.sequence}`} /> : null}
            {current?.due_date ? <Row label="Due on" value={current.due_date} /> : null}
            {job.ticket_description ? <Text style={[styles.hint, { marginTop: 8 }]}>{job.ticket_description}</Text> : null}
          </Card>
          {job.ticket ? <Pressable onPress={() => router.push(`/ticket/${job.ticket}`)} style={styles.linkRow}><Ionicons name="reader-outline" size={15} color={colors.primary} /><Text style={styles.link}>Open ticket {job.ticket_number}</Text></Pressable> : null}

          <PresenceCard
            presence={presence} site={job.site} siteName={job.site_name ?? "the site"} mine={mine} busy={busy === "presence"}
            onCheckIn={clockIn} onCheckOut={clockOut}
            lockedReason={!componentsDone && !here ? "Components for this visit come first (step 1). Check-in opens once they are issued, or none are needed." : undefined}
          />
          <ScanSheet open={scan} expect={job.device_code ?? ""} onScan={verify} onClose={() => setScan(false)} />

          {closed ? <Note>This job is {job.status_display.toLowerCase()}.</Note> : null}
          {current?.review_decision === "unresolved" && current.review_note ? <Note tone="bad">Marked unresolved: {current.review_note}</Note> : null}

          <Section title="The visit, step by step">
            <FlowStep n={1} title="Components for this visit" state={componentsDone ? "done" : "now"}>
              <Text style={styles.hint}>The technician asks, a supervisor releases, the store issues.</Text>
              {liveParts.map((p) => (
                <View key={p.id} style={styles.part}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.partName}>{p.what}</Text>
                    <Text style={styles.hint}>
                      {p.unit_type ? "Unique item" : "Stock item"} · Asked {p.quantity_requested} {p.unit}
                      {p.status === "approved" && p.quantity_approved != null ? ` · Approved ${p.quantity_approved} ${p.unit}` : ""}
                    </Text>
                    {storeLine(p) ? <Text style={styles.hint}>{storeLine(p)}</Text> : null}
                    {p.issued_serials?.length ? <Text style={styles.hint}>{p.issued_serials.join(", ")}</Text> : null}
                    {p.quantity_used != null ? (
                      <Text style={styles.hint}>
                        {p.quantity_used} {p.unit} used{(p.quantity_returned ?? 0) > 0 ? ` · ${p.quantity_returned} back to the store on ${p.return_reference}` : ""}
                      </Text>
                    ) : null}
                    {p.decision_note ? <Text style={[styles.hint, { fontStyle: "italic" }]}>{p.decision_note}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Pill label={p.status_display} fg={lineTone(p).fg} bg={lineTone(p).bg} />
                    {mine && p.status === "requested" && !closed ? (
                      <Pressable onPress={() => withdraw(p)} hitSlop={8}><Text style={styles.withdraw}>Withdraw</Text></Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
              {mine && !closed && !awaiting && current ? (
                liveParts.length === 0 && !noneNeeded && !started ? (
                  <>
                    <Text style={styles.hint}>Do you need any components for this visit? Check-in opens once they are issued, or once you say none are needed.</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button title="Raise request" small icon="add" style={{ flex: 1 }} onPress={openPartForm} />
                      <Button title="None needed" small variant="secondary" style={{ flex: 1 }} onPress={() => sayNone(true)} />
                    </View>
                  </>
                ) : liveParts.length === 0 && noneNeeded ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.hint, { flex: 1 }]}>No components needed.</Text>
                    {!started ? <Button title="Raise request" small variant="ghost" icon="add" onPress={() => { sayNone(false); openPartForm(); }} /> : null}
                  </View>
                ) : (
                  <Button title="Raise request" small variant="secondary" icon="add" onPress={openPartForm} />
                )
              ) : liveParts.length === 0 ? <Text style={styles.hint}>Nothing asked for.</Text> : null}
              {waitingParts.length > 0 && !started && !awaiting && !closed ? (
                <Note tone="warn">{waitingNote}. Check-in opens once every line is issued. You are notified at each step; pull down to refresh.</Note>
              ) : null}
            </FlowStep>
            <FlowStep n={2} title="Check in at the site" state={here || awaiting || closed ? "done" : stage === 2 ? "now" : "later"}>
              {stage === 1 && mine ? <Text style={styles.hint}>Opens once the components are issued, or none are needed.</Text> : null}
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
            <FlowStep n={6} title="Work done" state={after || awaiting ? "done" : stage === 6 ? "now" : "later"}>
              {(started || awaiting) ? (
                <>
                  <TextInput style={[styles.input, { height: 84, textAlignVertical: "top" }]} multiline editable={canAct && started} placeholder={job.maintenance_type === "corrective" ? "What was done" : "What was checked, cleaned or replaced, and anything observed"} placeholderTextColor={colors.textLight} value={notes} onChangeText={setNotes} />
                  {canAct && started ? <Button title="Save" small variant="secondary" loading={busy === "notes"} onPress={saveNotes} /> : null}
                  {canAct && started ? <Button title="Take the After photo" icon="camera" loading={busy === "after"} onPress={() => photo("after")} /> : null}
                </>
              ) : null}
            </FlowStep>
            <FlowStep n={7} title="Complete visit" state={awaiting || closed ? "done" : stage === 7 ? "now" : "later"}>
              {stage === 7 && canAct ? <Button title="Complete visit" icon="checkmark" variant="success" onPress={() => setFinish({ resolved: null })} /> : null}
              {awaiting ? <Text style={styles.hint}>Waiting for the office to review the work.</Text> : null}
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
                        ? "Say what was used. Anything else goes back to the store and waits in receiving to be checked in."
                        : "After check-out: say what was used. Anything else goes back to the store."}
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
            <Section title={job.maintenance_type === "corrective" ? "Visit details" : "Past visits"}>
              {past.map((v) => (
                <View key={v.id} style={styles.part}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partName}>#{v.sequence}{v.completed_at ? ` · carried out ${v.completed_at.slice(0, 10)}` : ""}</Text>
                    {v.remarks ? <Text style={styles.hint}>{v.remarks}</Text> : null}
                  </View>
                  <Pill label={v.status_display} fg={colors.textMuted} bg={colors.secondary} />
                </View>
              ))}
            </Section>
          ) : null}
        </ScrollView>

        {/* Components for this visit: the web's form, in a sheet */}
        <Modal visible={!!partForm} transparent animationType="slide" onRequestClose={() => setPartForm(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={{ gap: 2 }}>
                <Text style={styles.modalTitle}>Components for this visit</Text>
                <Text style={styles.hint}>The technician asks, a supervisor releases, the store issues.</Text>
              </View>
              <View>
                <FieldLabel>Kind</FieldLabel>
                <Select
                  value={partForm?.kind ?? "generic"}
                  options={[{ id: "generic", label: "Stock item" }, { id: "unique", label: "Unique item" }]}
                  onChange={(k) => setPartForm((f) => f && { ...f, kind: k as "generic" | "unique", pick: "" })}
                />
              </View>
              <View>
                <FieldLabel>Component</FieldLabel>
                <Select
                  value={partForm?.pick ?? ""}
                  options={(stock ?? []).filter((o) => (partForm?.kind === "unique" ? o.kind === "product" : o.kind === "item")).map((o) => ({ id: o.id, label: o.label }))}
                  placeholder={!stock ? "Loading…" : partForm?.kind === "unique" ? "Search unique items…" : "Search stock items…"}
                  onChange={(id) => setPartForm((f) => f && { ...f, pick: id })}
                  searchable
                />
              </View>
              <View>
                <FieldLabel>Quantity</FieldLabel>
                <View style={styles.qtyBox}>
                  <TextInput style={styles.qtyInput} keyboardType="number-pad" value={partForm?.qty ?? ""} onChangeText={(t) => setPartForm((f) => f && { ...f, qty: t })} />
                  <Text style={styles.hint}>{stock?.find((o) => o.id === partForm?.pick)?.unit ?? "qty"}</Text>
                </View>
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setPartForm(null)} />
                <Button title="Raise request" small icon="add" disabled={!partForm?.pick} onPress={requestPart} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Finish */}
        <Modal visible={!!finish} transparent animationType="slide" onRequestClose={() => setFinish(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{job.maintenance_type === "corrective" ? "Complete this visit" : "Complete this round"}</Text>
              {job.maintenance_type === "corrective" ? (
                <View>
                  <FieldLabel>Is the fault fixed?</FieldLabel>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button title="Yes, it is fixed" small style={{ flex: 1 }} variant={finish?.resolved === true ? "success" : "secondary"} icon="checkmark" onPress={() => setFinish((f) => f && { ...f, resolved: true })} />
                    <Button title="No, it is not" small style={{ flex: 1 }} variant={finish?.resolved === false ? "danger" : "secondary"} icon="close" onPress={() => setFinish((f) => f && { ...f, resolved: false })} />
                  </View>
                </View>
              ) : null}
              <Text style={styles.hint}>What you wrote under Work done goes in with it. The After photo is already on the visit.{issued.length ? " Unused components go back after you check out." : ""}</Text>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setFinish(null)} />
                <Button title="Send for review" small variant="success" onPress={complete} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Return unused components: the web's "Components issued for this visit" */}
        <Modal visible={!!giveBack} transparent animationType="slide" onRequestClose={() => setGiveBack(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <View style={{ gap: 2 }}>
                <Text style={styles.modalTitle}>Components issued for this visit</Text>
                <Text style={styles.hint}>Say what was used. Anything else goes back to the store and waits in receiving to be checked in.</Text>
              </View>
              <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                <View style={{ gap: spacing.md }}>
                  {issued.map((p) => {
                    const issuedQty = p.quantity_issued ?? 0;
                    const back = issuedQty - usedOn(p);
                    return (
                      <View key={p.id} style={styles.settle}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                          <Text style={[styles.partName, { flex: 1 }]}>{p.what}</Text>
                          <Text style={styles.hint}>{issuedQty} {p.unit} issued</Text>
                        </View>
                        {p.unit_type ? (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                            {(p.issued_serials ?? []).map((sn) => {
                              const on = (giveBack?.back[p.id] ?? []).includes(sn);
                              return (
                                <Pressable key={sn} onPress={() => setGiveBack((g) => g && { ...g, back: { ...g.back, [p.id]: on ? (g.back[p.id] ?? []).filter((x) => x !== sn) : [...(g.back[p.id] ?? []), sn] } })} style={[styles.serial, on && styles.serialOn]}>
                                  <Text style={[styles.hint, on && { color: "#fff" }]}>{on ? "↩ " : ""}{sn}</Text>
                                </Pressable>
                              );
                            })}
                            {(p.issued_serials ?? []).length === 0 ? <Text style={styles.hint}>No serials recorded.</Text> : <Text style={styles.hint}>Tap the serials going back.</Text>}
                          </View>
                        ) : (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={styles.hint}>Used</Text>
                            <TextInput style={[styles.input, { width: 86 }]} keyboardType="number-pad" value={giveBack?.used[p.id] ?? String(issuedQty)} onChangeText={(t) => setGiveBack((g) => g && { ...g, used: { ...g.used, [p.id]: t } })} />
                            <Text style={styles.hint}>of {issuedQty} {p.unit}</Text>
                          </View>
                        )}
                        <Text style={[styles.hint, back > 0 && { color: "#b45309" }]}>
                          {back > 0 ? `${back} ${p.unit} going back${p.unit_type ? "" : " to the store"}` : "Nothing going back"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setGiveBack(null)} />
                <Button title="Return unused components" small loading={busy === "return"} onPress={returnParts} />
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
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingRight: spacing.md, backgroundColor: colors.bg },
  qtyInput: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.body, color: colors.text, fontFamily: "Urbanist_500Medium" },
  settle: { gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  serial: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.secondary },
  serialOn: { backgroundColor: colors.primary },
  withdraw: { fontSize: font.sm, fontWeight: "700", color: colors.danger },
});
