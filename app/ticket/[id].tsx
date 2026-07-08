import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { toast } from "@/lib/toast";

import {
  Avatar, Button, Card, Loading, PriorityBadge, Row, SectionHeader, StatusPill, labelize,
} from "@/components/ui";
import { colors, font, radius, shadow, spacing } from "@/constants/theme";
import api from "@/lib/api";
import { timeAgo, mediaUrl } from "@/lib/format";
import { Ticket, User } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

const MANAGER_ROLES = ["super_admin", "ops_manager", "supervisor"];

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  // modals
  const [completion, setCompletion] = useState<{ notes: string; photos: string[] } | null>(null);
  const [reason, setReason] = useState<{ status?: string; review?: "reject"; title: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.allSettled([api.get(`/tickets/${id}/`), getCurrentUser()]);
      if (t.status === "fulfilled") setTicket(t.value.data);
      if (u.status === "fulfilled") setMe(u.value);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const perms = useMemo(() => {
    if (!ticket || !me) return { isAssignee: false, isReviewer: false };
    return {
      isAssignee: ticket.assigned_to === me.id,
      isReviewer: ticket.reported_by === me.id || MANAGER_ROLES.includes(me.role),
    };
  }, [ticket, me]);

  async function transition(status: string, notes = "") {
    setBusy(true);
    try {
      await api.post(`/tickets/${id}/transition/`, { status, notes });
      toast.success(`Moved to ${labelize(status)}`);
      setReason(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.notes || "Action failed");
    } finally { setBusy(false); }
  }

  async function submitCompletion() {
    if (!completion?.notes.trim()) { toast.error("Please add completion notes"); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append("completion_notes", completion.notes);
    completion.photos.forEach((uri, i) => {
      fd.append("images", { uri, name: `evidence_${i}.jpg`, type: "image/jpeg" } as any);
      fd.append("captions", "");
    });
    try {
      await api.post(`/tickets/${id}/submit-completion/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Submitted for review");
      setCompletion(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Submission failed");
    } finally { setBusy(false); }
  }

  async function review(action: "approve" | "reject", comments = "") {
    setBusy(true);
    try {
      await api.post(`/tickets/${id}/review/`, { action, comments });
      toast.success(action === "approve" ? "Ticket approved" : "Ticket rejected");
      setReason(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Review failed");
    } finally { setBusy(false); }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${id}/comments/`, { content: comment });
      setComment("");
      await load();
    } catch { toast.error("Could not post comment"); }
    finally { setBusy(false); }
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) {
      setCompletion((c) => c ? { ...c, photos: [...c.photos, res.assets[0].uri] } : c);
    }
  }

  if (loading) return <><Stack.Screen options={{ title: "Ticket" }} /><Loading /></>;
  if (!ticket) return <><Stack.Screen options={{ title: "Ticket" }} /><View style={styles.center}><Text>Ticket not found.</Text></View></>;

  const s = ticket.status;
  const actions = buildActions(s, perms);

  return (
    <>
      <Stack.Screen options={{ title: `#${String(ticket.id).slice(0, 8)}` }} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleRow}>
            <StatusPill status={s} />
            <PriorityBadge priority={ticket.priority} />
          </View>
          <Text style={styles.title}>{ticket.title}</Text>

          {/* Details */}
          <Card style={{ marginTop: spacing.md }}>
            <Row label="Category" value={labelize(ticket.category)} />
            <Row label="Site" value={ticket.site_name || "—"} />
            <Row label="Asset" value={ticket.device_code || "—"} />
            <Row label="Assigned to" value={ticket.assigned_to_name || "Unassigned"} />
            <Row label="Reported by" value={ticket.reported_by_name || "—"} />
            <Row label="Due date" value={ticket.due_date || "—"} />
          </Card>

          {ticket.description ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Description</Text>
              <Text style={styles.body}>{ticket.description}</Text>
            </View>
          ) : null}

          {ticket.hold_reason ? <Note tone="hold" icon="pause-circle" title="On hold" text={ticket.hold_reason} /> : null}
          {ticket.blocked_reason ? <Note tone="block" icon="alert-circle" title="Blocked" text={ticket.blocked_reason} /> : null}
          {ticket.review_comments && s === "rejected" ? <Note tone="block" icon="close-circle" title="Rejected — feedback" text={ticket.review_comments} /> : null}

          {/* Attachments */}
          {ticket.attachments && ticket.attachments.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Photos ({ticket.attachments.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {ticket.attachments.map((a) => (
                  <Image key={a.id} source={{ uri: mediaUrl(a.file) }} style={styles.thumb} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Activity */}
          <SectionHeader title="Activity" />
          {(ticket.comments ?? []).length === 0 ? (
            <Text style={styles.muted}>No activity yet.</Text>
          ) : (
            (ticket.comments ?? []).map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Avatar name={c.author_name} size={34} />
                <View style={styles.commentBody}>
                  <View style={styles.commentHead}>
                    <Text style={styles.commentAuthor}>{c.author_name || "System"}</Text>
                    <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                  </View>
                  {c.comment_type === "status_change" && c.new_status ? (
                    <Text style={styles.systemText}>changed status to <Text style={{ fontWeight: "700" }}>{labelize(c.new_status)}</Text></Text>
                  ) : null}
                  {c.content ? <Text style={styles.commentText}>{c.content}</Text> : null}
                </View>
              </View>
            ))
          )}

          {/* Add comment */}
          <View style={styles.commentInputRow}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Write a comment…"
              placeholderTextColor={colors.textLight}
              style={styles.commentInput}
              multiline
            />
            <Pressable onPress={addComment} disabled={busy || !comment.trim()} style={[styles.sendBtn, (!comment.trim() || busy) && { opacity: 0.4 }]}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </ScrollView>

        {/* Action bar */}
        {actions.length > 0 && (
          <View style={styles.actionBar}>
            {actions.map((a) => (
              <Button
                key={a.key}
                title={a.label}
                icon={a.icon}
                variant={a.variant}
                small={actions.length > 1}
                style={{ flexGrow: 1, minWidth: actions.length > 2 ? "46%" : undefined }}
                onPress={() => {
                  if (a.key === "submit") setCompletion({ notes: "", photos: [] });
                  else if (a.key === "hold") setReason({ status: "on_hold", title: "Reason for hold", text: "" });
                  else if (a.key === "block") setReason({ status: "blocked", title: "Reason for blocker", text: "" });
                  else if (a.key === "reject") setReason({ review: "reject", title: "Rejection feedback", text: "" });
                  else if (a.key === "approve") review("approve");
                  else transition(a.status!);
                }}
              />
            ))}
          </View>
        )}
      </View>

      {/* Completion modal */}
      <Modal visible={!!completion} animationType="slide" transparent onRequestClose={() => setCompletion(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Submit for Review</Text>
              <Pressable onPress={() => setCompletion(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={styles.label}>Completion notes</Text>
            <TextInput
              value={completion?.notes}
              onChangeText={(t) => setCompletion((c) => c ? { ...c, notes: t } : c)}
              placeholder="Describe the work done…"
              placeholderTextColor={colors.textLight}
              multiline
              style={[styles.input, { height: 90 }]}
            />
            <Text style={styles.label}>Photo evidence</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}>
              {completion?.photos.map((uri, i) => <Image key={i} source={{ uri }} style={styles.thumb} />)}
              <Pressable style={styles.addPhoto} onPress={pickPhoto}>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            </ScrollView>
            <Button title="Submit for Review" icon="checkmark-done" variant="success" loading={busy} onPress={submitCompletion} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reason modal */}
      <Modal visible={!!reason} animationType="slide" transparent onRequestClose={() => setReason(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{reason?.title}</Text>
              <Pressable onPress={() => setReason(null)}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <TextInput
              value={reason?.text}
              onChangeText={(t) => setReason((r) => r ? { ...r, text: t } : r)}
              placeholder="Enter details…"
              placeholderTextColor={colors.textLight}
              multiline
              style={[styles.input, { height: 90 }]}
            />
            <Button
              title="Confirm"
              variant={reason?.review ? "danger" : "primary"}
              loading={busy}
              onPress={() => {
                if (!reason?.text.trim()) { toast.error("Please enter a reason"); return; }
                if (reason.review === "reject") review("reject", reason.text);
                else transition(reason!.status!, reason!.text);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

type Act = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; variant: any; status?: string };
function buildActions(s: string, p: { isAssignee: boolean; isReviewer: boolean }): Act[] {
  const a: Act[] = [];
  if (s === "open" && (p.isAssignee || p.isReviewer)) a.push({ key: "start", label: "Start Work", icon: "play", variant: "primary", status: "in_progress" });
  if ((s === "in_progress" || s === "alignment_pending") && p.isAssignee) {
    a.push({ key: "submit", label: "Submit for Review", icon: "checkmark-done", variant: "success" });
    if (s === "in_progress") a.push({ key: "align", label: "Alignment", icon: "git-compare", variant: "secondary", status: "alignment_pending" });
    a.push({ key: "hold", label: "On Hold", icon: "pause", variant: "secondary" });
    a.push({ key: "block", label: "Blocked", icon: "alert", variant: "danger" });
  }
  if ((s === "on_hold" || s === "blocked" || s === "rejected") && p.isAssignee) a.push({ key: "resume", label: "Resume Work", icon: "play", variant: "primary", status: "in_progress" });
  if (s === "pending_review" && p.isReviewer) {
    a.push({ key: "approve", label: "Approve", icon: "checkmark-circle", variant: "success" });
    a.push({ key: "reject", label: "Reject", icon: "close-circle", variant: "danger" });
  }
  if (s === "approved" && p.isReviewer) a.push({ key: "close", label: "Close Ticket", icon: "lock-closed", variant: "primary", status: "closed" });
  return a;
}

function Note({ tone, icon, title, text }: { tone: "hold" | "block"; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const bg = tone === "hold" ? "#eef1f5" : colors.dangerSoft;
  const fg = tone === "hold" ? colors.textMuted : colors.danger;
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.noteTitle, { color: fg }]}>{title}</Text>
        <Text style={styles.noteText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, paddingBottom: 120 },
  titleRow: { flexDirection: "row", gap: spacing.sm },
  title: { fontSize: font.h2, fontWeight: "800", color: colors.text, marginTop: spacing.sm, lineHeight: 26 },
  block: { marginTop: spacing.lg },
  blockTitle: { fontSize: font.sm, fontWeight: "700", color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  muted: { fontSize: font.sm, color: colors.textLight },
  note: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  noteTitle: { fontSize: font.sm, fontWeight: "800" },
  noteText: { fontSize: font.sm, color: colors.text, marginTop: 2, lineHeight: 19 },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: "#e9edf3" },
  commentRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  commentBody: { flex: 1 },
  commentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  commentAuthor: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  commentTime: { fontSize: font.xs, color: colors.textLight },
  systemText: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  commentText: { fontSize: font.sm, color: colors.text, marginTop: 3, lineHeight: 20 },
  commentInputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  commentInput: { flex: 1, minHeight: 44, maxHeight: 110, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.sm, color: colors.text },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, ...shadow.card },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.h3, fontWeight: "800", color: colors.text },
  label: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  input: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontSize: font.sm, color: colors.text, marginBottom: spacing.md, textAlignVertical: "top" },
  addPhoto: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  addPhotoText: { fontSize: font.xs, color: colors.primary, fontWeight: "600" },
});
