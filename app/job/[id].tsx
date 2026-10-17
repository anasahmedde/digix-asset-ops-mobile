import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FlowStep, Note, PresenceCard, Section, Wash } from "@/components/field";
import { OutboxBanner } from "@/components/outbox-banner";
import { ScanSheet } from "@/components/scan-sheet";
import { Text } from "@/components/text";
import { Button, Card, FieldLabel, Pill, Row, Select } from "@/components/ui";
import { colors, font, radius, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { Presence, checkIn, checkOut, getPresence, onSite } from "@/lib/attendance";
import { formatDate, mediaUrl } from "@/lib/format";
import { getCurrentLocation, requestForegroundLocationPermission } from "@/lib/location";
import { Op, QUEUED_NOTE, cached, discard, isNetworkError, pendingFor, submit } from "@/lib/offline";
import { asFile, asUpload, pickFromLibrary, takePhoto } from "@/lib/photos";
import * as SecureStore from "@/lib/secure-store";
import { toast } from "@/lib/toast";
import { getCurrentUser } from "@/lib/user";

/**
 * A maintenance job on the phone, start to finish: the components it needs
 * (asked for, approved, issued - before setting off), check in, scan the
 * asset, Before photo, start, the work, After photo, check out (which hands
 * the visit in for review), and back at the store say what was used: the
 * rest goes to receiving. If the office does not approve it, the job comes
 * back as a new visit; every earlier one is logged in full at the bottom.
 */
interface Schedule {
  id: string; title: string; description?: string; maintenance_type: "preventive" | "corrective"; status: string; status_display: string;
  priority: string; device: string | null; device_code: string | null; device_name: string | null;
  site: string | null; site_name: string | null; assigned_to: string | null; assigned_to_name: string | null;
  current_technician_name?: string | null;
  ticket: string | null; ticket_number: string | null; ticket_description?: string | null; next_due?: string | null;
}
interface VisitPhoto { id: string; kind: string; image: string; caption: string }
/** Bought on site, with the receipt and a photo of the part. */
interface Purchase {
  id: string; description: string; quantity: number; amount: string; shop: string;
  receipt: string; photo: string; bought_by: string | null; bought_by_name: string | null; created_at: string;
}
type Upload = ReturnType<typeof asUpload>;
interface Visit {
  id: string; sequence: number; status: string; status_display: string; assigned_to: string | null; due_date: string | null;
  assigned_to_name?: string | null;
  helpers?: string[]; helper_names?: string[];
  started_at: string | null; completed_at: string | null; remarks: string; notes?: string; resolved: boolean | null;
  asset_verified_at: string | null;
  review_decision: string | null; review_decision_display?: string; review_reason?: string; review_note: string | null;
  reviewed_by_name?: string | null; reviewed_at?: string | null;
  visit_photos: VisitPhoto[]; has_before_photo: boolean; has_after_photo: boolean;
  purchases?: Purchase[];
  /** When the technician checked in for it and out after it. */
  on_site?: { checked_in_at: string; checked_out_at: string | null; offline: boolean } | null;
}
interface Part {
  id: string; what: string; unit: string; item: string | null; unit_type: string | null; quantity_requested: number; quantity_approved: number | null;
  status: string; status_display: string; issue_status: string | null; quantity_issued: number | null; issued_serials: string[];
  quantity_used: number | null; quantity_returned: number | null; visit: string | null; decision_note?: string;
  return_reference?: string | null; issue_number?: string | null;
}
/** A component the store keeps, listed the way the web's picker lists it. */
interface StockOption { id: string; kind: "item" | "product"; name: string; unit: string; label: string }

const when = (iso?: string | null) => (iso
  ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
  : "—");
const money = (n: number) => `PKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One earlier visit, as it happened: who, when, what was found and done, what it used, and what the office said. */
function VisitLog({ v, parts, corrective }: { v: Visit; parts: Part[]; corrective: boolean }) {
  const used = parts.filter((p) => p.visit === v.id && p.quantity_used != null);
  const bought = v.purchases ?? [];
  const outcome = v.review_decision === "accepted" ? { fg: "#047857", bg: colors.successSoft }
    : v.review_decision === "unresolved" ? { fg: "#b45309", bg: colors.warningSoft }
    : { fg: colors.textMuted, bg: colors.secondary };
  return (
    <Card style={{ marginTop: spacing.sm, gap: 2 }}>
      <View style={styles.headRow}>
        <Text style={[styles.partName, { flex: 1, fontSize: font.body }]}>Visit {v.sequence}</Text>
        <Pill label={v.review_decision_display || v.status_display} fg={outcome.fg} bg={outcome.bg} />
      </View>
      <Row label="Technician" value={v.assigned_to_name ?? "—"} />
      <Row label="Due on" value={formatDate(v.due_date)} />
      <Row label="Checked in" value={when(v.on_site?.checked_in_at)} />
      {v.asset_verified_at ? <Row label="Asset scanned" value={when(v.asset_verified_at)} /> : null}
      <Row label="Started" value={when(v.started_at)} />
      <Row label="Finished" value={when(v.completed_at)} />
      <Row label="Checked out" value={when(v.on_site?.checked_out_at)} />
      {v.on_site?.offline ? <Text style={styles.hint}>Recorded without signal and uploaded later.</Text> : null}
      {corrective && v.resolved !== null ? (
        <Row label="Technician's verdict" value={v.resolved ? "Fault fixed" : "Not fixed"} />
      ) : null}
      {v.remarks || v.notes ? (
        <View style={styles.logBlock}>
          <FieldLabel>Work done</FieldLabel>
          <Text style={styles.logText}>{v.remarks || v.notes}</Text>
        </View>
      ) : null}
      {v.visit_photos.length ? (
        <View style={[styles.logBlock, styles.photoGrid]}>
          {v.visit_photos.map((p) => (
            <View key={p.id}>
              <Image source={{ uri: mediaUrl(p.image) }} style={styles.logPhoto} />
              <Text style={styles.photoTag}>{p.kind}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {used.length ? (
        <View style={styles.logBlock}>
          <FieldLabel>Components used</FieldLabel>
          {used.map((p) => (
            <Text key={p.id} style={styles.logText}>
              {p.what} · {p.quantity_used} {p.unit} used
              {(p.quantity_returned ?? 0) > 0 ? `, ${p.quantity_returned} back on ${p.return_reference}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
      {bought.length ? (
        <View style={styles.logBlock}>
          <FieldLabel>Bought on site</FieldLabel>
          {bought.map((p) => (
            <Text key={p.id} style={styles.logText}>
              {p.description} × {p.quantity} · {money(Number(p.amount))}{p.shop ? ` · ${p.shop}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
      {v.review_decision ? (
        <View style={styles.logBlock}>
          <FieldLabel>Office review</FieldLabel>
          <Text style={styles.logText}>
            {v.review_decision_display}{v.reviewed_by_name ? ` - ${v.reviewed_by_name}` : ""}{v.reviewed_at ? `, ${when(v.reviewed_at)}` : ""}
          </Text>
          {v.review_reason || v.review_note ? <Text style={styles.hint}>{v.review_reason || v.review_note}</Text> : null}
        </View>
      ) : v.status === "awaiting_review" ? (
        <Text style={[styles.hint, styles.logBlock]}>Waiting for the office to review the work.</Text>
      ) : null}
    </Card>
  );
}

const PART_TONE: Record<string, { fg: string; bg: string }> = {
  requested: { fg: "#b45309", bg: colors.warningSoft }, approved: { fg: "#1e40af", bg: colors.infoSoft },
  rejected: { fg: "#991b1b", bg: colors.dangerSoft }, cancelled: { fg: colors.textMuted, bg: colors.secondary },
};

/** What this phone did on the job without signal, shown as if it had happened. */
function overlay(visits: Visit[], parts: Part[], waiting: Op[]): { visits: Visit[]; parts: Part[] } {
  const vs = visits.map((v) => ({ ...v, visit_photos: [...(v.visit_photos ?? [])], purchases: [...(v.purchases ?? [])] }));
  const ps = parts.map((p) => ({ ...p }));
  for (const op of waiting) {
    const v = vs.find((x) => x.id === op.meta?.visit);
    if (!v) continue;
    const file = (field: string) => op.form?.files.find((f) => f.field === field)?.uri ?? "";
    if (op.kind === "verify") v.asset_verified_at = op.at;
    else if (op.kind === "photo") {
      const kind = String(op.meta?.kind);
      if (kind === "before") v.has_before_photo = true;
      if (kind === "after") {
        v.has_after_photo = true;
        if (op.meta?.notes !== undefined) v.notes = String(op.meta.notes);
      }
      v.visit_photos.push({ id: op.id, kind, image: file("image"), caption: "" });
    } else if (op.kind === "start") { v.status = "in_progress"; v.started_at = op.at; }
    else if (op.kind === "notes") v.notes = String(op.meta?.notes ?? "");
    else if (op.kind === "complete") {
      v.status = "awaiting_review"; v.completed_at = op.at; v.remarks = String(op.meta?.remarks ?? "");
      if (op.meta && "resolved" in op.meta) v.resolved = op.meta.resolved as boolean | null;
    } else if (op.kind === "purchase") {
      v.purchases.push({ ...(op.meta?.purchase as Purchase), id: op.id, receipt: file("receipt"), photo: file("photo"), created_at: op.at });
    } else if (op.kind === "return") {
      for (const row of (op.meta?.rows ?? []) as { part_request: string; used: number }[]) {
        const p = ps.find((x) => x.id === row.part_request);
        if (p) { p.quantity_used = row.used; p.quantity_returned = (p.quantity_issued ?? 0) - row.used; }
      }
    }
  }
  return { visits: vs, parts: ps };
}

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
  // Without signal the screen shows the job as last loaded, plus what is waiting.
  const [stale, setStale] = useState(false);
  const [waitingIds, setWaitingIds] = useState<Set<string>>(new Set());
  // The web's "Components for this visit" form: Kind, Component, Quantity.
  const [partForm, setPartForm] = useState<{ kind: "generic" | "unique"; pick: string; qty: string } | null>(null);
  const [stock, setStock] = useState<StockOption[] | null>(null);
  // The Check out sheet: is it fixed (when it hands the visit in), and was anything bought?
  const [leaving, setLeaving] = useState<{ resolved: boolean | null } | null>(null);
  const [giveBack, setGiveBack] = useState<{ used: Record<string, string>; back: Record<string, string[]> } | null>(null);
  // Bought on site: the form, and the question asked at check-out.
  const [buy, setBuy] = useState<{
    description: string; quantity: string; amount: string; shop: string;
    receipt: Upload | null; receiptName: string; photo: Upload | null;
  } | null>(null);
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
        cached(`job-${id}`, async () => (await api.get(`/maintenance/schedules/${id}/`)).data as Schedule),
        cached(`job-${id}-visits`, async () => {
          const { data } = await api.get("/maintenance/visits/", { params: { schedule: id, ordering: "sequence", page_size: 50 } });
          return (data.results ?? data) as Visit[];
        }),
        cached(`job-${id}-parts`, async () => {
          const { data } = await api.get("/maintenance/part-requests/", { params: { schedule: id, page_size: 100 } });
          return (data.results ?? data) as Part[];
        }),
        getPresence(),
      ]);
      const waiting = await pendingFor(`job:${id}`);
      setWaitingIds(new Set(waiting.map((o) => o.id)));
      if (s.status === "fulfilled") { setJob(s.value.data); setStale(!s.value.fresh); }
      if (v.status === "fulfilled") {
        const shown = overlay(v.value.data, p.status === "fulfilled" ? p.value.data : [], waiting);
        const rows = shown.visits;
        setVisits(rows);
        if (p.status === "fulfilled") setParts(shown.parts);
        // The write-up is the open visit's own, not the job's description.
        const open = [...rows].reverse().find((x) => x.status !== "completed" && x.status !== "skipped");
        setNotes((n) => n || open?.notes || "");
      }
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
    if (isNetworkError(err)) { toast.error("No signal. This one needs a connection - try again when you have one."); return; }
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
  // A helper: on the visit to check in and out; the technician works it.
  const helping = !!me && !mine && !!current?.helpers?.includes(me.id);
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
  // Work done is the write-up and the After photo together: both are
  // needed to get past it, and the server refuses completion without them.
  const written = !!current?.notes?.trim();
  const workDone = after && written;
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
  // Check out opens as soon as Work done is in: it hands the visit in for
  // review on the way out. The office decides after; not approved, the job
  // comes back as a new visit.
  const stage = closed ? 0
    : awaiting ? (here ? 7 : issued.length ? 8 : 9)
    : !componentsDone ? 1
    : !here ? 2
    : !verified ? 3
    : !before ? 4
    : !started ? 5
    : !workDone ? 6
    : 7;

  // -- actions
  const said = (queued: boolean, done: string) => toast.success(queued ? `${done}. ${QUEUED_NOTE}` : done);
  const clockIn = () => run("presence", async () => {
    if (!job.site) throw new Error("no site");
    const p = await checkIn(job.site, "", job.site_name);
    setPresence(p);
    said(!!p.queued, "Checked in");
  }, "This job has no site to check in at");
  const clockOut = () => run("presence", async () => {
    const p = await checkOut(job.site);
    setPresence(p);
    said(!!p.queued, "Checked out");
  }, "Could not check out");
  // Leaving the site. With the work done it hands the visit in as well;
  // first: is it fixed, and was anything bought for this job?
  const corrective = job.maintenance_type === "corrective";
  const handIn = !!current && started && workDone;
  const askOnCheckout = () => { if (mine && current && !closed) setLeaving({ resolved: null }); else clockOut(); };
  const leave = () => {
    if (!leaving || !current) return;
    if (handIn && corrective && leaving.resolved === null) { toast.error("Is the fault fixed?"); return; }
    const f = leaving;
    setLeaving(null);
    run("presence", async () => {
      let queued = false;
      if (handIn) {
        const remarks = notes.trim() || current.notes?.trim() || "";
        const r = await submit({
          kind: "complete", scope: `job:${id}`, label: "Complete visit",
          method: "post", url: `/maintenance/visits/${current.id}/complete/`,
          json: { remarks, ...(corrective ? { resolved: f.resolved } : {}) },
          meta: { visit: current.id, remarks, ...(corrective ? { resolved: f.resolved } : {}) },
        });
        queued = r.queued;
      }
      const p = await checkOut(job.site);
      setPresence(p);
      said(queued || !!p.queued, !handIn ? "Checked out"
        : issued.length ? "Checked out and sent for review · now return unused components" : "Checked out and sent for review");
    }, "Could not check out");
  };
  const openBuy = () => {
    setBuy({ description: "", quantity: "1", amount: "", shop: "", receipt: null, receiptName: "", photo: null });
  };
  const saveBuy = () => {
    if (!buy || !current) return;
    if (!buy.description.trim()) { toast.error("Say what you bought"); return; }
    const amount = Number(buy.amount);
    if (!amount || amount <= 0) { toast.error("Enter the amount on the receipt"); return; }
    if (!buy.receipt) { toast.error("Add the receipt"); return; }
    if (!buy.photo) { toast.error("Take a photo of the component"); return; }
    const f = buy;
    setBuy(null);
    run("buy", async () => {
      const quantity = Math.max(1, Number(f.quantity) || 1);
      const r = await submit({
        kind: "purchase", scope: `job:${id}`, label: `Purchase: ${f.description.trim()}`,
        method: "post", url: "/maintenance/purchases/",
        form: {
          fields: {
            visit: current.id, description: f.description.trim(), quantity: String(quantity),
            amount: amount.toFixed(2), ...(f.shop.trim() ? { shop: f.shop.trim() } : {}),
          },
          files: [
            { ...(f.receipt as unknown as { uri: string; name: string; type: string }), field: "receipt" },
            { ...(f.photo as unknown as { uri: string; name: string; type: string }), field: "photo" },
          ],
        },
        meta: {
          visit: current.id,
          purchase: { description: f.description.trim(), quantity, amount: amount.toFixed(2), shop: f.shop.trim(), bought_by: me?.id ?? null, bought_by_name: null },
        },
      });
      said(r.queued, "Purchase recorded");
    }, "Could not record the purchase");
  };
  const removeBuy = (p: Purchase) => run(`buy-${p.id}`, async () => {
    // Still on the phone: it simply never goes.
    if (waitingIds.has(p.id)) await discard(p.id);
    else await api.delete(`/maintenance/purchases/${p.id}/`);
    toast.success("Purchase taken back");
  }, "Could not take the purchase back");
  const photo = (kind: "before" | "after", withNotes?: string) => run(kind, async () => {
    if (!current) return;
    const a = await takePhoto();
    if (!a) return;
    const fields: Record<string, string> = { kind };
    if (withNotes !== undefined) fields.notes = withNotes;
    try {
      if (await requestForegroundLocationPermission()) {
        const l = await getCurrentLocation();
        fields.latitude = l.latitude.toFixed(7); fields.longitude = l.longitude.toFixed(7);
      }
    } catch { /* no fix, no matter */ }
    const r = await submit({
      kind: "photo", scope: `job:${id}`, label: kind === "before" ? "Before photo" : "After photo",
      method: "post", url: `/maintenance/visits/${current.id}/photos/`,
      form: { fields, files: [asFile(a, "image", `${kind}.jpg`)] },
      meta: { visit: current.id, kind, ...(withNotes !== undefined ? { notes: withNotes } : {}) },
    });
    said(r.queued, kind === "before" ? "Before photo added" : "After photo added");
  }, "Could not upload that photo");
  const tone = (s: string) => PART_TONE[s] ?? { fg: colors.textMuted, bg: colors.secondary };
  const verify = (code: string) => {
    setScan(false);
    run("verify", async () => {
      if (!current) return;
      // Without signal the label is checked here, against the asset this job
      // was loaded with; the server checks it again when it uploads.
      const r = await submit({
        kind: "verify", scope: `job:${id}`, label: `Scan ${job.device_code ?? "asset"}`,
        method: "post", url: `/maintenance/visits/${current.id}/verify-asset/`, json: { code }, meta: { visit: current.id },
      }, {
        whenQueued: () => (code.trim().toUpperCase() === (job.device_code ?? "").toUpperCase()
          ? null : `That label reads ${code.trim()}, not ${job.device_code}`),
      });
      said(r.queued, `${job.device_code} confirmed`);
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
    const r = await submit({
      kind: "start", scope: `job:${id}`, label: "Start work",
      method: "post", url: `/maintenance/visits/${current.id}/start/`, json: where, meta: { visit: current.id },
    });
    said(r.queued, "Work started");
  }, "Could not start this visit");
  const saveNotes = () => run("notes", async () => {
    if (!current) return;
    const r = await submit({
      kind: "notes", scope: `job:${id}`, label: "Work done",
      method: "post", url: `/maintenance/visits/${current.id}/notes/`, json: { notes }, meta: { visit: current.id, notes },
    });
    said(r.queued, "Saved");
  }, "Could not save the work done");
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
    // A refused list says so, rather than reading as an empty store.
    const refused = [items, products].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (refused) fail(refused.reason, "Could not load the stock list");
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
      const r = await submit({
        kind: "return", scope: `job:${id}`, label: "Return unused components",
        method: "post", url: `/maintenance/visits/${current.id}/return-parts/`, json: { parts_settlement: rows },
        meta: { visit: current.id, rows },
      });
      const grn = (r.data as { return_grn?: string } | undefined)?.return_grn;
      said(r.queued, grn ? `Going back to the store · ${grn}` : r.queued ? "Return recorded" : "Nothing going back");
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
          <OutboxBanner scope={`job:${id}`} />
          {stale ? (
            <Note tone="warn">No signal. This is the job as it was last loaded; what you do now is saved on this phone and uploads with its time when there is signal.</Note>
          ) : null}
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
            {(current?.helper_names ?? []).length ? <Row label="Helpers" value={current!.helper_names!.join(", ")} /> : null}
            {current ? <Row label="Visit" value={`#${current.sequence}`} /> : null}
            {current?.due_date ? <Row label="Due on" value={current.due_date} /> : null}
            {job.ticket_description ? <Text style={[styles.hint, { marginTop: 8 }]}>{job.ticket_description}</Text> : null}
          </Card>
          {job.ticket ? <Pressable onPress={() => router.push(`/ticket/${job.ticket}`)} style={styles.linkRow}><Ionicons name="reader-outline" size={15} color={colors.primary} /><Text style={styles.link}>Open ticket {job.ticket_number}</Text></Pressable> : null}

          <PresenceCard
            presence={presence} site={job.site} siteName={job.site_name ?? "the site"} mine={mine || helping} busy={busy === "presence"}
            onCheckIn={clockIn} onCheckOut={helping ? clockOut : askOnCheckout}
            lockedReason={mine && !componentsDone && !here ? "Components for this visit come first (step 1). Check-in opens once they are issued, or none are needed." : undefined}
          />
          <ScanSheet open={scan} expect={job.device_code ?? ""} onScan={verify} onClose={() => setScan(false)} />

          {closed ? <Note>This job is {job.status_display.toLowerCase()}.</Note> : null}
          {current && past[past.length - 1]?.review_decision === "unresolved" ? (
            <Note tone="bad">
              Visit {past[past.length - 1].sequence} was not approved{past[past.length - 1].review_reason ? `: ${past[past.length - 1].review_reason?.trim().replace(/\.+$/, "")}` : ""}. This is visit {current.sequence}; the earlier one is under Visit details below.
            </Note>
          ) : null}

          {helping ? (
            <Note>You are helping {job.current_technician_name || "the technician"} on this visit. Check in when you reach {job.site_name ?? "the site"} and check out when you leave; {job.current_technician_name || "the technician"} records the work.</Note>
          ) : (<>
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
            <FlowStep n={6} title="Work done" state={workDone || awaiting ? "done" : stage === 6 ? "now" : "later"}>
              {(started || awaiting) ? (
                <>
                  <TextInput style={[styles.input, { height: 84, textAlignVertical: "top" }]} multiline editable={canAct && started && !workDone} placeholder={job.maintenance_type === "corrective" ? "What was done" : "What was checked, cleaned or replaced, and anything observed"} placeholderTextColor={colors.textLight} value={notes} onChangeText={setNotes} />
                  {canAct && started && !workDone ? (
                    <>
                      <Text style={styles.hint}>Both are needed before you check out: what was done, and the After photo.</Text>
                      <Button
                        title={after ? "Save work done" : "Save and take the After photo"}
                        icon={after ? "checkmark" : "camera"}
                        loading={busy === "after" || busy === "notes"}
                        onPress={() => {
                          if (!notes.trim()) { toast.error("Say what was done first"); return; }
                          if (after) saveNotes(); else photo("after", notes.trim());
                        }}
                      />
                    </>
                  ) : null}
                  {workDone ? <Text style={styles.hint}>Saved with the After photo.</Text> : null}
                </>
              ) : null}
            </FlowStep>
            <FlowStep n={7} title="Check out" state={(awaiting && !here) || closed ? "done" : stage === 7 ? "now" : "later"}>
              {stage === 7 && mine && here ? (
                <>
                  {!awaiting ? <Text style={styles.hint}>Hands the visit in for review with the Work done and the After photo, and checks you out.</Text> : null}
                  <Button title="Check out" icon="log-out-outline" variant="success" loading={busy === "presence"} onPress={askOnCheckout} />
                </>
              ) : null}
            </FlowStep>
            {hadIssued ? (
              <FlowStep n={8} title="Return unused components" state={issued.length === 0 ? "done" : stage === 8 ? "now" : "later"}>
                {issued.length > 0 && mine && current && (started || awaiting) ? (
                  <>
                    <Text style={styles.hint}>
                      {stage === 8
                        ? "Say what was used. Anything else goes back to the store and waits in receiving to be checked in."
                        : "After check-out: say what was used. Anything else goes back to the store."}
                    </Text>
                    {stage === 8 ? <Button title="Return unused components" icon="return-down-back-outline" loading={busy === "return"} onPress={() => setGiveBack({ used: {}, back: {} })} /> : null}
                  </>
                ) : null}
                {issued.length === 0 ? <Text style={styles.hint}>Accounted for: see the lines in step 1.</Text> : null}
              </FlowStep>
            ) : null}
            <FlowStep n={hadIssued ? 9 : 8} title="Office review" state={closed ? "done" : awaiting ? "now" : "later"}>
              {awaiting ? <Text style={styles.hint}>Waiting for the office to review the work. If it is not approved, the job comes back as a new visit.</Text> : null}
            </FlowStep>
          </Section>

          {/* Bought on site */}
          {current ? (
            <Section title="Bought on site">
              {(current.purchases ?? []).length === 0 ? (
                <Text style={styles.hint}>Nothing bought on site for this visit.</Text>
              ) : (current.purchases ?? []).map((p) => (
                <View key={p.id} style={styles.part}>
                  <Image source={{ uri: mediaUrl(p.photo) }} style={styles.buyThumb} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.partName}>{p.description}</Text>
                    <Text style={styles.hint}>
                      {p.quantity} · PKR {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {p.shop ? ` · ${p.shop}` : ""}
                    </Text>
                    <Text style={styles.hint}>{p.bought_by_name ?? ""}{p.created_at ? ` · ${new Date(p.created_at).toLocaleString()}` : ""}</Text>
                  </View>
                  {mine && !closed && current.status !== "completed" && me?.id === p.bought_by ? (
                    <Pressable onPress={() => removeBuy(p)} hitSlop={8}><Text style={styles.withdraw}>Remove</Text></Pressable>
                  ) : null}
                </View>
              ))}
              {mine && !closed ? (
                <Button title="Record a purchase" small variant="secondary" icon="cart-outline" loading={busy === "buy"} onPress={openBuy} />
              ) : null}
            </Section>
          ) : null}

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
              {[...past].reverse().map((v) => <VisitLog key={v.id} v={v} parts={parts} corrective={corrective} />)}
            </Section>
          ) : null}
          </>)}
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

        {/* Check out: hands the visit in when the work is done, and asks about purchases */}
        <Modal visible={!!leaving && !buy} transparent animationType="slide" onRequestClose={() => setLeaving(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Check out</Text>
              {handIn ? (
                <Text style={styles.hint}>
                  The visit goes to the office for review with what you wrote under Work done and the After photo. If it is not approved, the job comes back as a new visit.
                  {issued.length ? " Unused components go back after you check out." : ""}
                </Text>
              ) : started ? (
                <Note tone="warn">Work done is not finished, so this visit stays In Progress. Check in again to finish it.</Note>
              ) : null}
              {handIn && corrective ? (
                <View>
                  <FieldLabel>Is the fault fixed?</FieldLabel>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button title="Yes, it is fixed" small style={{ flex: 1 }} variant={leaving?.resolved === true ? "success" : "secondary"} icon="checkmark" onPress={() => setLeaving((f) => f && { ...f, resolved: true })} />
                    <Button title="No, it is not" small style={{ flex: 1 }} variant={leaving?.resolved === false ? "danger" : "secondary"} icon="close" onPress={() => setLeaving((f) => f && { ...f, resolved: false })} />
                  </View>
                </View>
              ) : null}
              <View style={{ gap: 6 }}>
                <FieldLabel>Did you purchase anything for this job?</FieldLabel>
                <Text style={styles.hint}>A component bought in the market is recorded against the job with its receipt, the amount and a photo.</Text>
                {(current?.purchases ?? []).map((p) => (
                  <Text key={p.id} style={styles.hint}>· {p.description} × {p.quantity} — {money(Number(p.amount))}</Text>
                ))}
                <Button title={(current?.purchases ?? []).length ? "Yes, record another" : "Yes, record it"} small variant="secondary" icon="cart-outline" onPress={openBuy} />
              </View>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setLeaving(null)} />
                <Button title={(current?.purchases ?? []).length ? "That is all, check out" : "No, check out"} small variant="success" icon="log-out-outline" onPress={leave} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Record a purchase */}
        <Modal visible={!!buy} transparent animationType="slide" onRequestClose={() => setBuy(null)}>
          <View style={styles.modalWrap}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Record a purchase</Text>
              <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
                <View>
                  <FieldLabel>Component details</FieldLabel>
                  <TextInput style={styles.input} placeholder="What it is: make, model, size" placeholderTextColor={colors.textLight}
                    value={buy?.description ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, description: t })} />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ width: 96 }}>
                    <FieldLabel>Quantity</FieldLabel>
                    <TextInput style={styles.input} keyboardType="number-pad" value={buy?.quantity ?? ""}
                      onChangeText={(t) => setBuy((f) => f && { ...f, quantity: t })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel>Amount paid (PKR)</FieldLabel>
                    <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="As on the receipt" placeholderTextColor={colors.textLight}
                      value={buy?.amount ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, amount: t })} />
                  </View>
                </View>
                <View>
                  <FieldLabel>Shop</FieldLabel>
                  <TextInput style={styles.input} placeholder="Where it was bought (optional)" placeholderTextColor={colors.textLight}
                    value={buy?.shop ?? ""} onChangeText={(t) => setBuy((f) => f && { ...f, shop: t })} />
                </View>
                <View style={{ gap: 6 }}>
                  <FieldLabel>Receipt</FieldLabel>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button title="Photograph" small variant="secondary" icon="camera-outline" style={{ flex: 1 }}
                      onPress={async () => { const a = await takePhoto(); if (a) setBuy((f) => f && { ...f, receipt: asUpload(a, "receipt.jpg"), receiptName: "photo taken" }); }} />
                    <Button title="Pick a file" small variant="secondary" icon="folder-open-outline" style={{ flex: 1 }}
                      onPress={async () => { const a = await pickFromLibrary(); if (a) setBuy((f) => f && { ...f, receipt: asUpload(a, "receipt.jpg"), receiptName: a.fileName ?? "file chosen" }); }} />
                  </View>
                  {buy?.receipt ? <Text style={[styles.hint, { color: "#047857" }]}>Receipt attached: {buy.receiptName}</Text> : null}
                </View>
                <View style={{ gap: 6 }}>
                  <FieldLabel>Component photo</FieldLabel>
                  <Button title={buy?.photo ? "Retake the photo" : "Take a photo of the component"} small variant="secondary" icon="camera"
                    onPress={async () => { const a = await takePhoto(); if (a) setBuy((f) => f && { ...f, photo: asUpload(a, "component.jpg") }); }} />
                  {buy?.photo ? <Text style={[styles.hint, { color: "#047857" }]}>Photo taken</Text> : null}
                </View>
              </ScrollView>
              <Text style={styles.hint}>All four are needed: what it is, the amount, the receipt and the photo.</Text>
              <View style={styles.modalActions}>
                <Button title="Cancel" small variant="secondary" onPress={() => setBuy(null)} />
                <Button title="Save purchase" small icon="checkmark" onPress={saveBuy} />
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
  logBlock: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  logText: { fontSize: font.sm, color: colors.text, lineHeight: 19 },
  logPhoto: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  buyThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.border },
  settle: { gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  serial: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.secondary },
  serialOn: { backgroundColor: colors.primary },
  withdraw: { fontSize: font.sm, fontWeight: "700", color: colors.danger },
});
